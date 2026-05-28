export class UniqueConstraintError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UniqueConstraintError';
  }
}
