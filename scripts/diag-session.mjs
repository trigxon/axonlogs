/**
 * Diagnostic: signup → state dump → hard reload → state dump.
 * Distinguishes "signup failed (rate limit)" from "session lost on reload".
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
for (const line of fs.readFileSync(path.join(projectRoot, '.env.local'), 'utf-8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const BASE = process.env.BASE_URL || 'https://axonlogs.vercel.app';
const CHROME = '/home/z/.cache/puppeteer/chrome/linux-155.0.8059.39/chrome-linux64/chrome';

const browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message || e).slice(0, 200)));

const uname = `diag${Date.now().toString().slice(-8)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dump = (label) => page.evaluate((l) => {
  const ls = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = (localStorage.getItem(k) || '').slice(0, 60); }
  return { label: l, text: document.body.innerText.slice(0, 400).replace(/\n/g, ' | '), lsKeys: Object.keys(ls), ls };
}, label).then(console.log);

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 45000 });
await page.waitForSelector('input', { timeout: 20000 });

// click "sign up" mode toggle
await page.evaluate(() => {
  const cands = [...document.querySelectorAll('button, a, span, div')];
  const t = cands.find((b) => /^(sign up|create account)$/i.test((b.textContent || '').trim()));
  if (t) t.click();
});
await sleep(800);
await page.type('input[placeholder="username"], input:not([type="password"])', uname, { delay: 8 });
const passInput = await page.$('input[type="password"]');
await passInput.type('diag-pass-123', { delay: 8 });
await page.keyboard.press('Enter');
await sleep(5000);
await dump('AFTER-SIGNUP');
console.log('signed-in handle visible:', await page.evaluate((u) => document.body.innerText.includes('@' + u), uname));

// hard reload → session persistence?
await page.goto(`${BASE}/direct`, { waitUntil: 'networkidle2', timeout: 45000 });
await sleep(4000);
await dump('AFTER-RELOAD');
console.log('signed-in handle after reload:', await page.evaluate((u) => document.body.innerText.includes('@' + u), uname));
console.log('page errors:', errors.length ? errors.slice(0, 3) : 'none');
await browser.close();
