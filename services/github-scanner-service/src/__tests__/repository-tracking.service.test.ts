import { jest } from '@jest/globals';
import { RepositoryTrackingService } from '../app/repository-tracking.service.js';
import { ITrackedRepositoryRepository } from '../app/tracked-repository.repository.port.js';

const mockRepository = {
  activate: jest.fn(),
  deactivate: jest.fn(),
  findActive: jest.fn(),
  updateLastSeenTag: jest.fn(),
} as jest.Mocked<ITrackedRepositoryRepository>;

describe('RepositoryTrackingService', () => {
  let service: RepositoryTrackingService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RepositoryTrackingService(mockRepository);
  });

  it('activates repository when active is true', async () => {
    mockRepository.activate.mockResolvedValue({} as never);

    await service.sync({
      type: 'sync-repository-tracking',
      repositoryId: 'repository-1',
      repoName: 'facebook/react',
      active: true,
    });

    expect(mockRepository.activate).toHaveBeenCalledWith(
      'repository-1',
      'facebook/react',
    );

    expect(mockRepository.deactivate).not.toHaveBeenCalled();
  });

  it('deactivates repository when active is false', async () => {
    mockRepository.deactivate.mockResolvedValue(undefined);

    await service.sync({
      type: 'sync-repository-tracking',
      repositoryId: 'repository-1',
      repoName: 'facebook/react',
      active: false,
    });

    expect(mockRepository.deactivate).toHaveBeenCalledWith(
      'repository-1',
      'facebook/react',
    );

    expect(mockRepository.activate).not.toHaveBeenCalled();
  });
});
