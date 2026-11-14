import { defineConfig, devices } from '@playwright/test';

/**
 * E2E は外部で起動済みの frontend (http://localhost:5173) と API を対象にする。
 * 起動中サービスを止めないため webServer は設定しない（テスト実行前に手動起動しておく）。
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
