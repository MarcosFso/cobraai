export const config = {
  port: Number(process.env.PORT ?? 3000),
  kafkaBrokers: (process.env.KAFKA_BOOTSTRAP ?? 'localhost:9092').split(','),
  groupId: process.env.KAFKA_GROUP_ID ?? 'notification-service',
  smtpHost: process.env.SMTP_HOST ?? 'localhost',
  smtpPort: Number(process.env.SMTP_PORT ?? 1025),
  mailFrom: process.env.MAIL_FROM ?? 'cobrancas@example.com',
  dbPath: process.env.DB_PATH ?? './data/notifications.db',
  // Shared with the billing and report services: all of them verify the same login token.
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret-change-me-0123456789abcdef',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(','),
};
