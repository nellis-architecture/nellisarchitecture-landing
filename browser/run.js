/* Browser test runner: serves the repo on :8000, launches a local browser
   through playwright-core, runs the browser/ tests with node --test,
   then stops both. Local only, not CI.
   BROWSER picks the browser: brave, chrome, safari (the WebKit build that
   Playwright downloads, not Safari.app) or the absolute path of a Chromium
   browser binary. Unset: the installed Brave or Google Chrome.
   HEADED=1 launches the browser visibly. */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium, webkit } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const BASE = 'http://localhost:8000';
const SERVE = path.join(ROOT, 'node_modules', 'serve', 'build', 'main.js');
const CHROMIUM = {
  brave: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  chrome: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
};
const WEBKIT = ['safari', 'webkit'];
const USAGE = 'BROWSER takes brave, chrome, safari (or webkit), or the absolute'
  + ' path of a Chromium browser binary. Unset: the installed Brave or Google Chrome.';

const exists = (bin) => fs.existsSync(bin);

/* The playwright-core engine for BROWSER and HEADED, with its launch options.
   `isThere` stands in for the file system, so tests need no real browser. */
function pickBrowser(env = process.env, isThere = exists) {
  const headless = env.HEADED !== '1';
  const value = (env.BROWSER || '').trim();
  const keyword = value.toLowerCase();
  if (WEBKIT.includes(keyword)) {
    if (!isThere(webkit.executablePath())) {
      throw new Error('The Playwright WebKit build is not installed. Install it with:'
        + '\n  npx playwright-core install webkit');
    }
    return { engine: webkit, type: 'webkit', options: { headless } };
  }
  /* hasOwn: BROWSER=constructor must not find Object.prototype. */
  const known = Object.hasOwn(CHROMIUM, keyword);
  if (value && !known && !path.isAbsolute(value)) {
    throw new Error(`Unknown BROWSER: ${value}. ${USAGE}`);
  }
  const candidates = value ? [known ? CHROMIUM[keyword] : value] : Object.values(CHROMIUM);
  const found = candidates.find((bin) => isThere(bin));
  if (!found) {
    const why = value ? `No browser at ${candidates[0]}.` : 'No Chromium browser found.';
    throw new Error(`${why} ${USAGE}`);
  }
  return {
    engine: chromium, type: 'chromium', options: { headless, executablePath: found },
  };
}

/* A child that a signal killed closes with code null. That is a failure. */
const exitCode = (code) => code ?? 1;

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
    child.on('close', (code) => resolve(exitCode(code)));
  });
}

async function main() {
  if (await ping()) {
    throw new Error('Port 8000 is already in use. Stop the process that uses it'
      + ' (for example npm run serve) and run npm run test:browser again.');
  }
  const browser = pickBrowser();
  const shots = path.join(
    os.homedir(),
    'nellis-browser-tests',
    new Date().toISOString().replace(/[:.]/g, '-'),
  );
  fs.mkdirSync(shots, { recursive: true });
  const server = spawn(process.execPath, [SERVE, '-l', '8000'], { cwd: ROOT, stdio: 'ignore' });
  let browserServer = null;
  let tests = null;
  const gone = (proc) => (proc.exitCode === null
    ? new Promise((resolve) => {
      proc.on('exit', resolve);
    }) : Promise.resolve());
  /* Signals cannot wait: kill the browser hard, then let the loop drain. */
  const abort = (code) => {
    if (tests) tests.kill('SIGTERM');
    if (browserServer) browserServer.kill();
    server.kill('SIGTERM');
    process.exitCode = code;
  };
  process.on('SIGINT', () => abort(130));
  process.on('SIGTERM', () => abort(143));
  try {
    await untilReady(Date.now() + 15000);
    browserServer = await browser.engine.launchServer(browser.options);
    const code = await runTests({
      ...process.env,
      NELLIS_BASE: BASE,
      NELLIS_WS: browserServer.wsEndpoint(),
      NELLIS_ENGINE: browser.type,
      NELLIS_SHOTS: shots,
    }, (child) => {
      tests = child;
    });
    return code;
  } finally {
    if (tests) tests.kill('SIGTERM');
    server.kill('SIGTERM');
    /* close() stops the browser and its ws server; the ws server would
       otherwise keep this process alive. */
    if (browserServer) await browserServer.close().catch(() => {});
    await gone(server);
  }
}

module.exports = {
  CHROMIUM, WEBKIT, USAGE, pickBrowser, exitCode,
};

if (require.main === module) {
  main().then((code) => {
    if (process.exitCode === undefined) process.exitCode = code;
  }, (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
