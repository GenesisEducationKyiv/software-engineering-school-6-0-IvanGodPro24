import { NotificationResultEvent } from '@github-notifier/notification-contracts';
import { ILogger } from '@github-notifier/shared';
import { SubscriptionSagaRepository } from './subscription-saga.repository.js';
import { SubscriptionSagaCompensationService } from './subscription-saga-compensation.service.js';

export class NotificationResultHandler {
  constructor(
    private readonly sagaRepository: SubscriptionSagaRepository,
    private readonly compensationService: SubscriptionSagaCompensationService,
    private readonly logger: ILogger,
  ) {}

  async handle(event: NotificationResultEvent): Promise<void> {
    switch (event.type) {
      case 'confirmation-email-sent':
        await this.handleEmailSent(event.sagaId);
        return;

      case 'confirmation-email-failed':
        await this.compensationService.compensate(
          event.sagaId,
          event.errorMessage,
        );
        return;
    }
  }

  private async handleEmailSent(sagaId: string): Promise<void> {
    const saga = await this.sagaRepository.findById(sagaId);

    if (!saga) {
      this.logger.warn({ sagaId }, 'Saga not found for email sent event');
      return;
    }

    if (saga.status === 'COMPLETED') {
      this.logger.info({ sagaId }, 'Saga already completed');
      return;
    }

    if (saga.status === 'COMPENSATED' || saga.status === 'FAILED') {
      this.logger.warn(
        { sagaId, status: saga.status },
        'Email sent event ignored for finished saga',
      );
      return;
    }

    await this.sagaRepository.markCompleted(sagaId);

    this.logger.info({ sagaId }, 'Subscription saga completed');
  }
}
