const fs = require('fs');
const path = require('path');
const { app } = require('electron');

let logFilePath;

function getLogFilePath() {
  if (logFilePath) return logFilePath;
  const baseDir = app.getPath('userData');
  const logsDir = path.join(baseDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  logFilePath = path.join(logsDir, 'app.log');
  return logFilePath;
}

function formatLine(level, message, meta) {
  const ts = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${ts}] ${level.toUpperCase()} ${message}${metaStr}`;
}

function writeLine(line) {
  try {
    fs.appendFileSync(getLogFilePath(), line + '\n', 'utf8');
  } catch {
    // best-effort
  }
}

function log(level, message, meta) {
  const line = formatLine(level, message, meta);
  // keep stdout for dev
  // eslint-disable-next-line no-console
  console.log(line);
  writeLine(line);
}

module.exports = {
  getLogFilePath,
  info: (m, meta) => log('info', m, meta),
  warn: (m, meta) => log('warn', m, meta),
  error: (m, meta) => log('error', m, meta),
};
