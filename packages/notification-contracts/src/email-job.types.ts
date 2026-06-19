export type ConfirmSubscriptionEmailJobData = {
  type: 'confirm-subscription';
  sagaId: string;
  subscriptionId: string;
  email: string;
  repoName: string;
  confirmToken: string;
};

export type NewReleaseEmailJobData = {
  type: 'new-release';
  email: string;
  repoName: string;
  tag: string;
  unsubscribeToken: string;
};

export type EmailJobData =
  | ConfirmSubscriptionEmailJobData
  | NewReleaseEmailJobData;
