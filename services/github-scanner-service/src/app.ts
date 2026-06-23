import express from 'express';

export const app = express();

app.disable('x-powered-by');
app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'github-scanner-service',
  });
});
