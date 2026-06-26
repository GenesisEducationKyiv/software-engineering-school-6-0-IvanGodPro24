import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    env: {
      DATABASE_URL:
        'postgresql://test_user:test_password@localhost:5434/test_db?schema=public',
      REDIS_URL: 'redis://localhost:6380',
      API_KEY: 'super-secret-key',
      SCANNER_SERVICE_GRPC_ADDRESS: 'localhost:50051',
      SCANNER_SERVICE_GRPC_TIMEOUT_MS: '5000',
    },
  },
});
