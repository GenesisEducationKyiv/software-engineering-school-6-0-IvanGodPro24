import nodemailer, { Transporter } from 'nodemailer';
import { getEnvVar } from '../utils/getEnvVar.js';

export interface IEmailProvider {
  sendEmail(to: string, subject: string, html: string): Promise<void>;
}

export class NodemailerProvider implements IEmailProvider {
  private transporter: Transporter;
  private fromEmail: string;

  constructor() {
    const port = Number(getEnvVar('SMTP_PORT'));
    this.fromEmail = getEnvVar('SMTP_FROM');

    this.transporter = nodemailer.createTransport({
      host: getEnvVar('SMTP_HOST'),
      port,
      secure: port === 465,
      auth: {
        user: getEnvVar('SMTP_USER'),
        pass: getEnvVar('SMTP_PASS'),
      },
    });
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.fromEmail,
      to,
      subject,
      html,
    });
  }
}
