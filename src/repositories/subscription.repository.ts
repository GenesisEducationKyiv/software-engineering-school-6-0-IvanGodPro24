import {
  PrismaClient,
  Repository as DbRepository,
  Subscription,
  SubscriptionStatus,
} from '@prisma/client';

export interface ISubscriptionRepository {
  findByEmailAndRepoId(
    email: string,
    repositoryId: string,
  ): Promise<Subscription | null>;
  findByConfirmToken(token: string): Promise<Subscription | null>;
  findByUnsubscribeToken(token: string): Promise<Subscription | null>;
  create(email: string, repositoryId: string): Promise<Subscription>;
  updateStatus(
    id: string,
    status: SubscriptionStatus,
    extraData?: Partial<Subscription>,
  ): Promise<Subscription>;
  findActiveByEmailWithRepo(
    email: string,
  ): Promise<(Subscription & { repository: DbRepository })[]>;
  findActiveByRepoId(repositoryId: string): Promise<Subscription[]>;
}

export class SubscriptionRepository implements ISubscriptionRepository {
  constructor(private readonly db: PrismaClient) {}

  async findByEmailAndRepoId(
    email: string,
    repositoryId: string,
  ): Promise<Subscription | null> {
    return this.db.subscription.findUnique({
      where: {
        email_repositoryId: { email, repositoryId },
      },
    });
  }

  async findByConfirmToken(token: string): Promise<Subscription | null> {
    return this.db.subscription.findUnique({ where: { confirmToken: token } });
  }

  async findByUnsubscribeToken(token: string): Promise<Subscription | null> {
    return this.db.subscription.findUnique({
      where: { unsubscribeToken: token },
    });
  }

  async create(email: string, repositoryId: string): Promise<Subscription> {
    return this.db.subscription.create({
      data: { email, repositoryId },
    });
  }

  async updateStatus(
    id: string,
    status: SubscriptionStatus,
    extraData: Partial<Subscription> = {},
  ): Promise<Subscription> {
    return this.db.subscription.update({
      where: { id },
      data: { status, ...extraData },
    });
  }

  async findActiveByEmailWithRepo(email: string) {
    return this.db.subscription.findMany({
      where: { email, status: 'ACTIVE' },
      include: { repository: true },
    });
  }

  async findActiveByRepoId(repositoryId: string) {
    return this.db.subscription.findMany({
      where: { repositoryId, status: 'ACTIVE' },
    });
  }
}
