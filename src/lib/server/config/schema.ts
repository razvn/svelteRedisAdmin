import { isIP } from 'node:net';
import { z } from 'zod';

/** A single IPv4/IPv6 address or a CIDR range (`10.0.0.0/8`, `fd00::/8`). */
const ipOrCidr = z.string().refine((value) => {
	const [address, bits, ...rest] = value.split('/');
	const family = isIP(address);
	if (!family || rest.length > 0) return false;
	if (bits === undefined) return true;
	return /^\d+$/.test(bits) && Number(bits) <= (family === 4 ? 32 : 128);
}, 'must be an IP address or a CIDR range');

const DNS_LABEL = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;

/** Where the Kubernetes API server is and how the app authenticates to it (in-cluster by default). */
const kubernetesAccessShape = {
	/** Default: in-cluster, `https://$KUBERNETES_SERVICE_HOST:$KUBERNETES_SERVICE_PORT`. */
	apiServer: z.url({ protocol: /^https?$/ }).optional(),
	tokenFile: z.string().min(1).default('/var/run/secrets/kubernetes.io/serviceaccount/token'),
	caFile: z.string().min(1).default('/var/run/secrets/kubernetes.io/serviceaccount/ca.crt')
};

/**
 * Kubernetes RBAC decides whether the person the identity header names may use a server: a
 * SubjectAccessReview asks whether they may `verb` `resource` in `namespace`. See docs/KUBERNETES.md.
 */
export const kubernetesSarSchema = z.object({
	type: z.literal('kubernetes-sar'),
	namespace: z.string().regex(DNS_LABEL, 'must be a Kubernetes namespace name (DNS-1123 label)'),
	resource: z
		.object({
			group: z.string().default(''),
			resource: z.string().min(1).default('pods'),
			verb: z.string().min(1).default('get'),
			subresource: z.string().min(1).optional()
		})
		.default({ group: '', resource: 'pods', verb: 'get' }),
	/** Prepended to the identity user, like the API server's `--oidc-username-prefix`. */
	userPrefix: z.string().default(''),
	/** Prepended to every group, like the API server's `--oidc-groups-prefix`. */
	groupsPrefix: z.string().default(''),
	/** How long an answer (allowed or denied) is reused; 0 asks the API server on every request. */
	cacheSeconds: z.number().int().min(0).default(60),
	...kubernetesAccessShape
});
export type KubernetesSarConfig = z.infer<typeof kubernetesSarSchema>;

/** The RBAC question without the namespace and API access: discovery fills those in per server. */
const sarRulesSchema = kubernetesSarSchema
	.omit({ namespace: true, apiServer: true, tokenFile: true, caFile: true })
	.extend({ type: z.literal('kubernetes-sar').default('kubernetes-sar') });

const PLACEHOLDER = /\{(?:namespace|service|label:[^{}]+|annotation:[^{}]+)\}/g;
/** A text with `{namespace}`, `{service}`, `{label:key}`, `{annotation:key}` placeholders only. */
const template = z
	.string()
	.refine(
		(value) => !/[{}]/.test(value.replace(PLACEHOLDER, '')),
		'allowed placeholders: {namespace}, {service}, {label:key}, {annotation:key}'
	);

/**
 * One entry of `Servers` — keys follow phpRedisAdmin's `includes.config.php`
 * (`host`, `port`, `auth`, `db`, `filter`, `databases`, `separator`, `name`).
 */
export const serverSchema = z.object({
	/** Display name; falls back to `host:port`. */
	name: z.string().trim().min(1).optional(),
	host: z.string().trim().min(1).default('127.0.0.1'),
	port: z.number().int().min(1).max(65535).default(6379),
	/** Path to a unix socket (uses `path` instead of `host`/`port`). */
	path: z.string().trim().min(1).optional(),
	/** requirepass-style password (`auth` in phpRedisAdmin). */
	auth: z.string().optional(),
	/** Redis 6+ ACL username. */
	username: z.string().optional(),
	/** Database the browser opens by default. */
	db: z.number().int().min(0).default(0),
	/** Shown in the sidebar (`databases`); capped because DBSIZE per db is expensive. */
	databases: z.number().int().min(1).max(256).default(16),
	/** Glob filter applied to key listings (`filter`). */
	filter: z.string().optional(),
	/** Separator used to build key trees (`separator`). */
	separator: z.string().min(1).default(':'),
	tls: z.boolean().default(false),
	/** Kubernetes RBAC check for this server (`auth.plugin: "header"` only). */
	authorize: kubernetesSarSchema.optional()
});
export type ServerConfig = z.infer<typeof serverSchema>;

export const loginSchema = z.object({
	username: z.string().trim().min(1),
	password: z.string().min(1),
	/** App role: admin (everything), rw (data read/write), ro (read-only). */
	role: z.enum(['admin', 'rw', 'ro']).default('admin'),
	/** Server indexes this user may see; absent = all servers. */
	servers: z.array(z.number().int().min(0)).optional()
});
export type LoginConfig = z.infer<typeof loginSchema>;

/**
 * App-specific: Redis Services of labelled namespaces become servers, with the password read from a
 * Secret of the namespace and RBAC of the namespace deciding who may use them. See docs/KUBERNETES.md.
 */
export const serverDiscoverySchema = z.object({
	type: z.literal('kubernetes'),
	/** Label selector on namespaces (`env=review`). */
	namespaceSelector: z.string().min(1),
	/** Label selector on the Redis Services of those namespaces. */
	serviceSelector: z.string().min(1),
	/** Service port: name or number. A name that is missing falls back to the only port. */
	port: z.union([z.string().min(1), z.number().int().min(1).max(65535)]).default('redis'),
	host: template.default('{service}.{namespace}.svc'),
	name: template.default('{namespace}'),
	/** Secret of the namespace holding the Redis password (absent: Redis without a password). */
	secret: z
		.object({
			name: template.pipe(z.string().min(1)),
			passwordKey: z.string().min(1),
			/** Key of the Secret holding a Redis 6+ ACL user name (absent: the default user). */
			usernameKey: z.string().min(1).optional()
		})
		.optional(),
	/** RBAC check in the server's namespace (on by default); `false` lets every identified person in. */
	authorize: z.union([z.literal(false), sarRulesSchema]).default(() => sarRulesSchema.parse({})),
	/** How long the server list and Secrets are reused before asking the API server again. */
	refreshSeconds: z.number().int().min(5).default(30),
	/** Settings of every discovered server, like an entry of `Servers`: `db`, `databases`, `filter`, `separator`, `tls`. */
	server: z
		.object({
			db: z.number().int().min(0).default(0),
			databases: z.number().int().min(1).max(256).default(16),
			filter: z.string().optional(),
			separator: z.string().min(1).default(':'),
			tls: z.boolean().default(false)
		})
		.strict()
		.prefault({}),
	...kubernetesAccessShape
});
export type ServerDiscoveryConfig = z.infer<typeof serverDiscoverySchema>;

/** Pluggable authentication (`auth` in config.json). */
export const authConfigSchema = z.object({
	/** Built-in plugins: `config` (login form), `http` (Basic), `header` (ingress identity). */
	plugin: z.string().trim().min(1).default('config'),
	/** `header` plugin: request header carrying the username (e.g. `x-forwarded-user`). */
	header: z.string().trim().min(1).optional(),
	/** `header` plugin: request header carrying the role (defaults to `admin`). */
	headerRole: z.string().trim().min(1).optional(),
	/** `header` plugin: request header carrying a comma-separated server index list. */
	headerServers: z.string().trim().min(1).optional(),
	/** `header` plugin: request header carrying the person's groups, comma separated (Kubernetes RBAC). */
	headerGroups: z.string().trim().min(1).optional(),
	/**
	 * `header` plugin: IPs or CIDRs of the proxy. The identity headers are only read on requests whose
	 * TCP peer is one of them. Required (non-empty) with the `header` plugin.
	 */
	trustedProxies: z.array(ipOrCidr).default([])
});

const auditLogCommon = {
	/** Log the values of keyed commands (`SET k <value>`) and console arguments; off by default (PII). */
	includeValues: z.boolean().default(false),
	/** A person's next request after this much inactivity starts a new `session` event. */
	sessionIdleMinutes: z.number().int().positive().default(30),
	/** Longer key names and arguments are cut (and the line marked `truncated`). */
	maxArgLength: z.number().int().positive().default(1024)
};

/**
 * App-specific (not a phpRedisAdmin key): per-person audit log as JSON Lines, see docs/AUDIT.md.
 * Absent = disabled. A relative `file` path resolves from the directory of the config file.
 */
export const auditLogSchema = z.discriminatedUnion('target', [
	z.object({ target: z.literal('stdout'), ...auditLogCommon }),
	z.object({ target: z.literal('file'), path: z.string().min(1), ...auditLogCommon })
]);
export type AuditLogConfig = z.infer<typeof auditLogSchema>;

export const appConfigSchema = z.object({
	/** Configured servers; may be empty when `ServerDiscovery` finds them. */
	Servers: z.array(serverSchema).default([]),
	/** Servers found through the Kubernetes API (`auth.plugin: "header"` only). */
	ServerDiscovery: serverDiscoverySchema.optional(),
	/** When absent, the app auto-authenticates (phpRedisAdmin's default install). */
	login: z.array(loginSchema).optional(),
	/** Authentication plugin selection (`auth`); defaults to the config login list. */
	auth: authConfigSchema.prefault({}),
	/** HMAC secret for the session cookie. Required when `login` is configured. */
	cookieSecret: z.string().min(16).optional(),
	cookieName: z.string().trim().min(1).default('sra_session'),
	/** Per-person audit log (stdout or file); absent = off. See docs/AUDIT.md. */
	AuditLog: auditLogSchema.optional(),
	/** Session lifetime in seconds (default 24 h). */
	cookieLifetime: z.number().int().min(60).default(86_400),
	/** Keys listed per SCAN page (`maxKeyListSize` in phpRedisAdmin). */
	maxKeyListSize: z.number().int().min(1).max(1000).default(100),
	/** Values longer than this are truncated for display (`maxValueLength`). */
	maxValueLength: z.number().int().min(64).default(8192)
});
export type AppConfig = z.infer<typeof appConfigSchema>;

/** Display name of a server entry (`name` or `host:port` / socket path). */
export function serverName(server: ServerConfig): string {
	if (server.name) return server.name;
	return server.path ? server.path : `${server.host}:${server.port}`;
}
