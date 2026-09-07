/**
 * Run the backend and the frontend together.
 *
 *   node scripts/dev.mjs
 *
 * Zero dependencies on purpose. `concurrently` would do this in one line of package.json, but the
 * frontend's dependency tree already has a peer conflict (see frontend/README.md) and adding
 * anything to it right now means every developer's first command is a resolution error. Node's
 * own `spawn` is enough for two processes.
 *
 * Two behaviours worth knowing:
 *
 *  - **Output is prefixed and interleaved.** Two servers writing to one terminal is unreadable
 *    without a label, and the backend logs one JSON line per request, so you want to know at a
 *    glance which half is talking.
 *  - **If either process dies, both stop.** A frontend still serving pages against a dead API
 *    silently falls back to sample data — which is correct behaviour for the app and completely
 *    the wrong thing to be debugging without noticing.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = [
  { name: 'api', colour: '\x1b[36m', cwd: join(ROOT, 'backend'), args: ['run', 'dev'] },
  { name: 'web', colour: '\x1b[35m', cwd: join(ROOT, 'frontend'), args: ['run', 'dev'] },
];

const RESET = '\x1b[0m';
let stopping = false;

/** Prefix every line, including the partial one at the end of a chunk. */
function pipe(stream, label) {
  let tail = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    const lines = (tail + chunk).split('\n');
    tail = lines.pop();
    lines.forEach((line) => process.stdout.write(`${label} ${line}\n`));
  });
  stream.on('end', () => { if (tail) process.stdout.write(`${label} ${tail}\n`); });
}

const children = TARGETS.map(({ name, colour, cwd, args }) => {
  const label = `${colour}[${name}]${RESET}`;
  // `npm` is a shell script on Windows, so it needs shell:true to be found on PATH.
  const child = spawn('npm', args, { cwd, shell: true });
  pipe(child.stdout, label);
  pipe(child.stderr, label);
  child.on('exit', (code) => {
    if (stopping) return;
    process.stdout.write(`${label} exited with code ${code} — stopping the other process too.\n`);
    stop(code ?? 1);
  });
  return child;
});

function stop(code) {
  if (stopping) return;
  stopping = true;
  children.forEach((c) => { try { c.kill(); } catch { /* already gone */ } });
  // A moment for the children to die before this process does, so their last lines are not lost.
  setTimeout(() => process.exit(code), 200);
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

console.log('NeuIQ dev — api on http://localhost:4200, web on http://localhost:5174');
console.log('Ctrl-C stops both.\n');
