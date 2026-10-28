import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { redirect } from '@sveltejs/kit';
import { loadConfigOnce } from '#lib/server/config/loader.ts';
import { parseSessionToken } from '#lib/server/auth/session.ts';
import { createConnection } from '#lib/server/redis/connection.ts';
import type { AppConfig } from '#lib/server/config/schema.ts';
import type { RedisConnection } from '#lib/server/redis/connection.ts';

const getConfig = loadConfigOnce(process.env['SRA_CONFIG']);

/** Routes reachable without a session. */
const PUBLIC_PATHS = new Set(['/login', '/logout']);

export const handle: Handle = async ({ event, resolve }) => {
	const locals = event.locals as typeof event.locals;

	let config: AppConfig | undefined;
	try {
		config = getConfig();
		locals.config = config;
		locals.configError = null;
	} catch (error) {
		locals.config = undefined as never;
		locals.configError = (error as Error).message;
	}

	locals.authRequired = !!config?.login?.length;
	locals.session = config
		? parseSessionToken(event.cookies.get(config.cookieName), config.cookieSecret ?? '')
		: null;
	locals.serverIndex = null;
	locals.server = null;

	if (locals.authRequired && !locals.session && !PUBLIC_PATHS.has(event.url.pathname)) {
		redirect(303, '/login');
	}
	if (locals.session && event.url.pathname === '/login') {
		redirect(303, '/');
	}

	// Resolve the active server for /server/[id]/... routes.
	const serverParam = event.params['id'];
	if (serverParam !== undefined && config) {
		const index = Number(serverParam);
		if (Number.isInteger(index) && index >= 0 && index < config.Servers.length) {
			locals.serverIndex = index;
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
		return await resolve(event);
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
