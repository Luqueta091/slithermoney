import { getRequestContext } from './request-context';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type Logger = {
  debug: (message: string, data?: Record<string, unknown>) => void;
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
};

const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function createLogger(options: { serviceName: string; level?: LogLevel }): Logger {
  const minLevel = options.level ?? 'info';

  const shouldLog = (level: LogLevel) => levelWeight[level] >= levelWeight[minLevel];

  const log = (level: LogLevel, message: string, data?: Record<string, unknown>) => {
    if (!shouldLog(level)) {
      return;
    }

    const context = getRequestContext();
    const entry = pruneUndefined({
      timestamp: new Date().toISOString(),
      level,
      message,
      service_name: options.serviceName,
      ...context,
      ...data,
    });

    const output = JSON.stringify(entry);
    if (level === 'error') {
      console.error(output);
      return;
    }

    console.log(output);
  };

  return {
    debug: (message, data) => log('debug', message, data),
    info: (message, data) => log('info', message, data),
    warn: (message, data) => log('warn', message, data),
    error: (message, data) => log('error', message, data),
  };
}

function pruneUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
