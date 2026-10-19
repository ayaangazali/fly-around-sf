import { test as base, expect, type Page } from '@playwright/test';
import type { TestApi } from '../../src/test-api';

declare global {
  interface Window {
    __fly: TestApi;
  }
}

export async function boot(page: Page, query = ''): Promise<string[]> {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  await page.goto(`./?test${query ? `&${query}` : ''}`);
  await page.waitForFunction(() => window.__fly?.ready === true, undefined, { timeout: 120_000 });
  return consoleErrors;
}

export const test = base;
export { expect };
