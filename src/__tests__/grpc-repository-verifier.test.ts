import { jest } from '@jest/globals';
import {
  CallOptions,
  ClientUnaryCall,
  Metadata,
  ServiceError,
  status,
} from '@grpc/grpc-js';
import {
  RepositoryVerificationServiceClient,
  VerifyRepositoryRequest,
  VerifyRepositoryResponse,
} from '@github-notifier/scanner-contracts';
import { GrpcRepositoryVerifier } from '../infrastructure/scanner/grpc-repository-verifier.js';

type VerifyCallback = (
  error: ServiceError | null,
  response?: VerifyRepositoryResponse,
) => void;

const verifyRepositoryRpc =
  jest.fn<
    (
      request: VerifyRepositoryRequest,
      metadata: Metadata,
      options: CallOptions,
      callback: VerifyCallback,
    ) => ClientUnaryCall
  >();

const grpcClient = {
  verifyRepository: verifyRepositoryRpc,
  close: jest.fn(),
} as unknown as Pick<
  RepositoryVerificationServiceClient,
  'verifyRepository' | 'close'
>;

const createServiceError = (code: status, details: string): ServiceError =>
  Object.assign(new Error(details), {
    name: 'ServiceError',
    code,
    details,
    metadata: new Metadata(),
  });

describe('GrpcRepositoryVerifier', () => {
  let verifier: GrpcRepositoryVerifier;

  beforeEach(() => {
    jest.resetAllMocks();

    verifier = new GrpcRepositoryVerifier(grpcClient, 3000);
  });

  it('calls repository verification RPC with a deadline', async () => {
    verifyRepositoryRpc.mockImplementation(
      (_request, _metadata, _options, callback) => {
        callback(null, {
          fullName: 'facebook/react',
        });

        return {} as ClientUnaryCall;
      },
    );

    await verifier.verifyRepository('facebook', 'react');

    expect(verifyRepositoryRpc).toHaveBeenCalledWith(
      {
        owner: 'facebook',
        repository: 'react',
      },
      expect.any(Metadata),
      {
        deadline: expect.any(Date),
      },
      expect.any(Function),
    );
  });

  it('maps gRPC NOT_FOUND to HTTP 404', async () => {
    verifyRepositoryRpc.mockImplementation(
      (_request, _metadata, _options, callback) => {
        callback(createServiceError(status.NOT_FOUND, 'Repository not found'));

        return {} as ClientUnaryCall;
      },
    );

    await expect(
      verifier.verifyRepository('missing', 'repo'),
    ).rejects.toMatchObject({
      status: 404,
      message: 'Repository not found',
    });
  });

  it('maps gRPC RESOURCE_EXHAUSTED to HTTP 429', async () => {
    verifyRepositoryRpc.mockImplementation(
      (_request, _metadata, _options, callback) => {
        callback(
          createServiceError(
            status.RESOURCE_EXHAUSTED,
            'GitHub rate limit exceeded',
          ),
        );

        return {} as ClientUnaryCall;
      },
    );

    await expect(
      verifier.verifyRepository('facebook', 'react'),
    ).rejects.toMatchObject({
      status: 429,
    });
  });

  it('maps gRPC DEADLINE_EXCEEDED to HTTP 504', async () => {
    verifyRepositoryRpc.mockImplementation(
      (_request, _metadata, _options, callback) => {
        callback(
          createServiceError(status.DEADLINE_EXCEEDED, 'Deadline exceeded'),
        );

        return {} as ClientUnaryCall;
      },
    );

    await expect(
      verifier.verifyRepository('facebook', 'react'),
    ).rejects.toMatchObject({
      status: 504,
    });
  });

  it('maps gRPC UNAVAILABLE to HTTP 503', async () => {
    verifyRepositoryRpc.mockImplementation(
      (_request, _metadata, _options, callback) => {
        callback(
          createServiceError(status.UNAVAILABLE, 'No connection established'),
        );

        return {} as ClientUnaryCall;
      },
    );

    await expect(
      verifier.verifyRepository('facebook', 'react'),
    ).rejects.toMatchObject({
      status: 503,
    });
  });

  it('rejects an invalid successful response', async () => {
    verifyRepositoryRpc.mockImplementation(
      (_request, _metadata, _options, callback) => {
        callback(null, {
          fullName: '',
        });

        return {} as ClientUnaryCall;
      },
    );

    await expect(
      verifier.verifyRepository('facebook', 'react'),
    ).rejects.toMatchObject({
      status: 502,
    });
  });
});
