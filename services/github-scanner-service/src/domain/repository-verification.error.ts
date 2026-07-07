export const RepositoryVerificationErrorCodes = {
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  NOT_FOUND: 'NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  RESOURCE_EXHAUSTED: 'RESOURCE_EXHAUSTED',
  UNAVAILABLE: 'UNAVAILABLE',
  INTERNAL: 'INTERNAL',
} as const;

export type RepositoryVerificationErrorCode =
  (typeof RepositoryVerificationErrorCodes)[keyof typeof RepositoryVerificationErrorCodes];

export class RepositoryVerificationError extends Error {
  constructor(
    public readonly code: RepositoryVerificationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RepositoryVerificationError';
  }
}
