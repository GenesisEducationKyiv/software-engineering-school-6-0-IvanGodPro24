import { EmailJobData } from '@github-notifier/notification-contracts';
import { ISubscriptionEmailService } from './subscription-email.service.js';

export class EmailJobHandler {
  constructor(private readonly emailService: ISubscriptionEmailService) {}

  async handle(data: EmailJobData): Promise<void> {
    switch (data.type) {
      case 'confirm-subscription':
        await this.emailService.sendConfirmEmail(
          data.email,
          data.repoName,
          data.confirmToken,
        );
        return;

      case 'new-release':
        await this.emailService.sendNewReleaseEmail(
          data.email,
          data.repoName,
          data.tag,
          data.unsubscribeToken,
        );
        return;

      default:
        throw new Error('Unsupported email job type');
    }
  }
}
