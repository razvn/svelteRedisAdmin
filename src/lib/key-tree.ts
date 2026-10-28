/**
 * Pure key-tree building for the key browser's tree view: keys are split on the
 * server's separator (`app:user:1` → app › user › 1) into a nested, sorted
 * structure. Client-safe — no Redis, no server imports.
 */

export interface KeyTreeNode {
	/** Full prefix so far, e.g. `app` or `app:user`. */
	name: string;
	/** Display segment, e.g. `user`. */
	segment: string;
	/** Key names ending exactly at this node (no separator after). */
	keys: string[];
	/** Child folders, sorted by segment. */
	children: KeyTreeNode[];
}

export function buildKeyTree(keys: string[], separator: string): KeyTreeNode[] {
	const seen = new Set<string>();
	const nodes = new Map<string, KeyTreeNode>();
	const roots: KeyTreeNode[] = [];

	/** Find or create the node at `name`, attached under `parent` (or root). */
	const nodeFor = (name: string, segment: string, parent: KeyTreeNode | null): KeyTreeNode => {
		const existing = nodes.get(name);
		if (existing) return existing;
		const node: KeyTreeNode = { name, segment, keys: [], children: [] };
		nodes.set(name, node);
		if (parent) parent.children.push(node);
		else roots.push(node);
		return node;
	};

	for (const key of keys) {
		if (seen.has(key)) continue;
		seen.add(key);

		if (separator === '') {
			// No splitting: every key is its own root node.
			nodeFor(key, key, null).keys.push(key);
			continue;
		}

		const segments = key.split(separator);
		if (segments[segments.length - 1] === '') continue; // trailing separator: no key anywhere
		let parent: KeyTreeNode | null = null;
		let name = '';
		for (let i = 0; i < segments.length; i++) {
			name = i === 0 ? segments[0] : name + separator + segments[i];
			const node = nodeFor(name, segments[i], parent);
			if (i === segments.length - 1) node.keys.push(key);
			parent = node;
		}
	}

	const sort = (nodes: KeyTreeNode[]) => {
		nodes.sort((a, b) => a.segment.localeCompare(b.segment));
		for (const node of nodes) sort(node.children);
	};
	sort(roots);
	return roots;
}

/** Keys at this node plus every key below it. */
export function countTreeKeys(node: KeyTreeNode): number {
	let total = node.keys.length;
	for (const child of node.children) total += countTreeKeys(child);
	return total;
}

/**
 * Pre-order walk of the tree keeping only nodes whose ancestors are all in
 * `expanded` (root level is always shown), with `depth` for indentation.
 */
export function flattenExpanded(
	tree: KeyTreeNode[],
	expanded: Set<string>
): { node: KeyTreeNode; depth: number }[] {
	const rows: { node: KeyTreeNode; depth: number }[] = [];
	const walk = (nodes: KeyTreeNode[], depth: number) => {
		for (const node of nodes) {
			rows.push({ node, depth });
			if (expanded.has(node.name)) walk(node.children, depth + 1);
		}
	};
	walk(tree, 0);
	return rows;
}
