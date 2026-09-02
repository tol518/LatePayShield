import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// One operator token for this development run, shared by the service that
// checks it and the Vite dev server that injects it into the page. A token
// already configured for this machine wins, so the two never disagree.
const environmentFile = fileURLToPath(new URL('../../.env', import.meta.url));
const configured = existsSync(environmentFile)
  ? dotenv.parse(readFileSync(environmentFile)).WEB_OPERATOR_TOKENS
  : undefined;
const env = {
  ...process.env,
  WEB_OPERATOR_TOKENS: process.env.WEB_OPERATOR_TOKENS
    ?? configured
    ?? `local-operator:${randomBytes(32).toString('hex')}`,
};

const children = [
  spawn(process.execPath, ['server/index.js'], { stdio: 'inherit', env }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit', env }),
];

let stopping = false;
function stop(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill(signal);
}

for (const child of children) {
  child.on('exit', (code) => {
    if (!stopping) {
      stop();
      process.exitCode = code ?? 1;
    }
  });
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
