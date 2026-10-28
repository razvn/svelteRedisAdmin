import { readFileSync } from 'node:fs';
import { appConfigSchema, type AppConfig } from './schema.ts';

export class ConfigError extends Error {}

/**
 * Parse and validate a raw config. Kept pure (input -> AppConfig) so tests can
 * feed it objects directly.
 *
 * @throws ConfigError when the shape is wrong or `cookieSecret` is missing while `login` is set.
 */
export function parseConfig(input: unknown): AppConfig {
	const parsed = appConfigSchema.safeParse(input);
	if (!parsed.success) {
		const issues = parsed.error.issues
			.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
			.join('; ');
		throw new ConfigError(`Invalid configuration: ${issues}`);
	}
	const config = parsed.data;
	if (config.login && !config.cookieSecret) {
		throw new ConfigError(
			'Invalid configuration: cookieSecret (>= 16 chars) is required when login is configured'
		);
	}
	return config;
}

/**
 * Load the config file. Order: `SRA_CONFIG` env path -> `config.json` -> `config.sample.json`.
 * Each entry is passed through `parseConfig`, so errors mention the file.
 */
export function loadConfig(configPath?: string): AppConfig {
	const candidates = configPath
		? [configPath]
		: [`${process.cwd()}/config.json`, `${process.cwd()}/config.sample.json`];
	for (const path of candidates) {
		try {
			const raw = JSON.parse(readFileSync(path, 'utf8'));
			return parseConfig(raw);
		} catch (error) {
			if (error instanceof ConfigError) throw error;
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
			throw new ConfigError(`Cannot read configuration file ${path}: ${(error as Error).message}`);
		}
	}
	throw new ConfigError(
		`No configuration file found (looked at: ${candidates.join(', ')}). Copy config.sample.json to config.json.`
	);
}

/** Load the config once at server start; the result is treated as read-only. */
export function loadConfigOnce(configPath?: string): () => AppConfig {
	let cached: AppConfig | undefined;
	return () => {
		cached ??= loadConfig(configPath);
		return cached;
	};
}
