import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 4173);
const gl = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['json', { outputFile: process.env.E2E_JSON || 'reports/playwright.json' }]],
  use: { baseURL: `http://127.0.0.1:${port}/`, trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions: { args: gl } },
  webServer: { command: `pnpm vite preview --host 127.0.0.1 --port ${port} --strictPort`, url: `http://127.0.0.1:${port}/`, reuseExistingServer: !process.env.CI, timeout: 60_000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'ipad', use: { ...devices['iPad Pro 11'], browserName: 'chromium' }, grep: /@touch/ },
    { name: 'phone', use: { ...devices['Pixel 7'] }, grep: /@touch/ },
  ],
});
