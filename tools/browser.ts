// Headless Chromium around the dev server, shared by the smoke test, the playtest and the
// screenshot tool. Playwright is not a dependency of this repository: it is found wherever the
// machine has it (a global install, or the copy CI puts on the path), and the browser binary falls
// back to the pre-installed one when Playwright's own download is absent.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { createServer } from './server.ts';

const require = createRequire(import.meta.url);

function loadPlaywright(): any {
  for (const c of ['playwright', 'playwright-core', '/opt/node22/lib/node_modules/playwright', '/usr/lib/node_modules/playwright', '/usr/local/lib/node_modules/playwright']) {
    try { return require(c); } catch { /* next */ }
  }
  throw new Error('Playwright not found (npm i -g playwright, or run where it is installed)');
}

async function launch(chromium: any): Promise<any> {
  try { return await chromium.launch(); }
  catch (e) {
    for (const exe of [process.env.PLAYWRIGHT_CHROMIUM, '/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
      if (exe && fs.existsSync(exe)) return chromium.launch({ executablePath: exe });
    }
    throw e;
  }
}

export interface GameSession {
  page: any;
  errors: string[];
  /** Run n fixed steps (test mode drives the loop through this). */
  step(n?: number): Promise<void>;
  /** Save the canvas, scaled up, as a PNG. */
  shot(file: string): Promise<void>;
  eval<T>(fn: string): Promise<T>;
  close(): Promise<void>;
}

/** Serve the repository, open `?test&<query>` and wait for the first frame. */
export async function openGame(query: string, { scale = 2 }: { scale?: number } = {}): Promise<GameSession> {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, () => r()));
  const port = (server.address() as AddressInfo).port;
  const { chromium } = loadPlaywright();
  const browser = await launch(chromium);
  const page = await browser.newPage({ viewport: { width: 640 * scale, height: 360 * scale }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('pageerror', (e: Error) => errors.push('pageerror: ' + e.message));
  page.on('console', (m: any) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(`http://localhost:${port}/?test${query ? '&' + query : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => (window as any).__game?.ready === true || ((window as any).__game?.errors?.length ?? 0) > 0, null, { timeout: 20000 });
  const pageErrors: string[] = await page.evaluate(() => (window as any).__game?.errors ?? []);
  errors.push(...pageErrors);
  return {
    page,
    errors,
    async step(n = 1) { await page.evaluate((k: number) => (window as any).__game.step(k), n); },
    async shot(file: string) {
      const el = await page.$('#stage');
      await el.screenshot({ path: file });
    },
    async eval<T>(fn: string): Promise<T> { return page.evaluate(fn); },
    async close() { await browser.close(); server.close(); },
  };
}
