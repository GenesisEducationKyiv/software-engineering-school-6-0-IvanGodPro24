import express from 'express';
import path from 'node:path';
import {
  metricsMiddleware,
  getMetrics,
} from './infrastructure/metrics/metrics.js';
import { getEnvVar } from '@github-notifier/shared';
import { PinoLogger } from '@github-notifier/shared';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { errorHandler } from './middleware/errorHandler.js';
import rootRouter from './routes/index.js';
import { bullBoardRouter } from './queue/dashboard.js';
import { swaggerDocs } from './infrastructure/swagger/swaggerDocs.js';
import { notificationResultWorker } from './containers/notification-result.container.js';
import { scannerEventWorker } from './containers/scanner-event.container.js';

const logger = new PinoLogger('App');

export const app = express();
const PORT = getEnvVar('PORT', '3000');
const URL = getEnvVar('APP_URL', 'http://localhost:3000');

app.use(metricsMiddleware);
app.get('/metrics', getMetrics);

app.use(express.static(path.join(process.cwd(), 'public')));

app.use('/api', rootRouter);
app.use('/admin/queues', bullBoardRouter);
app.use('/api-docs', swaggerDocs());

app.use(notFoundHandler);
app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  notificationResultWorker.start();
  scannerEventWorker.start();

  app.listen(PORT, () => {
    logger.info(`Server is running on ${URL}`);
    logger.info('Workers are running in the same process');
  });
}
