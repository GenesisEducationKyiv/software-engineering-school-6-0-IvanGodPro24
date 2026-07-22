export interface TrackedRepoEntity {
  id: string;
  name: string;
  lastSeenTag: string | null;
  createdAt: Date;
  updatedAt: Date;
}
