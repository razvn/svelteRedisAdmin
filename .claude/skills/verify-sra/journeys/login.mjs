// Feature: login (features/login.md). Run with USER=none: this journey logs in itself.
export default async function ({ page, base, login, proof, expect }) {
	await page.goto(`${base}/`);
	await expect(page).toHaveURL(/\/login$/);
	await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
	await proof('anonymous-redirected');

	await page.getByLabel('Username').fill('admin');
	await page.getByLabel('Password').fill('wrong');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByTestId('login-error')).toContainText('Wrong username or password');
	await proof('wrong-password');

	await login('admin');
	await expect(page.getByTestId('server-card')).toHaveCount(2);
	await proof('admin-home');

	await page.getByRole('button', { name: 'User menu' }).click();
	await page.getByRole('menuitem', { name: 'Log out' }).click();
	await expect(page).toHaveURL(/\/login$/);

	// rw user restricted to server 0 sees one card only.
	await login('writer');
	await expect(page.getByTestId('server-card')).toHaveCount(1);
	await proof('writer-home-one-server');
	await expect(
		page.getByTestId('app-sidebar').getByRole('link', { name: 'Verify redis2' })
	).toHaveCount(0);
	const hidden = await page.goto(`${base}/server/1`);
	expect([403, 404]).toContain(hidden.status());
	await proof('writer-hidden-server-refused');
}
