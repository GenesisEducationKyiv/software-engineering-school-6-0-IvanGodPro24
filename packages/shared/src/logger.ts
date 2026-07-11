import pino, { Logger } from 'pino';

export interface ILogger {
  info(msgOrObj: unknown, msg?: string): void;
  warn(msgOrObj: unknown, msg?: string): void;
  error(msgOrObj: unknown, msg?: string): void;
  debug(msgOrObj: unknown, msg?: string): void;
}

const baseLogger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: ['email', 'to', 'token'],
    censor: '[REDACTED]',
  },
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

  private log(level: pino.Level, msgOrObj: unknown, msg?: string) {
    if (msg !== undefined) {
      this.logger[level](msgOrObj as object, msg);
    } else {
      this.logger[level](msgOrObj as string);
    }
  }

  info(msgOrObj: unknown, msg?: string) {
    this.log('info', msgOrObj, msg);
  }

  warn(msgOrObj: unknown, msg?: string) {
    this.log('warn', msgOrObj, msg);
  }

  error(msgOrObj: unknown, msg?: string) {
    this.log('error', msgOrObj, msg);
  }

  debug(msgOrObj: unknown, msg?: string) {
    this.log('debug', msgOrObj, msg);
  }
}
