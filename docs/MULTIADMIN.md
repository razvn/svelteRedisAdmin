# Hosted by svelteMultiAdmin

[svelteMultiAdmin](https://github.com/razvn/svelteMultiAdmin) is a portal that bundles svelteRedisAdmin and
[svelteMyAdmin](https://github.com/razvn/svelteMyAdmin). People sign in once on the portal, then open this app
without a second login. The portal runs this app next to itself, proxies every request, and tells it who the
person is. This page lists what this app needs for that, what the portal does for you, and what stays your job.

You only need this page to understand the setup, or to wire your own gateway the same way. With the portal, you
write the app's normal config (servers, discovery, audit) and nothing about authentication.

## What the portal sets for you

When the portal starts this app, it reads your `config.json`, **overwrites these keys**, writes the result to a
private temporary file and points `SRA_CONFIG` at it:

```json
{
	"auth": {
		"plugin": "header",
		"header": "x-multiadmin-user",
		"headerGroups": "x-multiadmin-groups",
		"headerRole": "x-multiadmin-role",
		"headerServers": "x-multiadmin-servers",
		"trustedProxies": ["127.0.0.1/32", "::1/128"]
	},
	"cookieSecret": "derived from the portal's secret, unless your config already sets one",
	"Portal": { "url": "https://admin.example.com", "label": "Admin portal" }
}
```

It also starts the app with `HOST=127.0.0.1`, a loopback `PORT`, and `ORIGIN` set to the app's public address, and
removes `ADDRESS_HEADER`, `XFF_DEPTH`, `PROTOCOL_HEADER`, `HOST_HEADER`, `SOCKET_PATH` and `BODY_SIZE_LIMIT` from
its environment. Any `login` list in your config is unused with the `header` plugin.

This is the [`header` plugin](KUBERNETES.md) with the portal as the "proxy": the app trusts the identity headers
only from the loopback address, and re-reads them on every request.

## What you configure

| In `config.json`            | Why it matters with the portal                                                                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Servers[].name`            | **Give every server a unique `name`.** The portal's access rules name servers by `name` (not by position) and translate them into the positions the app wants. A name the app does not have grants nothing. |
| `ServerDiscovery`           | Works as documented in [KUBERNETES.md](KUBERNETES.md). Discovered servers are not filtered by the portal's server list: Kubernetes RBAC (`authorize`) decides who may use them.                             |
| `AuditLog`                  | Recommended. The portal user is the `identity` of every event, with the role and the real client address. See [AUDIT.md](AUDIT.md).                                                                         |
| `maxKeyListSize`, … display | Unchanged.                                                                                                                                                                                                  |

You do **not** write: `auth`, `trustedProxies`, header names, `Portal`, `cookieSecret`, `login`.

### The role and the servers

The portal always sends `x-multiadmin-role` (`ro`, `rw` or `admin`) from its access rules, so the app's "no role
header means `admin`" default is never reached. Unless the person may see every server, it also sends
`x-multiadmin-servers` with the positions in `Servers` of the servers they may see, possibly empty. Both are
enforced as described in [KUBERNETES.md](KUBERNETES.md): a hidden server answers `404`, the UI hides what a role
may not do and the server re-checks it.

### Groups

For OIDC and trusted-header sign-in the portal passes the person's groups in `x-multiadmin-groups`, which feed
`authorize` (SubjectAccessReview). Groups of the portal's local accounts are never passed.

## The back-link

`Portal` adds **Back to <label>** to the user menu. It is optional: without it nothing changes, and an `http(s)`
URL is required because the value ends up in a link.

```json
{ "Portal": { "url": "https://admin.example.com", "label": "Admin portal" } }
```

## Logging out

The portal's session is the only session. **Log out on the portal** to end access: it ends the session on every
host. This app's own "Log out" only clears its cookie and returns to its sign-in page, where the header plugin
signs the person in again as long as their portal session lives.

## Wiring your own gateway

Do what the portal does:

1. Run the app so that **only your gateway can reach it** (loopback, a private network, a
   NetworkPolicy), with `HOST` and `PORT` set and `ORIGIN` set to the public address people use.
2. Put the `auth` block above in `config.json`, with `trustedProxies` listing exactly your gateway's addresses.
3. In the gateway, **delete** `x-multiadmin-*`, `x-auth-request-*`, `Forwarded` and `X-Forwarded-*` from every
   incoming request, then set the user, groups, role and servers from your own authentication. Send
   `X-Forwarded-For` with the real client address, so the audit log records it.
4. Do not set `ADDRESS_HEADER` or `XFF_DEPTH` on the app: the identity check relies on the real TCP peer.

Anything else able to reach the app from a trusted address can impersonate anyone. Do not run a sidecar you do
not trust next to it.

## Limits

- One shared Redis password per server for everyone: Redis cannot tell people apart. Turn on `AuditLog`.
- The role and server list come from the portal's access rules, not from this app's `login` list.
- The app has no base path: the portal serves it on its own hostname.
