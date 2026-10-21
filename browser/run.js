/* Browser test runner: serves the repo on :8000, launches a local Chromium
   browser through playwright-core, runs the browser/ tests with node --test,
   then stops both. Local only, not CI. NELLIS_BROWSER overrides the browser. */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const BASE = 'http://localhost:8000';
const SERVE = path.join(ROOT, 'node_modules', 'serve', 'build', 'main.js');
const BROWSERS = [
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

function browserPath() {
  const candidates = process.env.NELLIS_BROWSER
    ? [process.env.NELLIS_BROWSER] : BROWSERS;
  const found = candidates.find((bin) => fs.existsSync(bin));
  if (!found) {
    throw new Error('No Chromium browser found. Install Brave or Google Chrome,'
      + ' or set NELLIS_BROWSER to the browser binary.');
  }
  return found;
}

function ping() {
  return new Promise((resolve) => {
    const req = http.get(BASE, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

const wait = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

function untilReady(deadline) {
  return ping().then((ok) => {
    if (ok) return undefined;
    if (Date.now() > deadline) throw new Error(`${BASE} did not answer within 15 s.`);
    return wait(100).then(() => untilReady(deadline));
  });
}

function testFiles() {
  return fs.readdirSync(__dirname, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js') && entry.name !== 'run.js')
    .map((entry) => path.join(__dirname, entry.name));
}

function runTests(env, set) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--test', ...testFiles()], {
      cwd: ROOT, stdio: 'inherit', env,
    });
    set(child);
    child.on('close', (code) => resolve(code || 0));
  });
}

async function main() {
  if (await ping()) {
    throw new Error('Port 8000 is already in use. Stop the process that uses it'
      + ' (for example npm run serve) and run npm run test:browser again.');
  }
  const shots = path.join(
    os.homedir(),
    'nellis-browser-tests',
    new Date().toISOString().replace(/[:.]/g, '-'),
  );
  fs.mkdirSync(shots, { recursive: true });
  const server = spawn(process.execPath, [SERVE, '-l', '8000'], { cwd: ROOT, stdio: 'ignore' });
  let browserServer = null;
  let tests = null;
  const stop = () => {
    if (browserServer && browserServer.process()) browserServer.process().kill('SIGTERM');
    if (tests) tests.kill('SIGTERM');
    server.kill('SIGTERM');
  };
  process.on('SIGINT', () => {
    stop();
    process.exitCode = 130;
  });
  process.on('SIGTERM', () => {
    stop();
    process.exitCode = 143;
  });
  try {
    await untilReady(Date.now() + 15000);
    browserServer = await chromium.launchServer({ executablePath: browserPath() });
    const code = await runTests({
      ...process.env,
      NELLIS_BASE: BASE,
      NELLIS_WS: browserServer.wsEndpoint(),
      NELLIS_SHOTS: shots,
    }, (child) => {
      tests = child;
    });
    return code;
  } finally {
    stop();
    const gone = (proc) => (proc.exitCode === null
      ? new Promise((resolve) => {
        proc.on('exit', resolve);
      }) : Promise.resolve());
    const procs = [server];
    if (browserServer && browserServer.process()) procs.push(browserServer.process());
    await Promise.all(procs.map(gone));
  }
}

main().then((code) => {
  if (process.exitCode === undefined) process.exitCode = code;
}, (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
