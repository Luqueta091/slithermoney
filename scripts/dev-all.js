#!/usr/bin/env node

const { spawn } = require('child_process');

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const processes = new Map();
let shuttingDown = false;

const setupSteps = [
  { name: 'build:packages', args: ['run', 'build:packages'] },
  { name: 'db:generate', args: ['run', 'db:generate'] },
];

const services = [
  { name: 'api', args: ['-w', 'apps/api', 'run', 'dev'] },
  { name: 'game-server', args: ['-w', 'apps/game-server', 'run', 'dev'] },
  { name: 'worker', args: ['-w', 'apps/worker', 'run', 'dev'] },
  { name: 'mobile', args: ['-w', 'apps/mobile', 'run', 'dev'] },
];

async function runStep(step) {
  return new Promise((resolve, reject) => {
    const child = spawn(npmCmd, step.args, { stdio: 'inherit', env: process.env });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${step.name} failed with code ${code ?? 1}`));
    });
  });
}

function startService(service) {
  const child = spawn(npmCmd, service.args, { stdio: 'inherit', env: process.env });
  processes.set(service.name, child);

  child.on('exit', (code) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    shutdownChildren();
    process.exit(code ?? 0);
  });
}

function shutdownChildren() {
  for (const child of processes.values()) {
    child.kill('SIGTERM');
  }
}

function handleSignal(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  shutdownChildren();
  process.exit(signal === 'SIGINT' ? 130 : 143);
}

process.on('SIGINT', () => handleSignal('SIGINT'));
process.on('SIGTERM', () => handleSignal('SIGTERM'));

async function main() {
  for (const step of setupSteps) {
    await runStep(step);
  }

  services.forEach(startService);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
