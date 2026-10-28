import { describe, expect, test } from 'vitest';
import { buildKeyTree, countTreeKeys, flattenExpanded } from './key-tree.ts';

describe('buildKeyTree', () => {
	test('nests keys on the separator and lands keys at their exact node', () => {
		const tree = buildKeyTree(['app:user:1', 'app:user:2', 'app:session', 'app'], ':');
		expect(tree).toHaveLength(1);
		expect(tree[0]).toMatchObject({ name: 'app', segment: 'app', keys: ['app'] });
		expect(tree[0].children.map((c) => c.name)).toEqual(['app:session', 'app:user']);
		expect(tree[0].children[0].keys).toEqual(['app:session']);
		expect(tree[0].children[1].keys).toEqual([]);
		expect(tree[0].children[1].children.map((c) => c.keys)).toEqual([
			['app:user:1'],
			['app:user:2']
		]);
	});

	test('sorts children by segment with localeCompare', () => {
		const tree = buildKeyTree(['b', 'a:c', 'A:d', 'a:b'], ':');
		expect(tree.map((n) => n.segment)).toEqual(['a', 'A', 'b']);
		expect(tree[0].children.map((n) => n.segment)).toEqual(['b', 'c']);
	});

	test('ignores duplicate keys', () => {
		const tree = buildKeyTree(['app:x', 'app:x', 'app:x'], ':');
		expect(tree).toHaveLength(1);
		expect(countTreeKeys(tree[0])).toBe(1);
		expect(tree[0].children[0].keys).toEqual(['app:x']);
	});

	test('keys without the separator become single root-level leaf nodes', () => {
		const tree = buildKeyTree(['plain', 'other'], ':');
		expect(tree.map((n) => n.segment)).toEqual(['other', 'plain']);
		expect(tree[1]).toMatchObject({ name: 'plain', keys: ['plain'], children: [] });
	});

	test('a key ending with the separator contributes no keys anywhere', () => {
		expect(buildKeyTree(['app:'], ':')).toEqual([]);
		expect(buildKeyTree([':'], ':')).toEqual([]);
		const tree = buildKeyTree(['app:', 'app:x'], ':');
		expect(tree).toHaveLength(1);
		expect(tree[0]).toMatchObject({ name: 'app', keys: [] });
		expect(countTreeKeys(tree[0])).toBe(1);
	});

	test('an empty separator treats every key as one root node, unsplit', () => {
		const tree = buildKeyTree(['a:b', 'c'], '');
		expect(tree).toHaveLength(2);
		expect(tree[0]).toEqual({ name: 'a:b', segment: 'a:b', keys: ['a:b'], children: [] });
		expect(tree[1]).toEqual({ name: 'c', segment: 'c', keys: ['c'], children: [] });
	});

	test('an empty key list builds an empty tree', () => {
		expect(buildKeyTree([], ':')).toEqual([]);
	});

	test('multi-character separators split on the whole string', () => {
		const tree = buildKeyTree(['a::b::1'], '::');
		expect(tree[0].name).toBe('a');
		expect(tree[0].children[0].name).toBe('a::b');
		expect(tree[0].children[0].children[0].keys).toEqual(['a::b::1']);
	});
});

describe('countTreeKeys', () => {
	test('counts keys at the node plus all descendants', () => {
		const tree = buildKeyTree(['a', 'a:b:1', 'a:b:2', 'a:c', 'z'], ':');
		expect(countTreeKeys(tree[0])).toBe(4);
		expect(countTreeKeys(tree[0].children[0])).toBe(2);
		expect(countTreeKeys(tree[1])).toBe(1);
	});
});

describe('flattenExpanded', () => {
	const tree = buildKeyTree(['app:user:1', 'app:session', 'plain'], ':');

	test('with nothing expanded only the root level is returned', () => {
		const rows = flattenExpanded(tree, new Set());
		expect(rows.map((r) => r.node.segment)).toEqual(['app', 'plain']);
		expect(rows.map((r) => r.depth)).toEqual([0, 0]);
	});

	test('with partial expansion walks pre-order with depth', () => {
		const app = tree[0];
		const rows = flattenExpanded(tree, new Set([app.name]));
		expect(rows.map((r) => [r.depth, r.node.name])).toEqual([
			[0, 'app'],
			[1, 'app:session'],
			[1, 'app:user'],
			[0, 'plain']
		]);
	});

	test('expanding a nested level reveals grandchildren', () => {
		const rows = flattenExpanded(tree, new Set(['app', 'app:user']));
		expect(rows.map((r) => r.node.name)).toEqual([
			'app',
			'app:session',
			'app:user',
			'app:user:1',
			'plain'
		]);
		expect(rows.at(-2)).toMatchObject({ depth: 2 });
	});
});
