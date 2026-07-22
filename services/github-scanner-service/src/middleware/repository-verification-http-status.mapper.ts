import { RepositoryVerificationErrorCode } from '../domain/repository-verification.error.js';

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
