import { Page, Locator } from '@playwright/test';

export class HomePage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly repoInput: Locator;
  readonly submitButton: Locator;
  readonly messageBox: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByTestId('email-input');
    this.repoInput = page.getByTestId('repo-input');
    this.submitButton = page.getByTestId('submit-button');
    this.messageBox = page.getByTestId('message-box');
  }

  async goto() {
    await this.page.goto('/');
  }

  async subscribe(email: string, repo: string) {
    await this.emailInput.fill(email);
    await this.repoInput.fill(repo);
    await this.submitButton.click();
  }
}
