import pino, { Logger } from 'pino';

export interface ILogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  debug(msg: string): void;
}

const baseLogger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

export class PinoLogger implements ILogger {
  private readonly logger: Logger;

  constructor(context: string) {
    this.logger = baseLogger.child({ context });
  }

  info(msg: string) {
    this.logger.info(msg);
  }

  warn(msg: string) {
    this.logger.warn(msg);
  }

  error(msg: string) {
    this.logger.error(msg);
  }

  debug(msg: string) {
    this.logger.debug(msg);
  }
}
