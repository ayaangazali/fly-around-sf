import { defineConfig, devices } from '@playwright/test';

const gl = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['json', { outputFile: 'reports/playwright.json' }]],
  use: { baseURL: 'http://127.0.0.1:4173/', trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions: { args: gl } },
  webServer: { command: 'pnpm preview', url: 'http://127.0.0.1:4173/', reuseExistingServer: !process.env.CI, timeout: 60_000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'ipad', use: { ...devices['iPad Pro 11'], browserName: 'chromium' }, grep: /@touch/ },
    { name: 'phone', use: { ...devices['Pixel 7'] }, grep: /@touch/ },
  ],
});
