import nodemailer from 'nodemailer';
import { getEnvVar } from '../utils/getEnvVar.js';

const port = Number(getEnvVar('SMTP_PORT'));

const transporter = nodemailer.createTransport({
  host: getEnvVar('SMTP_HOST'),
  port,
  secure: port === 465,
  auth: {
    user: getEnvVar('SMTP_USER'),
    pass: getEnvVar('SMTP_PASS'),
  },
});

export const sendEmail = async (to: string, subject: string, html: string) => {
  await transporter.sendMail({
    from: getEnvVar('SMTP_FROM'),
    to,
    subject,
    html,
  });
};
