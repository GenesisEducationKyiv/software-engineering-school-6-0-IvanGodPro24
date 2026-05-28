import fs from 'node:fs/promises';
import path from 'node:path';
import handlebars from 'handlebars';
import { getEnvVar } from '../utils/getEnvVar.js';
import { IEmailProvider } from './email.service.js';
import { ISubscriptionEmailService } from './subscription.service.js';

export class SubscriptionEmailService implements ISubscriptionEmailService {
  constructor(
    private readonly emailProvider: IEmailProvider,
    private readonly templateDir: string,
  ) {}

  private async compileTemplate(
    templateName: string,
    data: Record<string, unknown>,
  ) {
    const templatePath = path.join(this.templateDir, `${templateName}.hbs`);

    const templateSource = await fs.readFile(templatePath, 'utf-8');
    const template = handlebars.compile(templateSource);
    return template(data);
  }

  async sendConfirmEmail(
    email: string,
    repoName: string,
    token: string,
  ): Promise<void> {
    const confirmUrl = `${getEnvVar('APP_URL')}/api/confirm/${token}`;
    const html = await this.compileTemplate('confirm-subscription', {
      repoName,
      confirmUrl,
    });

    await this.emailProvider.sendEmail(
      email,
      `Action required: Confirm your subscription to ${repoName}`,
      html,
    );
  }

  async sendNewReleaseEmail(
    email: string,
    repoName: string,
    tag: string,
    unsubscribeToken: string,
  ): Promise<void> {
    const unsubscribeUrl = `${getEnvVar('APP_URL')}/api/unsubscribe/${unsubscribeToken}`;
    const releaseUrl = `https://github.com/${repoName}/releases/tag/${tag}`;

    const html = await this.compileTemplate('new-release', {
      repoName,
      tag,
      releaseUrl,
      unsubscribeUrl,
    });

    await this.emailProvider.sendEmail(
      email,
      `New release available: ${repoName} ${tag}`,
      html,
    );
  }
}
