// Shared harness for the AimForge headless-Chrome suites.
// Env: AF_URL (default http://localhost:8317/), CHROME_PATH (browser binary).
import puppeteer from 'puppeteer-core';
import fs from 'fs';

export const BASE_URL = process.env.AF_URL || 'http://localhost:8317/';

export function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
       '/Applications/Chromium.app/Contents/MacOS/Chromium']
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
       '/usr/bin/chromium-browser', '/usr/bin/chromium'];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  throw new Error('No Chrome/Chromium found — set CHROME_PATH to a browser binary.');
}

export function launch(extraArgs = []) {
  return puppeteer.launch({
    executablePath: chromePath(),
    headless: 'new',
    // --enable-unsafe-swiftshader gives software WebGL headless.
    // --no-sandbox + --disable-dev-shm-usage are required on GitHub's ubuntu
    // runners (24.04 user-namespace restriction; tiny /dev/shm). Harmless locally.
    // If WebGL context creation ever fails on a runner: add --use-angle=swiftshader.
    args: [
      '--enable-unsafe-swiftshader',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1600,900',
      '--hide-scrollbars',
      ...extraArgs,
    ],
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const OUT_DIR = new URL('./out/', import.meta.url).pathname;

/** Best-effort failure screenshot so CI artifacts show what went wrong. */
export async function failShot(page, name) {
  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    await page.screenshot({ path: `${OUT_DIR}fail-${name}.png` });
    console.error(`failure screenshot: tests/out/fail-${name}.png`);
  } catch { /* screenshotting a dead page must not mask the real failure */ }
}
