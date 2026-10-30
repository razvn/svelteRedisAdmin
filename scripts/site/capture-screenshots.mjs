/**
 * pnpm site:screenshots
 *
 * Captures the marketing screenshots of the presentation site (site/assets/screenshots) from a
 * running app. Env: SITE_BASE_URL (default http://localhost:5173) and SITE_USER/SITE_PASSWORD
 * (default admin/admin from config.sample.json). Forces English with the `sra_lang` cookie and
 * the theme with mode-watcher's localStorage key (the app's own theme preference is never
 * touched — this is a throwaway browser context). Logs in through the login form, so any auth
 * plugin that ends with a session cookie works. Output is PNG.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = (process.env.SITE_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const USER = process.env.SITE_USER ?? 'admin';
const PASSWORD = process.env.SITE_PASSWORD ?? 'admin';
const OUT = join(import.meta.dirname, '..', '..', 'site', 'assets', 'screenshots');

const views = [
	{ name: 'login', auth: false, path: '/login' },
	{ name: 'home', auth: true, path: '/' },
	{ name: 'server', auth: true, path: '/server/0' },
	{ name: 'browser', auth: true, path: '/server/0/db/0' },
	{ name: 'tree', auth: true, path: '/server/0/db/0?view=tree' },
	{ name: 'key', auth: true, path: '/server/0/db/0/key/user:1' },
	{ name: 'console', auth: true, path: '/server/0/console' }
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

for (const scheme of ['light', 'dark']) {
	const context = await browser.newContext({
		viewport: { width: 1440, height: 900 },
		deviceScaleFactor: 2,
		colorScheme: scheme,
		locale: 'en-US'
	});
	// The app themes itself from mode-watcher's localStorage key, not the media query alone.
	await context.addInitScript((mode) => {
		try {
			localStorage.setItem('mode-watcher-mode', mode);
		} catch {
			/* storage may be unavailable in previews; the colorScheme still helps */
		}
	}, scheme);
	const page = await context.newPage();

	// Log in once through the form; the session cookie then covers the authed views.
	await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
	const onLogin = await page
		.getByRole('button', { name: 'Sign in' })
		.isVisible()
		.catch(() => false);
	if (onLogin) {
		await page.getByLabel('Username').fill(USER);
		await page.getByLabel('Password').fill(PASSWORD);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await page.waitForURL(`${BASE}/`);
	}
	await context.addCookies([{ name: 'sra_lang', value: 'en', url: BASE }]);

	for (const view of views) {
		await page.goto(`${BASE}${view.path}`, { waitUntil: 'networkidle' });
		await page.evaluate(() => document.fonts.ready);
		await page.waitForTimeout(500);
		if (view.name === 'console' && scheme === 'light') {
			// Run a couple of commands so the console shows real replies.
			const input = page.locator('textarea[name="input"]');
			if (await input.isVisible().catch(() => false)) {
				await input.fill('GET app:config\nHGETALL user:1');
				await page.getByRole('button', { name: 'Run' }).click();
				await page.waitForLoadState('networkidle');
				await page.waitForTimeout(400);
			}
		}
		await page.screenshot({
			path: join(OUT, `${view.name}-${scheme}.png`),
			type: 'png'
		});
		console.log(`${view.name}-${scheme}.png`);
	}
	await context.close();
}

await browser.close();
console.log(`done -> ${OUT}`);
