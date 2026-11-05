import { defineConfig, devices } from '@playwright/test'

// Supabase URL/key and the instructor test account come from .env.local
// (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, INSTRUCTOR_EMAIL, INSTRUCTOR_PASSWORD).
try {
  process.loadEnvFile('.env.local')
} catch {
  // In CI the variables are provided by the environment instead.
}

const PORT = 5196
// BASE_URL=https://your-site.pages.dev npm run test:e2e  → test the deployed site instead.
const REMOTE = process.env.BASE_URL?.replace(/\/+$/, '')

export default defineConfig({
  testDir: 'tests/e2e',
  // The database allows only one Active survey, so tests must never run in parallel.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: REMOTE ?? `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    acceptDownloads: true,
  },
  webServer: REMOTE
    ? undefined
    : // Test the production build (as deployed). The dev server occasionally fails a
      // lazy-page import while it re-optimizes dependencies, which made tests flaky.
      {
        command: `npx vite build && npx vite preview --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: false,
        timeout: 120_000,
        env: { VITE_PUBLIC_SITE_URL: `http://localhost:${PORT}` },
      },
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    {
      name: 'phone',
      use: { ...devices['Pixel 7'], channel: 'chrome' },
      // Phone-specific suites; the desktop suites already check 390px layouts.
      testMatch: /(student|layout)\.spec\.ts/,
    },
  ],
})
