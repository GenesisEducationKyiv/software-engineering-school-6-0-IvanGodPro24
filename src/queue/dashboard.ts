import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { emailQueue } from './email.queue.js';
import { notificationResultQueue } from './notification-result.queue.js';
import { scannerCommandQueue } from './scanner-command.queue.js';
import { scannerEventQueue } from './scanner-event.queue.js';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(emailQueue),
    new BullMQAdapter(notificationResultQueue),
    new BullMQAdapter(scannerCommandQueue),
    new BullMQAdapter(scannerEventQueue),
  ],
  serverAdapter,
});

export const bullBoardRouter = serverAdapter.getRouter();
