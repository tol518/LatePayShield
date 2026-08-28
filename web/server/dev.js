import { spawn } from 'node:child_process';

const children = [
  spawn(process.execPath, ['server/index.js'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' }),
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
