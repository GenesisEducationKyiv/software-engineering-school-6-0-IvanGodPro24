import { status } from '@grpc/grpc-js';
import { RepositoryVerificationErrorCode } from '../domain/repository-verification.error.js';

export const mapRepositoryVerificationErrorCodeToGrpcStatus = (
  code: RepositoryVerificationErrorCode,
): status => {
  switch (code) {
    case 'INVALID_ARGUMENT':
      return status.INVALID_ARGUMENT;

    case 'NOT_FOUND':
      return status.NOT_FOUND;

    case 'PERMISSION_DENIED':
      return status.PERMISSION_DENIED;

    case 'RESOURCE_EXHAUSTED':
      return status.RESOURCE_EXHAUSTED;

    case 'UNAVAILABLE':
      return status.UNAVAILABLE;

    case 'INTERNAL':
      return status.INTERNAL;
  }
};
