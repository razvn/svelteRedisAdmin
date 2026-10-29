import { error } from '@sveltejs/kit';
import { serverName } from '#lib/server/config/schema.ts';
import { serverHost } from '#lib/nav/paths.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	const t = locals.i18n.t;
	if (locals.configError) error(500, locals.configError);
	const session = locals.session;
	if (!session) error(401, t('Not signed in'));

	const servers = locals.config.Servers.map((server, index) => ({
		index,
		label: serverName(server)
	}));

	const activeIndex = locals.serverIndex;
	return {
		sidebar: {
			servers: servers.map((server) => ({
				...server,
				databases: locals.config.Servers[server.index].databases,
				defaultDb: locals.config.Servers[server.index].db
			}))
		},
		topbar: {
			user: session.username,
			host: activeIndex === null ? '' : serverHost(locals.config.Servers[activeIndex]),
			serverLabel: activeIndex === null ? t('All servers') : servers[activeIndex].label,
			serverIndex: activeIndex ?? 0,
			canLogout: locals.authRequired
		}
	};
};
