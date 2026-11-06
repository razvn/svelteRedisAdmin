/**
 * Runs one journey against a live verification run, the way a user would: real Chromium, real login
 * form, real Redis. Invoked by `sra-verify drive RUN_ID JOURNEY [USER]`; do not call directly.
 *
 * A journey is an ES module whose default export receives:
 *   page, base       Playwright page (already logged in as USER) and the instance URL
 *   login(user)      log in again as another user (admin | writer | viewer), same page
 *   key(name)        the run-scoped Redis key name `sra_verify:<RUN_ID>:<name>`
 *   db               the verification database index (5); browse it at `${base}/server/0/db/${db}`
 *   redis            node-redis client already SELECTed on that db, for setup and side-effect checks
 *   proof(step)      writes evidence/<journey>/<nn>-<step>.png + .aria.txt (screenshot + ARIA snapshot)
 *   note(step, data) appends {step, data} to evidence/<journey>/notes.jsonl (side-effect proof)
 *   expect           @playwright/test expect
 * Throwing fails the journey; a failure screenshot and a Playwright trace are kept either way.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { createClient } from 'redis';

const [runDir, journeyPath, user = 'admin'] = process.argv.slice(2);
const state = Object.fromEntries(
	readFileSync(join(runDir, 'state.env'), 'utf8')
		.trim()
		.split('\n')
		.map((line) => line.split(/=(.*)/s).slice(0, 2))
);
const base = state.URL;
const db = Number(state.VERIFY_DB);
const name = basename(journeyPath, '.mjs');
const out = join(runDir, 'evidence', name);
mkdirSync(out, { recursive: true });

const PASSWORDS = { admin: 'admin', writer: 'writer', viewer: 'viewer' };
let step = 0;

const redis = createClient({ socket: { host: '127.0.0.1', port: 33380 }, database: db });
await redis.connect();

const browser = await chromium.launch();
const context = await browser.newContext({
	viewport: { width: 1440, height: 900 },
	locale: 'en-US'
});
// English UI regardless of the machine locale: the app reads the sra_lang cookie first.
await context.addCookies([{ name: 'sra_lang', value: 'en', url: base }]);
await context.tracing.start({ screenshots: true, snapshots: true });
const page = await context.newPage();

async function login(who) {
	await page.goto(`${base}/login`);
	await page.getByLabel('Username').fill(who);
	await page.getByLabel('Password').fill(PASSWORDS[who] ?? who);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByTestId('home')).toBeVisible();
}

async function proof(label) {
	const stem = join(out, `${String(++step).padStart(2, '0')}-${label}`);
	await page.screenshot({ path: `${stem}.png`, fullPage: true });
	writeFileSync(
		`${stem}.aria.txt`,
		`url: ${page.url()}\n${await page.locator('body').ariaSnapshot()}\n`
	);
}

function note(label, data) {
	appendFileSync(join(out, 'notes.jsonl'), `${JSON.stringify({ step: label, data })}\n`);
}

const key = (k) => `${state.KEY_PREFIX}${k}`;

let failed = null;
try {
	const journey = (await import(pathToFileURL(journeyPath).href)).default;
	if (user !== 'none') await login(user);
	await journey({ page, base, login, key, db, redis, proof, note, expect });
} catch (error) {
	failed = error;
	await page.screenshot({ path: join(out, 'FAILED.png'), fullPage: true }).catch(() => {});
} finally {
	await context.tracing.stop({ path: join(out, 'trace.zip') });
	await browser.close();
	await redis.close();
}

if (failed) {
	console.error(`FAIL ${name}: ${failed.message}`);
	console.error(`evidence: ${out}`);
	process.exit(1);
}
console.log(`PASS ${name} (${step} proof steps)`);
console.log(`evidence: ${out}`);
