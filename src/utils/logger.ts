type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

// Patterns that must never appear in log output
const SENSITIVE_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]+/g,       // Claude API keys
  /SG\.[A-Za-z0-9_.-]+/g,          // SendGrid keys
  /postgresql:\/\/[^@]+@/g,         // DB credentials in URL
  /password["']?\s*[:=]\s*["']?\S+/gi,
  /api[_-]?key["']?\s*[:=]\s*["']?\S+/gi,
];

function redactSensitive(value: string): string {
  let redacted = value;
  for (const pattern of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted;
}

function sanitizeContext(
  context: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (typeof value === 'string') {
      sanitized[key] = redactSensitive(value);
    } else if (value instanceof Error) {
      sanitized[key] = redactSensitive(value.message);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function write(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message: redactSensitive(message),
    ...(context ? { context: sanitizeContext(context) } : {}),
  };
  const output = JSON.stringify(entry);
  if (level === 'error' || level === 'warn') {
    process.stderr.write(output + '\n');
  } else {
    process.stdout.write(output + '\n');
  }
}

export const logger = {
  debug(message: string, context?: Record<string, unknown>): void {
    if (process.env['NODE_ENV'] !== 'production') {
      write('debug', message, context);
    }
  },
  info(message: string, context?: Record<string, unknown>): void {
    write('info', message, context);
  },
  warn(message: string, context?: Record<string, unknown>): void {
    write('warn', message, context);
  },
  error(message: string, context?: Record<string, unknown>): void {
    write('error', message, context);
  },
};