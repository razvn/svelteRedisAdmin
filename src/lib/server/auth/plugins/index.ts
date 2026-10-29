import { ConfigError } from '#lib/server/config/loader.ts';
import type { AppConfig } from '#lib/server/config/schema.ts';
import { configPlugin } from './config.ts';
import { headerPlugin } from './header.ts';
import { httpPlugin } from './http.ts';
import type { AuthPlugin } from './types.ts';

/**
 * Resolve the authentication plugin named by `config.auth.plugin`.
 *
 * @throws ConfigError at load time for an unknown plugin name or a `header`
 * plugin without its identity header configured.
 */
export function getAuthPlugin(config: AppConfig): AuthPlugin {
	switch (config.auth.plugin) {
		case 'config':
			return configPlugin;
		case 'http':
			return httpPlugin;
		case 'header':
			if (!config.auth.header) {
				throw new ConfigError(
					'Invalid configuration: auth.header is required when auth.plugin is "header"'
				);
			}
			return headerPlugin;
		default:
			throw new ConfigError(`Invalid configuration: unknown auth plugin "${config.auth.plugin}"`);
	}
}
