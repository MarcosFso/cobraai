import nodemailer from 'nodemailer';
import { config } from './config.js';

export interface Mailer {
  send(to: string, subject: string, text: string): Promise<void>;
}

/** Sends through SMTP. In docker compose the server is Mailpit (fake inbox at http://localhost:8025). */
export class SmtpMailer implements Mailer {
  private transport = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: false,
    ignoreTLS: true,
  });

  async send(to: string, subject: string, text: string): Promise<void> {
    await this.transport.sendMail({ from: config.mailFrom, to, subject, text });
  }
}
