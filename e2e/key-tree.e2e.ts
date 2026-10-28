import { expect, test, type Page } from '@playwright/test';
import { createClient, type RedisClientType } from 'redis';

// Uses the dev config.json (login admin/admin) and the redis1 instance on
// :33380 (database 0). Seeds its own `sra_e2e:` keys and removes them again, so
// it does not depend on docker/initdb/seed.sh data. Start Redis (`pnpm db:up`)
// before running: `pnpm test:e2e`.

const PREFIX = 'sra_e2e';
const SEED = [`${PREFIX}:app:config`, `${PREFIX}:app:counter`, `${PREFIX}leaf`];
let redis: RedisClientType;

test.beforeAll(async () => {
	redis = createClient({ socket: { host: '127.0.0.1', port: 33380 } }) as RedisClientType;
	await redis.connect();
	await redis.select(0);
	for (const key of SEED) await redis.set(key, 'e2e');
});

test.afterAll(async () => {
	await redis.del(SEED);
	await redis.disconnect();
});

async function login(page: Page) {
	await page.goto('/login');
	await page.getByLabel('Username').fill('admin');
	await page.getByLabel('Password').fill('admin');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByTestId('home')).toBeVisible();
}

test.describe('key browser tree view', () => {
	test('toggles to the tree, expands folders and links leaf keys', async ({ page }) => {
		await login(page);

		await page.goto('/server/0/db/0');
		await expect(page.getByTestId('key-table')).toBeVisible();

		await page.getByRole('link', { name: 'Tree' }).click();
		await expect(page).toHaveURL(/view=tree/);
		await expect(page.getByTestId('key-tree')).toBeVisible();

		// Root-level leaves are linked straight away…
		await expect(page.getByRole('link', { name: `${PREFIX}leaf` })).toBeVisible();
		// …while folder keys stay hidden until their folders are expanded.
		await expect(page.getByRole('link', { name: `${PREFIX}:app:config` })).toBeHidden();
		await page.getByRole('button', { name: `Expand ${PREFIX}` }).click();
		await page.getByRole('button', { name: `Expand ${PREFIX}:app` }).click();
		await expect(page.getByRole('link', { name: `${PREFIX}:app:config` })).toBeVisible();
		await expect(page.getByRole('link', { name: `${PREFIX}:app:counter` })).toBeVisible();

		// Back to the list, keeping the view in the URL.
		await page.getByRole('link', { name: 'List' }).click();
		await expect(page).toHaveURL(/view=list/);
		await expect(page.getByTestId('key-table')).toBeVisible();
		await expect(page.getByRole('link', { name: `${PREFIX}:app:config` })).toBeVisible();
	});
});
