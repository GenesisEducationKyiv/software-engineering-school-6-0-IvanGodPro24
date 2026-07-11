export type SyncRepositoryTrackingCommand = {
  type: 'sync-repository-tracking';
  repositoryId: string;
  repoName: string;
  active: boolean;
};

export type ScannerCommand = SyncRepositoryTrackingCommand;
