import type { RequestHandler } from './$types';

/** Probe for Kubernetes / Docker: the process is up. Needs no session (see hooks.server.ts). */
export const GET: RequestHandler = () =>
	new Response('ok\n', {
		headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
	});
