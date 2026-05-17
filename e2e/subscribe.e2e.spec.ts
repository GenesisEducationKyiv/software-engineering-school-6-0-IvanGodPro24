import { test, expect } from '@playwright/test';
import { HomePage } from './pages/home.page.js';

test.describe('Subscription e2e', () => {
  let homePage: HomePage;

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
    await homePage.goto();
  });

  test('should successfully subscribe a new user', async () => {
    const uniqueEmail = `user${Date.now()}@e2e.com`;
    const repo = 'facebook/react';

    await homePage.subscribe(uniqueEmail, repo);

    await expect(homePage.messageBox).toBeVisible();
    await expect(homePage.messageBox).toHaveClass(/success/);
    await expect(homePage.messageBox).toContainText(/Subscription created/i);
  });

  test('should show conflict error if already subscribed', async () => {
    const uniqueEmail = `conflict${Date.now()}@e2e.com`;
    const repo = 'facebook/react';

    await homePage.subscribe(uniqueEmail, repo);
    await expect(homePage.messageBox).toHaveClass(/success/);

    await homePage.subscribe(uniqueEmail, repo);

    await expect(homePage.messageBox).toBeVisible();
    await expect(homePage.messageBox).toHaveClass(/error/);
    await expect(homePage.messageBox).toContainText(/Subscription is pending/i);
  });

  test('should show error if repository does not exist on GitHub', async () => {
    const uniqueEmail = `notfound${Date.now()}@e2e.com`;
    const fakeRepo = 'fake-owner-999/not-exist';

    await homePage.subscribe(uniqueEmail, fakeRepo);

    await expect(homePage.messageBox).toBeVisible();
    await expect(homePage.messageBox).toHaveClass(/error/);
    await expect(homePage.messageBox).toContainText(/Repository not found/i);
  });

  test('should show validation error for invalid repository format', async () => {
    const uniqueEmail = `invalid${Date.now()}@e2e.com`;
    const invalidRepo = 'just-repo-without-owner';

    await homePage.subscribe(uniqueEmail, invalidRepo);

    await expect(homePage.messageBox).toBeVisible();
    await expect(homePage.messageBox).toHaveClass(/error/);
    await expect(homePage.messageBox).toContainText(/Invalid repo format/i);
  });
});
