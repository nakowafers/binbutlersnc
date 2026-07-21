import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    use: {
        baseURL: 'https://localhost:8788',
        ignoreHTTPSErrors: true,
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'Mobile Chrome',
            use: { ...devices['Pixel 5'] },
        },
    ],
    webServer: {
        command:
            'npm run build:cf && npx wrangler d1 migrations apply binbutlersnc-db --local && npx wrangler pages dev .vercel/output/static --port 8788 --bundle --show-interactive-dev-session=false --local-protocol https',
        url: 'https://localhost:8788',
        ignoreHTTPSErrors: true,
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
    },
});
