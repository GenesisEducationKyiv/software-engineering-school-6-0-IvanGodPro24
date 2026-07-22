import {
  sendUnaryData,
  ServerErrorResponse,
  ServerUnaryCall,
  status,
} from '@grpc/grpc-js';
import {
  RepositoryVerificationServiceServer,
  VerifyRepositoryRequest,
  VerifyRepositoryResponse,
} from '@github-notifier/scanner-contracts';
import { ILogger } from '@github-notifier/shared';
import { IRepositoryVerificationService } from '../app/repository-verification.service.js';
import { mapRepositoryVerificationErrorCodeToGrpcStatus } from './repository-verification-grpc-status.mapper.js';
import { RepositoryVerificationError } from '../domain/repository-verification.error.js';

export class RepositoryVerificationGrpcService {
  readonly handlers: RepositoryVerificationServiceServer;

  constructor(
    private readonly repositoryVerificationService: IRepositoryVerificationService,
    private readonly logger: ILogger,
  ) {
    this.handlers = {
      verifyRepository: this.verifyRepository,
    };
  }

  private readonly verifyRepository = (
    call: ServerUnaryCall<VerifyRepositoryRequest, VerifyRepositoryResponse>,
    callback: sendUnaryData<VerifyRepositoryResponse>,
  ): void => {
    void this.handleVerifyRepository(call, callback);
  };

  private async handleVerifyRepository(
    call: ServerUnaryCall<VerifyRepositoryRequest, VerifyRepositoryResponse>,
    callback: sendUnaryData<VerifyRepositoryResponse>,
  ): Promise<void> {
    try {
      const verifiedRepository =
        await this.repositoryVerificationService.verify(
          call.request.owner,
          call.request.repository,
        );

      callback(null, {
        fullName: verifiedRepository.fullName,
      });
    } catch (error) {
      callback(this.mapError(error));
    }
  }

  private mapError(error: unknown): ServerErrorResponse {
    if (error instanceof RepositoryVerificationError) {
      this.logger.warn(
        {
          err: error,
          code: error.code,
        },
        'gRPC repository verification failed',
      );

      return {
        name: error.name,
        message: error.message,
        code: mapRepositoryVerificationErrorCodeToGrpcStatus(error.code),
      };
    }

    this.logger.error(
      {
        err: error,
      },
      'Unhandled gRPC repository verification error',
    );

    return {
      name: 'InternalError',
      message: 'Internal server error',
      code: status.INTERNAL,
    };
  }
}
