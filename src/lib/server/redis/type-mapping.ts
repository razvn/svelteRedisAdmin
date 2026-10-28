import {
	RESP_TYPES,
	type RedisClientType,
	type RedisFunctions,
	type RedisModules,
	type RedisScripts,
	type RespVersions,
	type TypeMapping
} from 'redis';

/** Type mapping that returns bulk strings (`$` replies) as Buffers. */
const BUFFER_TYPE_MAPPING: TypeMapping = {
	[RESP_TYPES.BLOB_STRING]: Buffer
};

/**
 * A view of `client` whose string replies come back as Buffers. It shares the
 * underlying socket; only the reply decoding differs. Use it whenever values may
 * be binary (key names, GET, HGETALL, ...).
 */
export function buffers<
	M extends RedisModules,
	F extends RedisFunctions,
	S extends RedisScripts,
	RESP extends RespVersions,
	TM extends TypeMapping
>(client: RedisClientType<M, F, S, RESP, TM>) {
	return client.withCommandOptions({ typeMapping: BUFFER_TYPE_MAPPING });
}
