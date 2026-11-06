# Single sign-on and Kubernetes

The `header` authentication plugin lets an SSO proxy in front of svelteRedisAdmin log people in. The
proxy (oauth2-proxy, an ingress `auth-url`, Pomerium…) authenticates the person against your identity
provider and forwards who they are in HTTP headers. svelteRedisAdmin trusts those headers only when the
request comes from the proxy.

On Kubernetes, two more pieces build on that identity:

- **Kubernetes RBAC** (`authorize` on a server): a SubjectAccessReview asks the API server whether the
  person may use the namespace the Redis lives in. People without the right get a `403`.
- **Server discovery** (`ServerDiscovery`): the Redis Services of labelled namespaces (one per merge
  request, for example) become servers on their own, with the password read from a Secret of the
  namespace, and RBAC of that namespace deciding who may use them.

Nobody types a Redis password, and the password never reaches the browser.

## How a request is handled

1. The TCP peer of the request (the proxy) must be in `auth.trustedProxies`. From any other address the
   identity headers are ignored, because anyone can send them.
2. The user header (`auth.header`) must hold a non-empty name with no control characters and no comma.
   A comma means the header arrived twice, which happens when a proxy appends instead of replacing.
3. No identity: `401 Authentication required.` (the proxy normally redirects to the sign-in page before
   that).
4. On a server page, the server must be visible to the person: the `servers` list (from
   `auth.headerServers`) for configured servers, then Kubernetes RBAC for servers with `authorize`
   ([Kubernetes RBAC](#kubernetes-rbac)). Hidden: `404`. Denied: `403`. RBAC cannot be checked: `503`.
5. The app connects with the server's `auth` / `username`, or, for a
   [discovered server](#server-discovery), with the password read from its Secret.

The headers are read again on every request: when the proxy's session ends, access ends. The signed
session cookie only caches what the headers said.

`/api/health` answers `ok` without any of this, for liveness and readiness probes.

## Configuration

```json
{
	"Servers": [{ "name": "Shared cache", "host": "redis.tools.svc", "auth": "secret" }],
	"auth": {
		"plugin": "header",
		"header": "x-auth-request-user",
		"headerGroups": "x-auth-request-groups",
		"trustedProxies": ["10.42.0.0/16"]
	},
	"cookieSecret": "a-random-string-of-32-characters-or-more"
}
```

| Key                   | Default  | Meaning                                                                                                                                                     |
| --------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.plugin`         | `config` | `header` for an SSO proxy. (`config` is the login form, `http` HTTP Basic against `login`.)                                                                 |
| `auth.header`         | none     | Header with the person's stable id (username). Required with `header`.                                                                                      |
| `auth.trustedProxies` | none     | IPs or CIDRs (IPv4 or IPv6) of the proxy. Required and non-empty with `header`, otherwise the config fails to load.                                         |
| `auth.headerGroups`   | none     | Header with the person's groups, comma separated. Only used by [Kubernetes RBAC](#kubernetes-rbac).                                                         |
| `auth.headerRole`     | none     | Header with the app role: `admin`, `rw` or `ro`. Absent or unknown: `admin`.                                                                                |
| `auth.headerServers`  | none     | Header with the configured servers the person may see, as positions in `Servers` (`0,2`). Absent: all of them. Discovered servers are decided by RBAC only. |
| `cookieSecret`        | none     | Signs the session cookie. Set a random value of 32 characters or more.                                                                                      |

`trustedProxies` is matched against the direct TCP peer. IPv4 peers on a dual-stack socket
(`::ffff:10.42.0.7`) match IPv4 entries. Behind a load balancer that also forwards, list the address the
app actually sees.

> Upgrading: the `header` plugin used to trust its headers from any peer. It now refuses to load without
> `auth.trustedProxies`.

### Roles

Everyone the proxy lets through gets the `admin` role (everything, including CONFIG SET, CLIENT KILL and
flush) unless the proxy also sends `auth.headerRole`. To give people less, have the proxy (or the
ingress in front of the app) set that header to `rw` or `ro`, for example from a group claim. Like the
identity headers, it is only read from a trusted proxy.

## Proxy setups

### oauth2-proxy behind ingress-nginx (`auth_request` mode)

oauth2-proxy runs with `--set-xauthrequest`, and the ingress copies its response headers onto the request
sent to svelteRedisAdmin:

```yaml
metadata:
  annotations:
    nginx.ingress.kubernetes.io/auth-url: 'https://$host/oauth2/auth'
    nginx.ingress.kubernetes.io/auth-signin: 'https://$host/oauth2/start?rd=$escaped_request_uri'
    nginx.ingress.kubernetes.io/auth-response-headers: 'X-Auth-Request-User,X-Auth-Request-Email,X-Auth-Request-Groups'
```

The peer svelteRedisAdmin sees is the ingress controller pod, so `trustedProxies` is the pod network range
of the ingress controller. Use `x-auth-request-user` and `x-auth-request-groups` as header names.

### oauth2-proxy as the reverse proxy

With oauth2-proxy forwarding straight to svelteRedisAdmin (`--upstream=http://sra:3000`,
`--pass-user-headers`), the identity arrives as `X-Forwarded-User` / `X-Forwarded-Groups`:

```json
"auth": {
	"plugin": "header",
	"header": "x-forwarded-user",
	"headerGroups": "x-forwarded-groups",
	"trustedProxies": ["10.42.3.17"]
}
```

## Kubernetes RBAC

On a review environment where every merge request gets its own namespace and its own Redis, the question
"may this person use this server?" already has an answer: the RBAC of the namespace. `authorize` on a
server asks the Kubernetes API server, with a
[SubjectAccessReview](https://kubernetes.io/docs/reference/access-authn-authz/authorization/#checking-api-access),
whether the signed-in person may `get pods` (by default) in the server's namespace. People without that
right do not see the server, and get a `403` if they open its URL.

```json
{
	"Servers": [
		{
			"name": "review-123",
			"host": "redis.review-123.svc",
			"auth": "secret",
			"authorize": {
				"type": "kubernetes-sar",
				"namespace": "review-123",
				"resource": { "group": "", "resource": "pods", "verb": "get" },
				"userPrefix": "oidc:",
				"groupsPrefix": "oidc:",
				"cacheSeconds": 60
			}
		}
	],
	"auth": {
		"plugin": "header",
		"header": "x-auth-request-user",
		"headerGroups": "x-auth-request-groups",
		"trustedProxies": ["10.42.0.0/16"]
	}
}
```

| Key                              | Default                                                | Meaning                                                                                                 |
| -------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `authorize.type`                 | none                                                   | `kubernetes-sar`, the only authoriser so far.                                                           |
| `authorize.namespace`            | none                                                   | Namespace whose RBAC decides. Required, a DNS-1123 label.                                               |
| `authorize.resource.group`       | empty (core API)                                       | API group of the resource.                                                                              |
| `authorize.resource.resource`    | `pods`                                                 | Resource the person must have the right on.                                                             |
| `authorize.resource.verb`        | `get`                                                  | Verb they must be allowed.                                                                              |
| `authorize.resource.subresource` | none                                                   | Optional, e.g. `exec` with `pods` and verb `create`, or `proxy` with `services`.                        |
| `authorize.userPrefix`           | empty                                                  | Prepended to the identity user. Must equal the API server's `--oidc-username-prefix`.                   |
| `authorize.groupsPrefix`         | empty                                                  | Prepended to each group. Must equal the API server's `--oidc-groups-prefix`.                            |
| `authorize.cacheSeconds`         | `60`                                                   | How long an answer, allowed or denied, is reused. `0` asks on every request.                            |
| `authorize.apiServer`            | in cluster                                             | `https://$KUBERNETES_SERVICE_HOST:$KUBERNETES_SERVICE_PORT`. `http://` works too, e.g. `kubectl proxy`. |
| `authorize.tokenFile`            | `/var/run/secrets/kubernetes.io/serviceaccount/token`  | Bearer token of the app's ServiceAccount. Read again on every lookup, so projected tokens can rotate.   |
| `authorize.caFile`               | `/var/run/secrets/kubernetes.io/serviceaccount/ca.crt` | CA that signs the API server certificate (`https://` only).                                             |

`authorize` is only accepted with `auth.plugin: "header"`; with another plugin the config fails to load,
because only the proxy gives the app an identity Kubernetes knows.

### Naming must match the cluster

The review asks about `userPrefix + <user header>` in the groups `groupsPrefix + <each group>` plus
`system:authenticated`. Those must be the names your RoleBindings use, which are the names the API server
gives OIDC users. If the cluster runs with `--oidc-username-claim=preferred_username
--oidc-username-prefix=oidc: --oidc-groups-prefix=oidc:` and the proxy forwards the GitLab username and
groups, use `"userPrefix": "oidc:"` and `"groupsPrefix": "oidc:"`. Check with
`kubectl auth can-i get pods -n review-123 --as oidc:alice --as-group oidc:my-team`.

### RBAC for the app

The app's ServiceAccount needs `create` on `subjectaccessreviews`, which the built-in ClusterRole
`system:auth-delegator` grants:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: svelteredisadmin
  namespace: tools
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: svelteredisadmin-auth-delegator
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: system:auth-delegator
subjects:
  - kind: ServiceAccount
    name: svelteredisadmin
    namespace: tools
```

Run the Deployment with `serviceAccountName: svelteredisadmin` and keep `automountServiceAccountToken`
on (the default), so the token and CA appear at the default paths.

### Who may use a namespace

Grant people the right the review checks. Here the GitLab group `my-team` may get pods in `review-123`,
and therefore use the Redis of that namespace:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: review-123
rules:
  - apiGroups: ['']
    resources: ['pods']
    verbs: ['get']
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: my-team-pod-reader
  namespace: review-123
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: pod-reader
subjects:
  - apiGroup: rbac.authorization.k8s.io
    kind: Group
    name: oidc:my-team
```

The built-in ClusterRole `view`, bound with a RoleBinding in the namespace, works as well.

### Caching and failures

- Answers are cached in memory per API server, namespace, resource, user and set of groups, for
  `cacheSeconds`. A RoleBinding you remove takes effect after at most that delay. Identical lookups that
  arrive together share one request.
- Errors are never cached. If the API server is unreachable, answers with an error status, an unreadable
  body, or does not answer within 5 seconds, opening the server fails closed with
  `503 Cannot verify your access right now.` The cause goes to the server log, never the token.
- In the sidebar, the server switcher and on the home page, a server whose check fails is hidden.
- The check runs before any Redis connection is opened.

## Server discovery

With one Redis per merge request, listing every review environment in `Servers` does not scale.
`ServerDiscovery` asks the Kubernetes API which namespaces and Redis Services exist, and offers each one
as a server. The password is read from a Secret of the namespace, and RBAC of the same namespace decides
who may use it. The check is on by default.

```json
{
	"Servers": [],
	"auth": {
		"plugin": "header",
		"header": "x-auth-request-user",
		"headerGroups": "x-auth-request-groups",
		"trustedProxies": ["10.42.0.0/16"]
	},
	"cookieSecret": "a-random-string-of-32-characters-or-more",
	"ServerDiscovery": {
		"type": "kubernetes",
		"namespaceSelector": "env=review",
		"serviceSelector": "app.kubernetes.io/name=redis",
		"port": "redis",
		"name": "{namespace}: {annotation:gitlab.com/mr-title}",
		"secret": { "name": "redis-auth", "passwordKey": "redis-password" },
		"authorize": { "userPrefix": "oidc:", "groupsPrefix": "oidc:" },
		"server": { "databases": 16, "separator": ":" }
	}
}
```

| Key                                | Default                     | Meaning                                                                                                                                                                                  |
| ---------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                             | none                        | `kubernetes`, the only provider so far.                                                                                                                                                  |
| `namespaceSelector`                | none                        | Label selector of the namespaces to look in, e.g. `env=review`. Required.                                                                                                                |
| `serviceSelector`                  | none                        | Label selector of the Redis Services in them. Required.                                                                                                                                  |
| `port`                             | `redis`                     | Service port, by name or number. A name the Service lacks falls back to its only port; Services with several ports and none matching are skipped.                                        |
| `host`                             | `{service}.{namespace}.svc` | Host the app connects to.                                                                                                                                                                |
| `name`                             | `{namespace}`               | Name shown in the sidebar and switcher. Blank after filling: `<namespace>/<service>`.                                                                                                    |
| `secret.name`                      | none                        | Secret in the namespace that holds the password. Required when `secret` is set.                                                                                                          |
| `secret.passwordKey`               | none                        | Key of the Secret with the password (`requirepass`, or the ACL user's password). Required when `secret` is set.                                                                          |
| `secret.usernameKey`               | none                        | Key of the Secret with a Redis 6+ ACL user name. Absent: the `default` user.                                                                                                             |
| `secret`                           | none                        | Leave it out for Redis without a password.                                                                                                                                               |
| `authorize`                        | `get pods`                  | The RBAC question of [Kubernetes RBAC](#kubernetes-rbac) without `namespace` and API access keys, asked in each server's own namespace. `false` lets in everyone the proxy lets through. |
| `refreshSeconds`                   | `30`                        | How long the server list and each Secret are reused. At least 5.                                                                                                                         |
| `server`                           | `{}`                        | Settings of every discovered server: `db`, `databases`, `filter`, `separator`, `tls`. Other keys fail the config.                                                                        |
| `apiServer`, `tokenFile`, `caFile` | in cluster                  | As for `authorize`.                                                                                                                                                                      |

`host`, `name` and `secret.name` accept `{namespace}`, `{service}`, `{label:<key>}` and
`{annotation:<key>}`. Labels and annotations are the namespace's own. A missing one fills in as empty.

`ServerDiscovery` is only accepted with `auth.plugin: "header"`. With it, `Servers` may be empty.

Ready-made manifests (the app with this config and RBAC, two example review environments) and a local
walkthrough are in [deploy/kubernetes](../deploy/kubernetes/README.md).

### How discovered servers behave

- They come after the servers of `Servers`, sorted by namespace and Service. Configured servers keep
  their position as id, so `/server/0` and login `servers` lists keep working. A discovered server is
  named by its id, `k8s:<namespace>:<service>`: `/server/k8s:review-123:redis` opens it.
- A server that disappeared (merged MR, deleted namespace) is no longer offered, and its URL answers
  `404`.
- The sidebar, the server switcher and the home page list only the servers whose RBAC lets the person in.
  Each check is the same cached review as opening the server makes.
- Two API calls list the namespaces and the Services, at most once per `refreshSeconds`. The first
  request waits for the list; later ones get the current list while a newer one loads in the background.
  If a refresh fails, the previous list stays in use and the error goes to the server log.
- A Secret is read when a request needs that server, and kept in memory for `refreshSeconds`. It never
  goes into a cookie, a page or a log.
- If the first listing fails, the configured servers are still listed. Opening a discovered server then
  answers `503 Cannot list the Redis servers right now.` If the Secret cannot be read:
  `503 Cannot read the password of this server right now.` `/api/health` answers in all cases, so probes
  do not depend on the API server.

### RBAC for discovery

On top of `system:auth-delegator` (see [RBAC for the app](#rbac-for-the-app)), the ServiceAccount needs
to list namespaces and Services cluster-wide, and to read the Redis Secret in the review namespaces.
Restrict the Secret right to its name:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: svelteredisadmin-discovery
rules:
  - apiGroups: ['']
    resources: ['namespaces', 'services']
    verbs: ['list']
  - apiGroups: ['']
    resources: ['secrets']
    resourceNames: ['redis-auth']
    verbs: ['get']
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: svelteredisadmin-discovery
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: svelteredisadmin-discovery
subjects:
  - kind: ServiceAccount
    name: svelteredisadmin
    namespace: tools
```

A ClusterRoleBinding lets the app read `redis-auth` in every namespace. To limit it to the review
namespaces, bind the ClusterRole with a RoleBinding in each of them instead, from the pipeline that
creates the namespace. The list rights still need the ClusterRoleBinding.

## Running the container

```bash
docker build -t svelteredisadmin .
```

```bash
docker run -p 3000:3000 -v "$PWD/config.json:/config/config.json:ro" svelteredisadmin
```

The image reads `/config/config.json` (`SRA_CONFIG`), listens on port 3000 and runs as user 1000. Behind
a proxy that terminates TLS, set `PROTOCOL_HEADER=x-forwarded-proto` so form posts pass the origin check.

## Security checklist

Trusted headers are only as safe as the network path in front of the app.

- **The app must be unreachable except through the proxy.** Bind the Service to `ClusterIP` (or
  `127.0.0.1`), and add a NetworkPolicy or firewall rule that only lets the proxy in. If a person can
  reach the app from an address listed in `trustedProxies`, they can be anyone.
- **Keep `trustedProxies` tight.** Prefer the proxy's own addresses over a whole private range.
- **Make the proxy overwrite the identity headers**, never pass client-supplied ones through. Test it:
  send `X-Auth-Request-User: someone-else` through the proxy and check the user menu.
- **Decide the role.** Without `auth.headerRole`, everyone signed in is `admin` on the servers they can
  see.
- **The Redis password is shared.** Everyone signed in acts with it. Give a Redis 6+ ACL user only the
  commands the team needs (`secret.usernameKey`).
- Enforce MFA in the identity provider: the app does no second factor of its own.
- **Turn on the [audit log](AUDIT.md)** (`"AuditLog": { "target": "stdout" }`) and ship it out of the
  namespace. Refusals (untrusted proxy, RBAC) are logged as `denied` events.

## Troubleshooting

| Symptom                                                                | Cause                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Config fails to load, `auth.trustedProxies`                            | Missing or empty with the `header` plugin, or an entry that is not an IP or CIDR.                                                                                                                                                      |
| Always `401 Authentication required.`                                  | The peer is not in `trustedProxies` (check the address the app sees, IPv6 included), the user header name does not match, or the header is empty or duplicated.                                                                        |
| `403 You do not have access to this server (Kubernetes namespace …)`   | RBAC denies the person. Check the RoleBinding and the prefixes with `kubectl auth can-i … --as … --as-group …`. A fix shows after `cacheSeconds`.                                                                                      |
| `503 Cannot verify your access right now.`                             | The SubjectAccessReview failed; the server log says why. Common causes: no `system:auth-delegator` binding (HTTP 403 from the API), `apiServer` unset outside a cluster, unreadable `tokenFile` / `caFile`.                            |
| A server is missing from the sidebar                                   | RBAC denies the person, or its check failed (server log). For a discovered one: its namespace or Service lacks the selector labels, the Service has several ports and none named `port`, or the list is younger than `refreshSeconds`. |
| `503 Cannot list the Redis servers right now.`                         | The first listing failed: no `list` right on namespaces or Services (HTTP 403 in the server log), or the API server is unreachable.                                                                                                    |
| `503 Cannot read the password of this server right now.`               | No `get` right on the Secret, the Secret does not exist, or it lacks `secret.passwordKey` / `secret.usernameKey`.                                                                                                                      |
| Home page card shows `Cannot connect to …: WRONGPASS` or `NOAUTH`      | The Secret holds another password than the Redis uses, or `secret` is missing for a Redis with a password.                                                                                                                             |
| Config fails to load, `Servers.N.authorize needs auth.plugin "header"` | `authorize` or `ServerDiscovery` set with the `config` or `http` plugin.                                                                                                                                                               |
| Config fails to load, `ServerDiscovery…`                               | A required key is missing (`namespaceSelector`, `serviceSelector`, `secret.name`, `secret.passwordKey`), a template uses another placeholder, or `server` sets a key discovery fills in.                                               |

## Current limits

- The role is per person, not per server: `auth.headerRole` applies to every server the person sees.
- Redis only sees the shared password (or ACL user). Its own logs cannot tell people apart: turn on
  the [audit log](AUDIT.md) to record who did what.
- Without `authorize` (or with `ServerDiscovery.authorize: false`), authorisation is all-or-nothing:
  whoever the proxy lets through gets the server.
- Caches (server list, Secrets, RBAC answers) are per process. With several replicas, each one asks the
  API server on its own, and a change can show on one replica before another.
- Discovery polls; it does not watch. A new review environment appears within `refreshSeconds`.
