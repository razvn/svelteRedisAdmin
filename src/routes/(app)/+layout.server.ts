import { error } from '@sveltejs/kit';
import { serverName } from '#lib/server/config/schema.ts';
import { canAccessServer } from '#lib/server/auth/access.ts';
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
	})).filter((server) => canAccessServer(session, server.index));

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
			role: session.role,
			host: activeIndex === null ? '' : serverHost(locals.config.Servers[activeIndex]),
			serverLabel:
				activeIndex === null
					? t('All servers')
					: (servers.find((server) => server.index === activeIndex)?.label ?? t('All servers')),
			serverIndex: activeIndex ?? 0,
			canLogout: locals.authRequired
		}
	};
};
