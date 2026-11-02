// Feature: console (features/console.md): multi-command run, blocked command, read-only user.
export default async function ({ page, base, login, key, db, redis, proof, note, expect }) {
	const k = key('console');
	await page.goto(`${base}/server/0/console`);
	await expect(page.getByTestId('console-page')).toBeVisible();
	const input = page.locator('textarea[name="input"]');
	await input.fill(
		`SELECT ${db}\n# full-line comments are skipped\nSET ${k} hello\nGET ${k}\nSHUTDOWN`
	);
	await page.getByRole('button', { name: 'Run' }).click();
	const results = page.getByTestId('console-result');
	await expect(results.filter({ hasText: `GET ${k}` }).getByTestId('console-reply')).toContainText(
		'hello'
	);
	await expect(results.filter({ hasText: 'SHUTDOWN' })).toContainText(
		'SHUTDOWN is not allowed from the console.'
	);
	await expect(results).toHaveCount(4);
	await proof('ran');
	expect(await redis.get(k)).toBe('hello');
	note('ran', { value: await redis.get(k), results: await results.allInnerTexts() });

	await page.getByRole('button', { name: 'User menu' }).click();
	await page.getByRole('menuitem', { name: 'Log out' }).click();
	await login('viewer');
	await page.goto(`${base}/server/0/console`);
	await expect(page.getByText('Read-only access: the console is disabled.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Run' })).toBeDisabled();
	await proof('viewer-disabled');
}
