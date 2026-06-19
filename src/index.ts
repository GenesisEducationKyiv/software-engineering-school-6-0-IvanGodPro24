import express from 'express';
import path from 'node:path';
import cron from 'node-cron';
import {
  metricsMiddleware,
  getMetrics,
} from './infrastructure/metrics/metrics.js';
import { getEnvVar } from '@github-notifier/shared';
import { PinoLogger } from '@github-notifier/shared';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { errorHandler } from './middleware/errorHandler.js';
import rootRouter from './routes/index.js';
import { scannerService } from './containers/scanner.container.js';
import { bullBoardRouter } from './queue/dashboard.js';
import { swaggerDocs } from './infrastructure/swagger/swaggerDocs.js';
import { notificationResultWorker } from './containers/notification-result.container.js';

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
  logger.info('Scanner initialized');
  cron.schedule('*/10 * * * *', scannerService.scanRepositories);

  notificationResultWorker.start();

  app.listen(PORT, () => {
    logger.info(`Server is running on ${URL}`);
    logger.info('Worker is running in the same process');
  });
}
