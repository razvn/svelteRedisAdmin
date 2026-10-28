import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ locals, cookies }) => {
	cookies.delete(locals.config?.cookieName ?? 'sra_session', { path: '/' });
	redirect(303, '/login');
};
