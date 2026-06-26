import { status } from '@grpc/grpc-js';
import { RepositoryVerificationErrorCode } from './repository-verification.error.js';

export const mapRepositoryVerificationErrorCodeToHttpStatus = (
  code: RepositoryVerificationErrorCode,
): number => {
  switch (code) {
    case 'INVALID_ARGUMENT':
      return 400;

    case 'NOT_FOUND':
      return 404;

    case 'PERMISSION_DENIED':
      return 403;

    case 'RESOURCE_EXHAUSTED':
      return 429;

    case 'UNAVAILABLE':
      return 503;

    case 'INTERNAL':
      return 500;
  }
};

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
