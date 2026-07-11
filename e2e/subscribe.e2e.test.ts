import { test, expect } from '@playwright/test';
import { HomePage } from './pages/home.page.js';
import { prisma } from '../src/infrastructure/db/client.js';

test.describe('Subscription e2e', () => {
  let homePage: HomePage;

  test.beforeAll(async () => {
    await prisma.subscription.deleteMany({
      where: {
        email: { contains: '@e2e.com' },
      },
    });
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
    await homePage.goto();
  });

  test('should successfully start subscription saga for a new user', async () => {
    const uniqueEmail = `user${Date.now()}@e2e.com`;
    const repo = 'facebook/react';

    await homePage.subscribe(uniqueEmail, repo);

    await expect(homePage.messageBox).toBeVisible();
    await expect(homePage.messageBox).toHaveClass(/success/);
    await expect(homePage.messageBox).toContainText(
      /Subscription request accepted/i,
    );
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
