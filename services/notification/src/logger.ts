/** JSON logs, one per line. Never log the full e-mail or any CPF/CNPJ: only ids. */
export type Fields = Record<string, unknown>;

function write(level: string, message: string, fields: Fields): void {
  const line = JSON.stringify({
    '@timestamp': new Date().toISOString(),
    level,
    service: 'notification-service',
    message,
    ...fields,
  });
  (level === 'error' ? process.stderr : process.stdout).write(line + '\n');
}

export const logger = {
  info: (message: string, fields: Fields = {}) => write('info', message, fields),
  warn: (message: string, fields: Fields = {}) => write('warn', message, fields),
  error: (message: string, fields: Fields = {}) => write('error', message, fields),
};

export type Logger = typeof logger;
