import type { Server as HttpServer } from 'node:http';
import { getEnvVar, PinoLogger } from '@github-notifier/shared';
import { createApp } from '../app.js';
import { RepositoryVerificationService } from '../app/repository-verification.service.js';
import { GrpcServer } from '../grpc/grpc-server.js';
import { RepositoryVerificationGrpcService } from '../grpc/repository-verification.grpc-service.js';
import { BenchmarkGitHubRepositoryClient } from './benchmark-github-repository-client.js';

const logger = new PinoLogger('RepositoryVerificationBenchmark');

const restPort = Number(getEnvVar('BENCHMARK_REST_PORT', '3102'));
const grpcPort = Number(getEnvVar('BENCHMARK_GRPC_PORT', '51051'));

if (!Number.isInteger(restPort) || restPort <= 0)
  throw new Error('BENCHMARK_REST_PORT must be a positive integer');

if (!Number.isInteger(grpcPort) || grpcPort <= 0)
  throw new Error('BENCHMARK_GRPC_PORT must be a positive integer');

const githubClient = new BenchmarkGitHubRepositoryClient();

const repositoryVerificationService = new RepositoryVerificationService(
  githubClient,
);

const app = createApp(repositoryVerificationService, logger);

const grpcService = new RepositoryVerificationGrpcService(
  repositoryVerificationService,
  logger,
);

const grpcServer = new GrpcServer(grpcService.handlers, logger);

let httpServer: HttpServer | null = null;
let shuttingDown = false;

const startHttpServer = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const server = app.listen(restPort, '127.0.0.1', () => {
      httpServer = server;

      logger.info(
        {
          address: `127.0.0.1:${restPort}`,
        },
        'REST benchmark server started',
      );

      resolve();
    });

    server.once('error', reject);
  });

const closeHttpServer = (): Promise<void> => {
  if (!httpServer) return Promise.resolve();

  return new Promise((resolve, reject) => {
    httpServer?.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      httpServer = null;
      resolve();
    });
  });
};

const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return;

  shuttingDown = true;
  logger.info(`Received ${signal}. Stopping benchmark servers...`);

  try {
    await closeHttpServer();
    await grpcServer.close();

    logger.info('Benchmark servers stopped');
    process.exit(0);
  } catch (error) {
    logger.error(
      {
        err: error,
      },
      'Failed to stop benchmark servers',
    );

    process.exit(1);
  }
};

const bootstrap = async (): Promise<void> => {
  await grpcServer.start(`127.0.0.1:${grpcPort}`);
  await startHttpServer();

  logger.info(
    {
      restEndpoint:
        `http://127.0.0.1:${restPort}` + '/internal/v1/repositories/verify',
      grpcAddress: `127.0.0.1:${grpcPort}`,
    },
    'Repository verification benchmark is ready',
  );
};

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

bootstrap().catch(async (error) => {
  logger.error(
    {
      err: error,
    },
    'Failed to start benchmark servers',
  );

  await grpcServer.close().catch(() => undefined);
  process.exit(1);
});
