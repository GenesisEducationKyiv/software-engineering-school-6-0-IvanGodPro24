import { status } from '@grpc/grpc-js';
import { RepositoryVerificationErrorCode } from './repository-verification.error.js';

const httpStatusMap: Record<RepositoryVerificationErrorCode, number> = {
  INVALID_ARGUMENT: 400,
  NOT_FOUND: 404,
  PERMISSION_DENIED: 403,
  RESOURCE_EXHAUSTED: 429,
  UNAVAILABLE: 503,
  INTERNAL: 500,
};

export const mapRepositoryVerificationErrorCodeToHttpStatus = (
  code: RepositoryVerificationErrorCode,
): number => httpStatusMap[code];

const grpcStatusMap: Record<RepositoryVerificationErrorCode, status> = {
  INVALID_ARGUMENT: status.INVALID_ARGUMENT,
  NOT_FOUND: status.NOT_FOUND,
  PERMISSION_DENIED: status.PERMISSION_DENIED,
  RESOURCE_EXHAUSTED: status.RESOURCE_EXHAUSTED,
  UNAVAILABLE: status.UNAVAILABLE,
  INTERNAL: status.INTERNAL,
};

export const mapRepositoryVerificationErrorCodeToGrpcStatus = (
  code: RepositoryVerificationErrorCode,
): status => grpcStatusMap[code];
