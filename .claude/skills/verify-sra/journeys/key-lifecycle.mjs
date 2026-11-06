// Feature: key editor (features/key-editor.md): create -> edit -> TTL -> rename -> delete, as admin.
export default async function ({ page, base, key, db, redis, proof, note, expect }) {
	const name = key('lifecycle');
	const renamed = key('lifecycle-renamed');
	const dbUrl = `${base}/server/0/db/${db}`;

	await page.goto(dbUrl);
	// Two entry points: the tab bar and the page-header button. Use the tab bar here.
	await page.getByTestId('tab-bar').getByRole('link', { name: 'New key' }).click();
	await expect(page.getByTestId('new-key')).toBeVisible();
	await page.getByLabel('Key name').fill(name);
	await page.getByLabel('Type').selectOption('string');
	await page.getByLabel('Initial value').fill('{"step":1}');
	await proof('new-key-form');
	await page.getByRole('button', { name: 'Create key' }).click();
	await expect(page.getByTestId('key-view')).toBeVisible();
	await expect(page.getByRole('heading', { name })).toBeVisible();
	await expect(page.getByText('This value parses as JSON.')).toBeVisible();
	await proof('created');
	note('created', { key: name, value: await redis.get(name), type: await redis.type(name) });
	expect(await redis.get(name)).toBe('{"step":1}');

	await page.locator('#save-string-form textarea[name="value"]').fill('{"step":2}');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect.poll(() => redis.get(name)).toBe('{"step":2}');
	await page.reload();
	await expect(page.locator('#save-string-form textarea[name="value"]')).toHaveValue('{"step":2}');
	await proof('saved');
	note('saved', { value: await redis.get(name) });

	await page.getByRole('button', { name: 'TTL' }).click();
	const ttlDialog = page.getByRole('dialog', { name: 'Edit TTL' });
	await ttlDialog.getByLabel('Seconds').fill('600');
	await ttlDialog.getByRole('button', { name: 'Apply' }).click();
	await expect.poll(() => redis.ttl(name)).toBeGreaterThan(500);
	await proof('ttl-set');
	note('ttl-set', { ttl: await redis.ttl(name) });

	await page.getByRole('button', { name: 'Rename' }).click();
	const renameDialog = page.getByRole('dialog', { name: 'Rename key' });
	await renameDialog.getByLabel('New name').fill(renamed);
	await renameDialog.getByRole('button', { name: 'Rename' }).click();
	await expect(page.getByRole('heading', { name: renamed })).toBeVisible();
	expect(await redis.exists(name)).toBe(0);
	expect(await redis.get(renamed)).toBe('{"step":2}');
	expect(await redis.ttl(renamed)).toBeGreaterThan(500);
	await proof('renamed');
	note('renamed', {
		old: await redis.exists(name),
		new: await redis.get(renamed),
		ttl: await redis.ttl(renamed)
	});

	await page.getByRole('button', { name: 'Delete' }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Delete key' }).click();
	await expect(page).toHaveURL(new RegExp(`/server/0/db/${db}(\\?|$)`));
	await expect(page.getByRole('link', { name: renamed })).toHaveCount(0);
	expect(await redis.exists(renamed)).toBe(0);
	await proof('deleted');
	note('deleted', { exists: await redis.exists(renamed) });
}
