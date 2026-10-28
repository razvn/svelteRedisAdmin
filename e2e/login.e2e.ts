import { expect, test } from '@playwright/test';

// Uses the dev config.json (login admin/admin, servers on :33380/:33381).
// Start Redis (`pnpm db:up`) before running: `pnpm test:e2e`.

test.describe('login flow', () => {
	test('redirects anonymous visitors to /login', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveURL(/\/login$/);
		await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
	});

	test('rejects wrong credentials', async ({ page }) => {
		await page.goto('/login');
		await page.getByLabel('Username').fill('admin');
		await page.getByLabel('Password').fill('wrong');
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page.getByTestId('login-error')).toContainText('Wrong username or password');
	});

	test('logs in and shows the server cards', async ({ page }) => {
		await page.goto('/login');
		await page.getByLabel('Username').fill('admin');
		await page.getByLabel('Password').fill('admin');
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page).toHaveURL(/\/$/);
		await expect(page.getByTestId('home')).toBeVisible();
		await expect(page.getByTestId('server-card')).toHaveCount(2);
	});

	test('logs out from the user menu', async ({ page }) => {
		await page.goto('/login');
		await page.getByLabel('Username').fill('admin');
		await page.getByLabel('Password').fill('admin');
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page.getByTestId('home')).toBeVisible();
		await page.getByRole('button', { name: 'User menu' }).click();
		await page.getByRole('button', { name: 'Log out' }).click();
		await expect(page).toHaveURL(/\/login$/);
	});
});
