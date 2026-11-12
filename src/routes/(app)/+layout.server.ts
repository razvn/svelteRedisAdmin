import { error } from '@sveltejs/kit';
import { serverName } from '#lib/server/config/schema.ts';
import { serverHost } from '#lib/nav/paths.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const t = locals.i18n.t;
	if (locals.configError) error(500, locals.configError);
	const session = locals.session;
	if (!session) error(401, t('Not signed in'));

	const servers = (await locals.servers()).map((entry) => ({
		id: entry.id,
		label: serverName(entry.server),
		databases: entry.server.databases,
		defaultDb: entry.server.db
	}));

	const activeId = locals.serverId;
	const active = locals.server;
	return {
		sidebar: { servers },
		topbar: {
			user: session.username,
			role: session.role,
			host: active === null ? '' : serverHost(active),
			serverLabel: active === null ? t('All servers') : serverName(active),
			serverId: activeId ?? '0',
			canLogout: locals.authRequired,
			portal: locals.config.Portal ?? null
		}
	};
};
