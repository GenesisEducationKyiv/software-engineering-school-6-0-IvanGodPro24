export interface TrackedRepositoryEntity {
  id: string;
  sourceRepositoryId: string;
  name: string;
  lastSeenTag: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}
