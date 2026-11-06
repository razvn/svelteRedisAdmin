# Kubernetes example

svelteRedisAdmin finds the Redis of every review namespace (one per merge request), connects with the
password from that namespace's Secret, and lets Kubernetes RBAC decide who may use which one. The full
reference is in [docs/KUBERNETES.md](../../docs/KUBERNETES.md) ("Kubernetes RBAC" and "Server
discovery").

| File                    | What                                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `svelteredisadmin.yaml` | The app in namespace `tools`: ServiceAccount, RBAC for SubjectAccessReviews and discovery, config, Deployment, ClusterIP Service. |
| `review-example.yaml`   | Two review environments (`review-1`, `review-2`, each a Redis 7.4 with a password), a decoy namespace, and who may use what.      |

The example config trusts identity headers from `127.0.0.1` / `::1` only, which is what `kubectl
port-forward` looks like from inside the pod. That makes it a local try-out. For real use, see
[Going to production](#going-to-production).

## Try it on a local cluster

Rancher Desktop with the `moby` engine, or any cluster that can run an image you built locally. Run the
commands from the repository root.

```bash
docker build -t svelteredisadmin:dev .
```

```bash
kubectl apply -f deploy/kubernetes/svelteredisadmin.yaml -f deploy/kubernetes/review-example.yaml
```

```bash
kubectl -n tools rollout status deploy/svelteredisadmin
```

```bash
kubectl -n tools port-forward deploy/svelteredisadmin 8080:3000
```

The SSO proxy is played by request headers. `X-Forwarded-Proto: http` is needed because the Deployment
sets `PROTOCOL_HEADER` (a real proxy terminating TLS sends `https`).

```bash
curl -i -H 'X-Auth-Request-User: carol' -H 'X-Forwarded-Proto: http' http://localhost:8080/server/k8s:review-2:redis
```

What to expect, with the RoleBindings of `review-example.yaml`:

| Who                                                          | Gets                                                                         |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `alice`, group `team-a`                                      | `review-1` only: the home page and the sidebar list just that server.        |
| `carol`                                                      | `review-2` only.                                                             |
| `bob`, group `team-b`                                        | No server listed.                                                            |
| Anyone, `/server/k8s:review-1:redis` without the right       | `403 You do not have access to this server (Kubernetes namespace review-1).` |
| No user header                                               | `401 Authentication required.`                                               |
| Anyone, `/server/k8s:scratch:redis` (namespace not labelled) | `404`                                                                        |

Send groups with `-H 'X-Auth-Request-Groups: team-a'`. In a browser, a header extension (ModHeader, for
example) sets the same headers.

Check what RBAC says on its own:

```bash
kubectl auth can-i get pods -n review-1 --as oidc:alice --as-group oidc:team-a
```

Refusals and API errors go to the pod's log:

```bash
kubectl -n tools logs deploy/svelteredisadmin
```

Clean up:

```bash
kubectl delete -f deploy/kubernetes/review-example.yaml -f deploy/kubernetes/svelteredisadmin.yaml
```

## Going to production

- **Put a real SSO proxy in front.** oauth2-proxy, an ingress `auth-url`, Pomerium... (see "Proxy
  setups" in docs/KUBERNETES.md). Set `auth.trustedProxies` to the proxy's pod addresses, and add a
  NetworkPolicy so only the proxy can reach the app.
- **Match the cluster's OIDC names.** `authorize.userPrefix` and `groupsPrefix` must equal the API
  server's `--oidc-username-prefix` and `--oidc-groups-prefix`. Otherwise RBAC denies everyone.
- **Decide the role.** Without `auth.headerRole`, everyone who can see a server is `admin` on it.
- **Keep secrets out of the ConfigMap.** Mount the config from a Secret, with a random `cookieSecret` of
  32 characters or more.
- **Use your registry.** Push the image there, and drop `imagePullPolicy: Never`.
- **Narrow the Secret right if needed.** The ClusterRoleBinding lets the app read `redis-auth` in every
  namespace. Bind `svelteredisadmin-discovery` with a RoleBinding per review namespace instead, from the
  pipeline that creates it, to narrow that down.
