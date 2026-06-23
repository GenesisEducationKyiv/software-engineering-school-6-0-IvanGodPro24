export type RepositoryTagUpdatedEvent = {
  type: 'repository-tag-updated';
  repositoryId: string;
  repoName: string;
  previousTag: string | null;
  currentTag: string;
  notifySubscribers: boolean;
};

export type ScannerEvent = RepositoryTagUpdatedEvent;
