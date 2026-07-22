import { CallOptions, Metadata, ServiceError, status } from '@grpc/grpc-js';
import { RepositoryVerificationServiceClient } from '@github-notifier/scanner-contracts';
import createHttpError from 'http-errors';
import { IRepositoryVerifier } from '../../modules/github/repository-verifier.port.js';

type RepositoryVerificationGrpcClient = Pick<
  RepositoryVerificationServiceClient,
  'verifyRepository' | 'close'
>;

export class GrpcRepositoryVerifier implements IRepositoryVerifier {
  constructor(
    private readonly client: RepositoryVerificationGrpcClient,
    private readonly timeoutMs: number,
  ) {}

  async verifyRepository(owner: string, repository: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const options: CallOptions = {
        deadline: new Date(Date.now() + this.timeoutMs),
      };

      this.client.verifyRepository(
        {
          owner,
          repository,
        },
        new Metadata(),
        options,
        (error, response) => {
          if (error) {
            reject(this.mapError(error));
            return;
          }

          if (!response?.fullName) {
            reject(
              createHttpError(
                502,
                'Invalid response from GitHub Scanner Service',
              ),
            );
            return;
          }

          resolve();
        },
      );
    });
  }

  close(): void {
    this.client.close();
  }

  private mapError(error: ServiceError): Error {
    const message = error.details || 'Repository verification failed';

    switch (error.code) {
      case status.INVALID_ARGUMENT:
        return createHttpError(400, message);

      case status.PERMISSION_DENIED:
        return createHttpError(403, message);

      case status.NOT_FOUND:
        return createHttpError(404, message);

      case status.RESOURCE_EXHAUSTED:
        return createHttpError(429, message);

      case status.DEADLINE_EXCEEDED:
        return createHttpError(504, 'GitHub Scanner Service request timed out');

      case status.UNAVAILABLE:
      case status.CANCELLED:
        return createHttpError(503, 'GitHub Scanner Service is unavailable');

      default:
        return createHttpError(
          502,
          'GitHub Scanner Service failed to verify repository',
        );
    }
  }
}
