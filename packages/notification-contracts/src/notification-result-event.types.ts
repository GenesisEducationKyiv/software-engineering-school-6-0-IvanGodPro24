export type ConfirmationEmailSentEvent = {
  type: 'confirmation-email-sent';
  sagaId: string;
  subscriptionId: string;
  email: string;
  repoName: string;
};

export type ConfirmationEmailFailedEvent = {
  type: 'confirmation-email-failed';
  sagaId: string;
  subscriptionId: string;
  email: string;
  repoName: string;
  errorMessage: string;
};

export type NotificationResultEvent =
  | ConfirmationEmailSentEvent
  | ConfirmationEmailFailedEvent;
