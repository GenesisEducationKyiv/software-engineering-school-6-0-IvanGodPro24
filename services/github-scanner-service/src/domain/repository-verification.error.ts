export type RepositoryVerificationErrorCode =
  | 'INVALID_ARGUMENT'
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'RESOURCE_EXHAUSTED'
  | 'UNAVAILABLE'
  | 'INTERNAL';

export class RepositoryVerificationError extends Error {
  constructor(
    public readonly code: RepositoryVerificationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RepositoryVerificationError';
  }
}
