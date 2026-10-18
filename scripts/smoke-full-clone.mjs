/**
 * Smoke: full-clone expansion — routed shell, stories UI, notifications,
 * profiles, explore, settings — against the LIVE Supabase backend.
 * Graceful degradation is expected until schema SECTION 6 is applied;
 * the app must never crash or blank-screen.
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

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !extra ? '' : ` — ${extra}`}`);
};

const CHROME = '/home/z/.cache/puppeteer/chrome/linux-155.0.8059.39/chrome-linux64/chrome';
const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const shots = path.join(projectRoot, 'scripts', 'smoke-shots');
fs.mkdirSync(shots, { recursive: true });
const shot = (n) => page.screenshot({ path: path.join(shots, `fc-${n}.png`) });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message || e)));

const uname = `smoke${Date.now().toString().slice(-8)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const bodyText = () => page.evaluate(() => document.body.innerText);
const hasHandle = () => page.evaluate((u) => document.body.innerText.includes('@' + u), uname);

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 45000 });
await page.waitForSelector('input', { timeout: 20000 });

// 1. signup lands inside the routed app (rail + @handle visible)
await page.evaluate(() => {
  const cands = [...document.querySelectorAll('button, a, span, div')];
  const t = cands.find((b) => /^(sign up|create account)$/i.test((b.textContent || '').trim()));
  if (t) t.click();
});
await sleep(800);
await page.type('input[placeholder="username"], input:not([type="password"])', uname, { delay: 8 });
const passInput = await page.$('input[type="password"]');
await passInput.type('smoke-pass-123', { delay: 8 });
await page.keyboard.press('Enter');
await sleep(4000);
let text = await bodyText();
const signedIn = await hasHandle();
check('1. signup lands inside the app shell', signedIn, text.slice(0, 150).replace(/\n/g, ' '));
await shot('1-shell');

// 2. explore route
await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded' });
await sleep(2200);
text = await bodyText();
check('2. /explore renders people search', /search people|you follow|recent/i.test(text), text.slice(0, 120).replace(/\n/g, ' '));
await shot('2-explore');

// 3. notifications route (graceful without SECTION 6)
await page.goto(`${BASE}/notifications`, { waitUntil: 'domcontentloaded' });
await sleep(2200);
text = await bodyText();
check('3. /notifications renders (empty or list)', /notifications|no activity/i.test(text), text.slice(0, 120).replace(/\n/g, ' '));
await shot('3-notifications');

// 4. create story route
await page.goto(`${BASE}/create`, { waitUntil: 'domcontentloaded' });
await sleep(2200);
text = await bodyText();
check('4. /create renders story composer', /add to your story|cloud connection|choose a photo/i.test(text), text.slice(0, 120).replace(/\n/g, ' '));
await shot('4-create');

// 5. own profile route
await page.goto(`${BASE}/profile/${uname}`, { waitUntil: 'domcontentloaded' });
await sleep(2500);
text = await bodyText();
const profileOk = await page.evaluate((u) => document.body.innerText.includes('@' + u), uname);
check('5. /profile/:username renders own profile', profileOk, text.slice(0, 120).replace(/\n/g, ' '));
check('6. profile offers Edit profile', /edit profile/i.test(text));
await shot('5-profile');

// 7. settings account lifecycle
await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
await sleep(2500);
text = await bodyText();
check(
  '7. /settings shows password change + logout everywhere + delete account',
  /change password/i.test(text) && /log out everywhere/i.test(text) && /delete account/i.test(text),
  text.slice(0, 120).replace(/\n/g, ' ')
);
await shot('6-settings');

// 8. unknown route → in-app 404
await page.goto(`${BASE}/definitely-not-a-route`, { waitUntil: 'domcontentloaded' });
await sleep(1800);
text = await bodyText();
check('8. unknown route shows in-app 404', /isn't here|404/i.test(text), text.slice(0, 120).replace(/\n/g, ' '));
await shot('7-404');

// 9. mobile viewport → bottom nav + stories tray on desktop
await page.setViewport({ width: 390, height: 844 });
await page.goto(`${BASE}/direct`, { waitUntil: 'domcontentloaded' });
await sleep(2200);
const bottomNav = await page.evaluate(() => {
  const navs = [...document.querySelectorAll('nav')];
  return navs.some((n) => /md:hidden/.test(n.className) && /chats|profile|create/i.test(n.textContent || ''));
});
check('9. mobile bottom nav renders', bottomNav);
await shot('8-mobile');

await page.setViewport({ width: 1440, height: 900 });
await page.goto(`${BASE}/direct`, { waitUntil: 'domcontentloaded' });
await sleep(2200);
text = await bodyText();
check('10. stories tray mounts on the inbox', /your story|stories from people/i.test(text), text.slice(0, 120).replace(/\n/g, ' '));
await shot('9-tray');

// 11. no unexpected page errors (graceful degradation without SECTION 6)
const hardErrors = errors.filter((e) => !/table|relation|schema|PGRST|Could not find/i.test(e));
check('11. no unexpected page errors', hardErrors.length === 0, hardErrors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} smoke checks passed`);
process.exit(failed.length > 0 ? 1 : 0);
