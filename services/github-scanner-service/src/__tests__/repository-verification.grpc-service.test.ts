import { jest } from '@jest/globals';
import { sendUnaryData, ServerUnaryCall, status } from '@grpc/grpc-js';
import {
  VerifyRepositoryRequest,
  VerifyRepositoryResponse,
} from '@github-notifier/scanner-contracts';
import { ILogger } from '@github-notifier/shared';
import { IRepositoryVerificationService } from '../app/repository-verification.service.js';
import { RepositoryVerificationError } from '../domain/repository-verification.error.js';
import { RepositoryVerificationGrpcService } from '../grpc/repository-verification.grpc-service.js';

const verificationService = {
  verify: jest.fn(),
} as jest.Mocked<IRepositoryVerificationService>;

const logger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
} as jest.Mocked<ILogger>;

const createCall = (
  request: VerifyRepositoryRequest,
): ServerUnaryCall<VerifyRepositoryRequest, VerifyRepositoryResponse> =>
  ({
    request,
  }) as ServerUnaryCall<VerifyRepositoryRequest, VerifyRepositoryResponse>;

const createCallback = (): {
  callback: jest.MockedFunction<sendUnaryData<VerifyRepositoryResponse>>;
  called: Promise<void>;
} => {
  let resolveCalled!: () => void;
  const called = new Promise<void>((resolve) => {
    resolveCalled = resolve;
  });

  const callback = jest.fn(
    (..._args: Parameters<sendUnaryData<VerifyRepositoryResponse>>) => {
      resolveCalled();
    },
  ) as jest.MockedFunction<sendUnaryData<VerifyRepositoryResponse>>;

  return {
    callback,
    called,
  };
};

describe('RepositoryVerificationGrpcService', () => {
  let grpcService: RepositoryVerificationGrpcService;

  beforeEach(() => {
    jest.resetAllMocks();

    grpcService = new RepositoryVerificationGrpcService(
      verificationService,
      logger,
    );
  });

  it('returns verified repository', async () => {
    verificationService.verify.mockResolvedValue({
      fullName: 'facebook/react',
    });

    const { callback, called } = createCallback();

    grpcService.handlers.verifyRepository(
      createCall({
        owner: 'facebook',
        repository: 'react',
      }),
      callback,
    );

    await called;

    expect(verificationService.verify).toHaveBeenCalledWith(
      'facebook',
      'react',
    );

    expect(callback).toHaveBeenCalledWith(null, {
      fullName: 'facebook/react',
    });
  });

  it('maps repository not found to gRPC NOT_FOUND', async () => {
    verificationService.verify.mockRejectedValue(
      new RepositoryVerificationError('NOT_FOUND', 'Repository not found'),
    );

    const { callback, called } = createCallback();

    grpcService.handlers.verifyRepository(
      createCall({
        owner: 'missing',
        repository: 'repo',
      }),
      callback,
    );

    await called;

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        code: status.NOT_FOUND,
        message: 'Repository not found',
      }),
    );
  });

  it('maps GitHub rate limit to gRPC RESOURCE_EXHAUSTED', async () => {
    verificationService.verify.mockRejectedValue(
      new RepositoryVerificationError(
        'RESOURCE_EXHAUSTED',
        'GitHub rate limit exceeded',
      ),
    );

    const { callback, called } = createCallback();

    grpcService.handlers.verifyRepository(
      createCall({
        owner: 'facebook',
        repository: 'react',
      }),
      callback,
    );

    await called;

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        code: status.RESOURCE_EXHAUSTED,
      }),
    );
  });

  it('maps unexpected error to gRPC INTERNAL', async () => {
    verificationService.verify.mockRejectedValue(
      new Error('Unexpected failure'),
    );

    const { callback, called } = createCallback();

    grpcService.handlers.verifyRepository(
      createCall({
        owner: 'facebook',
        repository: 'react',
      }),
      callback,
    );

    await called;

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        code: status.INTERNAL,
        message: 'Internal server error',
      }),
    );
  });
});
