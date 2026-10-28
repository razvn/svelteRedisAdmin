import { error } from '@sveltejs/kit';
import { getServerInfo } from '#lib/server/redis/server.ts';
import { serverName } from '#lib/server/config/schema.ts';
import type { PageServerLoad } from './$types';

/** Preferred rendering order of the INFO sections. */
const SECTION_ORDER = ['server', 'memory', 'clients', 'stats', 'replication', 'cpu', 'keyspace'];

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.server) error(404, 'Server not found');
	const serverIndex = locals.serverIndex ?? 0;
	const client = await locals.redis();

	const info = await getServerInfo(client);
	const raw = await client.info();

	const known = Object.keys(info.sections)
		.filter((name) => name !== '')
		.sort((a, b) => a.localeCompare(b));

	const requested = url.searchParams.get('section') ?? '';
	const section = requested !== '' && known.includes(requested) ? requested : '';

	const names = Object.keys(info.sections)
		.filter((name) => name !== '' && (section === '' || name === section))
		.sort((a, b) => {
			const rank = (name: string) => {
				const index = SECTION_ORDER.indexOf(name);
				return index === -1 ? SECTION_ORDER.length : index;
			};
			return rank(a) - rank(b) || a.localeCompare(b);
		});

	return {
		serverIndex,
		serverLabel: serverName(locals.server),
		section,
		sections: known,
		report: names.map((name) => ({
			name,
			entries: Object.entries(info.sections[name] ?? {})
		})),
		raw
	};
};
