import axios, { AxiosInstance } from 'axios';
import createHttpError from 'http-errors';
import { IRepositoryVerifier } from '../../modules/github/repository-verifier.port.js';

type ScannerErrorResponse = {
  code?: string;
  message?: string;
};

export class RestRepositoryVerifier implements IRepositoryVerifier {
  constructor(private readonly scannerApi: AxiosInstance) {}

  async verifyRepository(owner: string, repository: string): Promise<void> {
    try {
      await this.scannerApi.post('/internal/v1/repositories/verify', {
        owner,
        repository,
      });
    } catch (error) {
      if (!axios.isAxiosError<ScannerErrorResponse>(error)) {
        throw error;
      }

      if (error.code === 'ECONNABORTED') {
        throw createHttpError(504, 'GitHub Scanner Service request timed out');
      }

      const upstreamStatus = error.response?.status;
      const message =
        error.response?.data?.message ?? 'Repository verification failed';

      switch (upstreamStatus) {
        case 400:
          throw createHttpError(400, message);

        case 403:
          throw createHttpError(403, message);

        case 404:
          throw createHttpError(404, message);

        case 429:
          throw createHttpError(429, message);

        case 503:
          throw createHttpError(503, message);

        default:
          if (!error.response) {
            throw createHttpError(503, 'GitHub Scanner Service is unavailable');
          }

          throw createHttpError(
            502,
            'Invalid response from GitHub Scanner Service',
          );
      }
    }
  }
}
