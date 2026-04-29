import cron from 'node-cron';
import { prisma } from '../db/client.js';
import { getLatestRelease } from './github.service.js';
import { emailQueue } from '../queue/email.queue.js';

const scanRepositories = async () => {
  try {
    const repositories = await prisma.repository.findMany({
      where: {
        subscriptions: {
          some: {
            status: 'ACTIVE',
          },
        },
      },
    });

    console.log(`[Scanner] Found ${repositories.length} repositories`);

    for (const repo of repositories) {
      const [owner, repoName] = repo.name.split('/');

      try {
        const latestTag = await getLatestRelease(owner, repoName);

        if (!latestTag) continue;

        if (!repo.lastSeenTag) {
          await prisma.repository.update({
            where: { id: repo.id },
            data: { lastSeenTag: latestTag },
          });
          continue;
        }

        if (repo.lastSeenTag !== latestTag) {
          console.log(`[Scanner] New release for ${repo.name}: ${latestTag}`);

          await prisma.repository.update({
            where: { id: repo.id },
            data: { lastSeenTag: latestTag },
          });

          const subscriptions = await prisma.subscription.findMany({
            where: {
              repositoryId: repo.id,
              status: 'ACTIVE',
            },
          });

          await emailQueue.addBulk(
            subscriptions.map((sub) => ({
              name: 'send-email',
              data: {
                email: sub.email,
                repoName: repo.name,
                tag: latestTag,
                unsubscribeToken: sub.unsubscribeToken,
              },
              opts: {
                attempts: 3,
                backoff: {
                  type: 'exponential',
                  delay: 5000,
                },
              },
            })),
          );
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Scanner] Error checking ${repo.name}:`, message);
      }
    }
  } catch (globalError) {
    console.error(
      '[Scanner] Critical database error during scan:',
      globalError,
    );
  }
};

export const startScanner = () => {
  console.log('Scanner initialized');

  cron.schedule('*/10 * * * *', scanRepositories);
};
