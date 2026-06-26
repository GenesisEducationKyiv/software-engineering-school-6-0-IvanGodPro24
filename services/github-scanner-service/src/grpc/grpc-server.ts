import { Server, ServerCredentials } from '@grpc/grpc-js';
import {
  RepositoryVerificationServiceServer,
  RepositoryVerificationServiceService,
} from '@github-notifier/scanner-contracts';
import { ILogger } from '@github-notifier/shared';

export class GrpcServer {
  private readonly server = new Server();
  private started = false;

  constructor(
    repositoryVerificationService: RepositoryVerificationServiceServer,
    private readonly logger: ILogger,
  ) {
    this.server.addService(
      RepositoryVerificationServiceService,
      repositoryVerificationService,
    );
  }

  start(address: string): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.bindAsync(
        address,
        ServerCredentials.createInsecure(),
        (error, port) => {
          if (error) {
            reject(error);
            return;
          }

          this.started = true;

          this.logger.info(
            {
              address,
              port,
            },
            'GitHub Scanner Service gRPC server started',
          );

          resolve(port);
        },
      );
    });
  }

  close(): Promise<void> {
    if (!this.started) return Promise.resolve();

    return new Promise((resolve, reject) => {
      this.server.tryShutdown((error) => {
        if (error) {
          reject(error);
          return;
        }

        this.started = false;
        this.logger.info('GitHub Scanner Service gRPC server stopped');

        resolve();
      });
    });
  }
}
