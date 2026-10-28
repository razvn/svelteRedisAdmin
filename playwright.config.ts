import { defineConfig } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
	testDir: 'e2e',
	testMatch: '*.e2e.ts',
	timeout: 30_000,
	retries: 0,
	reporter: [['list']],
	use: {
		baseURL: `http://127.0.0.1:${PORT}`,
		trace: 'retain-on-failure'
	},
	webServer: {
		command: 'pnpm build && pnpm preview --port 4173 --host 127.0.0.1',
		url: `http://127.0.0.1:${PORT}`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	}
});
