// Feature: key browser (features/key-browser.md): filter, list/tree view, bulk delete, as admin.
export default async function ({ page, base, key, db, redis, proof, note, expect }) {
	const keys = [key('app:config'), key('app:counter'), key('leaf')];
	await redis.del([...keys, key('user:1')]);
	for (const k of keys) await redis.set(k, 'v');
	await redis.hSet(key('user:1'), { name: 'Alice' });
	const prefix = key('');

	await page.goto(`${base}/server/0/db/${db}`);
	await expect(page.getByTestId('key-table')).toBeVisible();
	await page.getByLabel('Key filter').fill(`${prefix}app:*`);
	await page.getByRole('button', { name: 'Apply' }).click();
	await expect(page.getByTestId('key-row')).toHaveCount(2);
	await expect(page.getByRole('link', { name: keys[0] })).toBeVisible();
	await expect(page.getByRole('link', { name: keys[2] })).toHaveCount(0);
	await proof('filtered');

	await page.getByLabel('Key filter').fill(`${prefix}*`);
	await page.getByLabel('Key type').selectOption('hash');
	await page.getByRole('button', { name: 'Apply' }).click();
	await expect(page.getByTestId('key-row')).toHaveCount(1);
	await expect(page.getByRole('link', { name: key('user:1') })).toBeVisible();
	await proof('type-filtered');

	await page.getByLabel('Key type').selectOption({ label: 'All types' });
	await page.getByRole('button', { name: 'Apply' }).click();
	// Wait for the reload: the view links are built from the current URL (filter + type).
	await expect(page.getByRole('link', { name: key('user:1') })).toBeVisible();
	await expect(page.getByRole('link', { name: keys[2] })).toBeVisible();
	await page.getByRole('link', { name: 'Tree' }).click();
	await expect(page).toHaveURL(/view=tree/);
	await expect(page.getByTestId('key-tree')).toBeVisible();
	// Run keys sit under sra_verify > <RUN_ID> > ...; expand down to the app folder.
	await page.getByRole('button', { name: 'Expand sra_verify', exact: true }).click();
	await page.getByRole('button', { name: `Expand ${prefix.slice(0, -1)}`, exact: true }).click();
	await page.getByRole('button', { name: `Expand ${prefix}app`, exact: true }).click();
	await expect(page.getByRole('link', { name: keys[1] })).toBeVisible();
	await proof('tree-expanded');

	await page.getByRole('link', { name: 'List' }).click();
	await expect(page).toHaveURL(/view=list/);
	await page.getByLabel(`Select ${keys[0]}`).check();
	await page.getByLabel(`Select ${keys[1]}`).check();
	await expect(page.getByText('2 selected')).toBeVisible();
	await page.getByRole('button', { name: 'Delete selected' }).click();
	// The browser reloads with the same filter: the two deleted rows go, the others stay.
	await expect(page.getByRole('link', { name: keys[0] })).toHaveCount(0);
	await expect(page.getByRole('link', { name: keys[1] })).toHaveCount(0);
	await expect(page.getByRole('link', { name: keys[2] })).toBeVisible();
	expect(await redis.exists(keys.slice(0, 2))).toBe(0);
	expect(await redis.exists(keys[2])).toBe(1);
	await proof('bulk-deleted');
	note('bulk-deleted', { deleted: keys.slice(0, 2), remaining: await redis.exists(keys[2]) });
}
