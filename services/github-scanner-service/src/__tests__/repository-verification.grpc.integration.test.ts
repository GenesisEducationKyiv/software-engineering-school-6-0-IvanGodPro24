import { jest } from '@jest/globals';
import {
  credentials,
  Server,
  ServerCredentials,
  ServiceError,
  status,
} from '@grpc/grpc-js';
import {
  RepositoryVerificationServiceClient,
  RepositoryVerificationServiceService,
} from '@github-notifier/scanner-contracts';
import { ILogger } from '@github-notifier/shared';
import { IRepositoryVerificationService } from '../app/repository-verification.service.js';
import { RepositoryVerificationGrpcService } from '../grpc/repository-verification.grpc-service.js';
import { RepositoryVerificationError } from '../domain/repository-verification.error.js';

const verificationService = {
  verify: jest.fn(),
} as jest.Mocked<IRepositoryVerificationService>;

const logger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
} as jest.Mocked<ILogger>;

describe('Repository verification gRPC integration', () => {
  let server: Server | undefined;
  let client: RepositoryVerificationServiceClient | undefined;

  beforeAll(async () => {
    const grpcService = new RepositoryVerificationGrpcService(
      verificationService,
      logger,
    );

    const grpcServer = new Server();
    server = grpcServer;

    grpcServer.addService(
      RepositoryVerificationServiceService,
      grpcService.handlers,
    );

    const port = await new Promise<number>((resolve, reject) => {
      grpcServer.bindAsync(
        '127.0.0.1:0',
        ServerCredentials.createInsecure(),
        (error, boundPort) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(boundPort);
        },
      );
    });

    client = new RepositoryVerificationServiceClient(
      `127.0.0.1:${port}`,
      credentials.createInsecure(),
    );
  });

  afterAll(async () => {
    client?.close();

    const grpcServer = server;

    if (!grpcServer) return;

    await new Promise<void>((resolve, reject) => {
      grpcServer.tryShutdown((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('verifies repository through a real gRPC connection', async () => {
    const grpcClient = client;

    if (!grpcClient) throw new Error('gRPC client is not initialized');

    verificationService.verify.mockResolvedValue({
      fullName: 'facebook/react',
    });

    const response = await new Promise<{ fullName: string }>(
      (resolve, reject) => {
        grpcClient.verifyRepository(
          {
            owner: 'facebook',
            repository: 'react',
          },
          (error, result) => {
            if (error) {
              reject(error);
              return;
            }

            resolve(result);
          },
        );
      },
    );

    expect(verificationService.verify).toHaveBeenCalledWith(
      'facebook',
      'react',
    );

    expect(response).toEqual({
      fullName: 'facebook/react',
    });
  });

  it('transfers repository verification errors as gRPC statuses', async () => {
    const grpcClient = client;

    if (!grpcClient) throw new Error('gRPC client is not initialized');

    verificationService.verify.mockRejectedValue(
      new RepositoryVerificationError('NOT_FOUND', 'Repository not found'),
    );

    const error = await new Promise<ServiceError>((resolve, reject) => {
      grpcClient.verifyRepository(
        {
          owner: 'missing',
          repository: 'repo',
        },
        (grpcError) => {
          if (!grpcError) {
            reject(new Error('Expected gRPC request to fail'));
            return;
          }

          resolve(grpcError);
        },
      );
    });

    expect(error.code).toBe(status.NOT_FOUND);
    expect(error.details).toBe('Repository not found');
  });
});
