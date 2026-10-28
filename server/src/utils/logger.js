/* Minimal structured logger. Silent during automated tests. */
const silent = process.env.NODE_ENV === 'test';

function line(level, msg, meta) {
  if (silent) return;
  const ts = new Date().toISOString();
  const extra = meta ? ` ${JSON.stringify(meta)}` : '';
  const out = `[${ts}] ${level.toUpperCase()} ${msg}${extra}`;
  if (level === 'error') console.error(out);
  else if (level === 'warn') console.warn(out);
  else console.log(out);
}

const logger = {
  info: (msg, meta) => line('info', msg, meta),
  warn: (msg, meta) => line('warn', msg, meta),
  error: (msg, meta) => line('error', msg, meta),
};

export default logger;
