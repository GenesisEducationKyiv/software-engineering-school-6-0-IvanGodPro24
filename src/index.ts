import express from 'express';
import { metricsMiddleware, getMetrics } from './middleware/metrics.js';
import { getEnvVar } from './utils/getEnvVar.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { errorHandler } from './middleware/errorHandler.js';
import rootRouter from './routes/index.js';
import { startScanner } from './services/scanner.service.js';
import { bullBoardRouter } from './queue/dashboard.js';
import { swaggerDocs } from './middleware/swaggerDocs.js';

export const app = express();
const PORT = getEnvVar('PORT', '3000');
const URL = getEnvVar('APP_URL', 'http://localhost:3000');

app.use(metricsMiddleware);
app.get('/metrics', getMetrics);

app.use('/api', rootRouter);
app.use('/admin/queues', bullBoardRouter);
app.use('/api-docs', swaggerDocs());

app.use(notFoundHandler);
app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  import('./queue/email.worker.js').catch(console.error);

  startScanner();

  app.listen(PORT, () => {
    console.log(`Server is running on ${URL}`);
    console.log(`Worker is running in the same process`);
  });
}
