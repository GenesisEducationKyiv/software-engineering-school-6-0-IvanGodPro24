import createHttpError from 'http-errors';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { sendConfirmEmail } from './subscription-email.service.js';

export const createSubscription = async (email: string, repo: string) => {
  const repository = await prisma.repository.upsert({
    where: { name: repo },
    update: {},
    create: { name: repo },
  });

  let existing = await prisma.subscription.findUnique({
    where: {
      email_repositoryId: {
        email,
        repositoryId: repository.id,
      },
    },
  });

  if (existing) {
    if (existing.status === 'ACTIVE') {
      throw createHttpError(409, 'Already subscribed to this repository');
    }

    if (existing.status === 'PENDING') {
      throw createHttpError(
        409,
        'Subscription is pending. Please check your email.',
      );
    }

    if (existing.status === 'UNSUBSCRIBED') {
      existing = await prisma.subscription.update({
        where: { id: existing.id },
        data: {
          status: 'PENDING',
          confirmToken: randomUUID(),
        },
      });

      await sendConfirmEmail(
        existing.email,
        repository.name,
        existing.confirmToken,
      );

      return existing;
    }
  }

  try {
    const subscription = await prisma.subscription.create({
      data: {
        email,
        repositoryId: repository.id,
      },
    });

    await sendConfirmEmail(
      subscription.email,
      repository.name,
      subscription.confirmToken,
    );

    return subscription;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw createHttpError(
        409,
        'Subscription is processing or already exists.',
      );
    }

    throw error;
  }
};

export const confirmSubscription = async (token: string) => {
  const subscription = await prisma.subscription.findUnique({
    where: { confirmToken: token },
  });

  if (!subscription) throw createHttpError(404, 'Token not found');

  if (subscription.status === 'ACTIVE')
    throw createHttpError(400, 'Subscription already confirmed');

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: 'ACTIVE' },
  });
};

export const cancelSubscription = async (token: string) => {
  const subscription = await prisma.subscription.findUnique({
    where: { unsubscribeToken: token },
  });

  if (!subscription) throw createHttpError(404, 'Token not found');

  if (subscription.status === 'UNSUBSCRIBED')
    throw createHttpError(400, 'Already unsubscribed');

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: 'UNSUBSCRIBED' },
  });
};

export const getSubscriptionsByEmail = async (email: string) => {
  const subscriptions = await prisma.subscription.findMany({
    where: {
      email,
      status: 'ACTIVE',
    },
    include: {
      repository: true,
    },
  });

  return subscriptions.map(({ email, repository, status }) => ({
    email,
    repo: repository.name,
    confirmed: status === 'ACTIVE',
    last_seen_tag: repository.lastSeenTag,
  }));
};
