import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { redirect } from '@sveltejs/kit';
import { loadConfigOnce } from '#lib/server/config/loader.ts';
import {
	createSessionToken,
	parseSessionToken,
	type SessionInfo
} from '#lib/server/auth/session.ts';
import { assertServerAccess, resolveServers } from '#lib/server/auth/access.ts';
import { getAuthPlugin } from '#lib/server/auth/plugins/index.ts';
import type { AuthPlugin } from '#lib/server/auth/plugins/types.ts';
import { createConnection } from '#lib/server/redis/connection.ts';
import { applyLocale, fillHtmlLang } from '#lib/server/i18n/locale.ts';
import type { AppConfig } from '#lib/server/config/schema.ts';
import type { RedisConnection } from '#lib/server/redis/connection.ts';

const getConfig = loadConfigOnce(process.env['SRA_CONFIG']);

/** Routes reachable without a session (config plugin only). */
const PUBLIC_PATHS = new Set(['/login', '/logout']);

export const handle: Handle = async ({ event, resolve }) => {
	const locals = event.locals as typeof event.locals;

	let config: AppConfig | undefined;
	let plugin: AuthPlugin | null = null;
	try {
		config = getConfig();
		locals.config = config;
		locals.configError = null;
		plugin = getAuthPlugin(config);
	} catch (caught) {
		locals.config = undefined as never;
		locals.configError = (caught as Error).message;
	}

	// Interface language (cookie -> Accept-Language -> en).
	await applyLocale(event);

	// The signed cookie is the session store; the plugin is the source of truth.
	// `authRequired` stays false only for the config plugin with no login list.
	const loginCount = config?.login?.length ?? 0;
	locals.authRequired = config ? !(config.auth.plugin === 'config' && loginCount === 0) : false;

	let session: SessionInfo | null = null;
	if (config && plugin && !locals.configError) {
		if (config.auth.plugin !== 'config' || loginCount > 0) {
			const facts = await plugin.authenticate({
				request: event.request,
				cookies: event.cookies,
				config
			});
			if (facts) {
				const role = facts.role ?? 'admin';
				const servers = resolveServers(config, facts.servers ?? null);
				// Reuse the cached cookie session when it matches the plugin's facts.
				const cached = parseSessionToken(
					event.cookies.get(config.cookieName),
					config.cookieSecret ?? ''
				);
				if (
					cached &&
					cached.username === facts.username &&
					cached.role === role &&
					JSON.stringify(cached.servers) === JSON.stringify(servers)
				) {
					session = cached;
				} else {
					session = {
						username: facts.username,
						role,
						servers,
						expires: Math.floor(Date.now() / 1000) + config.cookieLifetime
					};
					event.cookies.set(
						config.cookieName,
						createSessionToken(session, config.cookieSecret ?? ''),
						{ path: '/', httpOnly: true, sameSite: 'lax', maxAge: config.cookieLifetime }
					);
				}
			} else if (config.auth.plugin === 'http') {
				return new Response('Authentication required.', {
					status: 401,
					headers: { 'WWW-Authenticate': 'Basic realm="svelteRedisAdmin", charset="UTF-8"' }
				});
			} else if (config.auth.plugin === 'header') {
				// The edge proxy is expected to have authenticated the request.
				return new Response('Authentication required.\n', {
					status: 401,
					headers: { 'content-type': 'text/plain; charset=utf-8' }
				});
			}
		} else {
			// No login list: phpRedisAdmin-style auto-authentication.
			session = {
				username: 'admin',
				role: 'admin',
				servers: null,
				expires: Math.floor(Date.now() / 1000) + config.cookieLifetime
			};
		}
	}
	locals.session = session;
	// Locals fields are undefined unless initialized — `serverIndex === null` checks rely on this.
	locals.serverIndex = null;
	locals.server = null;

	if (!session && locals.authRequired && !PUBLIC_PATHS.has(event.url.pathname)) {
		redirect(303, '/login');
	}
	if (session && event.url.pathname === '/login') {
		redirect(303, '/');
	}

	// Resolve the active server for /server/[id]/... routes.
	const serverParam = event.params['id'];
	if (serverParam !== undefined && config) {
		const index = Number(serverParam);
		if (Number.isInteger(index) && index >= 0 && index < config.Servers.length) {
			locals.serverIndex = index;
			// Hide servers the user cannot see (404, so their existence is not leaked).
			assertServerAccess(locals);
			locals.server = config.Servers[index];
		}
	}

	// Lazily opened Redis connections, all closed after the response settles.
	const opened = new Map<number, Promise<RedisConnection>>();
	locals.redis = (db?: number) => {
		if (!locals.server) throw new Error('No active server for this route');
		const database = db ?? locals.server.db;
		let connection = opened.get(database);
		connection ??= createConnection(locals.server, database);
		opened.set(database, connection);
		return connection;
	};

	try {
		return await resolve(event, {
			// Runs while rendering, after every guard has refined the response.
			transformPageChunk: ({ html }) => fillHtmlLang(html, locals.locale)
		});
	} finally {
		await Promise.allSettled([...opened.values()].map((promise) => promise.then((c) => c.quit())));
	}
};

export const handleError: HandleServerError = ({ error, event }) => {
	// Expected errors (error(...) calls) already carry their message; log the rest.
	if ((error as { status?: number })?.status) {
		return error as App.Error;
	}
	console.error(`[sra] unhandled error on ${event.url.pathname}`, error);
	return {
		message: 'Something went wrong. Check the server logs for details.',
		status: 500
	};
};
