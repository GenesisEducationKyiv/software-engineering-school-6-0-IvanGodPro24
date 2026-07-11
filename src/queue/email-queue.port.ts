import { EmailJobData } from '@github-notifier/notification-contracts';

export interface IEmailQueue {
  addEmail(jobData: EmailJobData): Promise<void>;
  addBulkEmails(jobsData: EmailJobData[]): Promise<void>;
}
