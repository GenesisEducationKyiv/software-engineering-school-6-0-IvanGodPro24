import fs from 'node:fs/promises';
import path from 'node:path';
import handlebars from 'handlebars';
import { getEnvVar } from '../utils/getEnvVar.js';
import { sendEmail } from './email.service.js';

const compileTemplate = async (
  templateName: string,
  data: Record<string, unknown>,
) => {
  const templatePath = path.join(
    process.cwd(),
    'src',
    'templates',
    `${templateName}.hbs`,
  );

  const templateSource = await fs.readFile(templatePath, 'utf-8');

  const template = handlebars.compile(templateSource);
  return template(data);
};

export const sendConfirmEmail = async (
  email: string,
  repoName: string,
  token: string,
) => {
  const confirmUrl = `${getEnvVar('APP_URL')}/api/confirm/${token}`;

  const html = await compileTemplate('confirm-subscription', {
    repoName,
    confirmUrl,
  });

  await sendEmail(
    email,
    `Action required: Confirm your subscription to ${repoName}`,
    html,
  );
};

export const sendNewReleaseEmail = async (
  email: string,
  repoName: string,
  tag: string,
  unsubscribeToken: string,
) => {
  const unsubscribeUrl = `${getEnvVar('APP_URL')}/api/unsubscribe/${unsubscribeToken}`;
  const releaseUrl = `https://github.com/${repoName}/releases/tag/${tag}`;

  const html = await compileTemplate('new-release', {
    repoName,
    tag,
    releaseUrl,
    unsubscribeUrl,
  });

  await sendEmail(email, `New release available: ${repoName} ${tag}`, html);
};
