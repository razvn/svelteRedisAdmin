import { redirect } from '@sveltejs/kit';
import { clearMarker } from '#lib/server/audit/marker.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ locals, cookies }) => {
	if (locals.session) locals.audit.write({ event: 'logout' });
	clearMarker(cookies);
	cookies.delete(locals.config?.cookieName ?? 'sra_session', { path: '/' });
	redirect(303, '/login');
};
