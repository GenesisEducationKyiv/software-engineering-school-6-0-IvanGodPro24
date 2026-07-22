import { jest } from '@jest/globals';
import { AxiosInstance } from 'axios';
import { RestRepositoryVerifier } from '../infrastructure/scanner/rest-repository-verifier.js';

const mockPost = jest.fn<(...args: unknown[]) => Promise<unknown>>();

const scannerApi = {
  post: mockPost,
} as unknown as AxiosInstance;

const createAxiosError = (
  status?: number,
  message = 'Upstream error',
  code?: string,
) => ({
  isAxiosError: true,
  code,
  response:
    status === undefined
      ? undefined
      : {
          status,
          data: { message },
        },
});

describe('RestRepositoryVerifier', () => {
  let verifier: RestRepositoryVerifier;

  beforeEach(() => {
    jest.clearAllMocks();
    verifier = new RestRepositoryVerifier(scannerApi);
  });

  it('calls Scanner Service repository verification endpoint', async () => {
    mockPost.mockResolvedValue({
      data: {
        fullName: 'facebook/react',
      },
    });

    await verifier.verifyRepository('facebook', 'react');

    expect(mockPost).toHaveBeenCalledWith('/internal/v1/repositories/verify', {
      owner: 'facebook',
      repository: 'react',
    });
  });

  it('maps Scanner Service 404 to HTTP 404', async () => {
    mockPost.mockRejectedValue(createAxiosError(404, 'Repository not found'));

    await expect(
      verifier.verifyRepository('missing', 'repo'),
    ).rejects.toMatchObject({
      status: 404,
      message: 'Repository not found',
    });
  });

  it('maps Scanner Service rate limit to HTTP 429', async () => {
    mockPost.mockRejectedValue(
      createAxiosError(429, 'GitHub rate limit exceeded'),
    );

    await expect(
      verifier.verifyRepository('facebook', 'react'),
    ).rejects.toMatchObject({
      status: 429,
    });
  });

  it('maps unavailable Scanner Service to HTTP 503', async () => {
    mockPost.mockRejectedValue(createAxiosError());

    await expect(
      verifier.verifyRepository('facebook', 'react'),
    ).rejects.toMatchObject({
      status: 503,
    });
  });

  it('maps request timeout to HTTP 504', async () => {
    mockPost.mockRejectedValue(
      createAxiosError(undefined, 'Timeout', 'ECONNABORTED'),
    );

    await expect(
      verifier.verifyRepository('facebook', 'react'),
    ).rejects.toMatchObject({
      status: 504,
    });
  });
});
