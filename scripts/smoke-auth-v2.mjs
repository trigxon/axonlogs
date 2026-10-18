/**
 * Headless smoke — Phase B: Supabase Auth identity round-trip.
 * Run: node scripts/smoke-auth-v2.mjs  (expects `npm run dev` on :5173)
 *
 * Verifies against the LIVE Supabase project:
 *  1. auth gate renders
 *  2. signup with a 1-char password is rejected with the new plain
 *     "at least 6 characters" error (proves supabase.auth.signUp is the
 *     live identity path — the legacy path accepted anything)
 *  3. signup with a valid password lands in the app
 *  4. session survives a page reload
 *  5. logout returns to the gate
 *  6. login with the same credentials lands in the app again
 *     (auth.signInWithPassword round-trip)
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const SHOTS = new URL('./smoke-shots/', import.meta.url).pathname;
fs.mkdirSync(SHOTS, { recursive: true });

let passed = 0, failed = 0;
const ok = (cond, name) => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ FAIL: ${name}`); }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: 'shell',
  executablePath: '/home/z/.cache/puppeteer/chrome-headless-shell/linux-155.0.8059.39/chrome-headless-shell-linux64/chrome-headless-shell',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.on('dialog', d => d.accept());

let openedProfile = false;
const clearAndType = async (sel, val) => {
  await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) throw new Error(`missing ${s}`);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, sel);
  await page.type(sel, val, { delay: 10 });
};

/** Click the first visible element whose text includes `needle`. */
const clickText = async (needle) => {
  const clicked = await page.evaluate((needle) => {
    const els = [...document.querySelectorAll('button, [role="button"], a, .cursor-pointer')];
    const el = els.find(e => e.offsetParent !== null && e.textContent && e.textContent.includes(needle));
    if (!el) return false;
    el.click();
    return true;
  }, needle);
  if (!clicked) throw new Error(`no clickable element with text: ${needle}`);
};

const inApp = () =>
  // The signed-in shell renders the desktop rail — the auth screen never does
  // (its titlebar prompt "AXON@AXONLOGS" contains an @, so text checks lie).
  page
    .waitForSelector('nav button[title="Profile"]', { timeout: 25000 })
    .then(() => true)
    .catch(() => false);

try {
  /* 1 — auth gate */
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(800);
  let text = await page.evaluate(() => document.body.innerText);
  ok(text.includes('Log in'), 'auth gate shows Log in');
  await page.screenshot({ path: `${SHOTS}au-1-gate.png` });

  /* 2 — switch to signup */
  await clickText('Sign up');
  await sleep(400);

  const uname = `au${Math.floor(Math.random() * 1000000)}`;
  await clearAndType('input[placeholder="username"]', uname);
  await clearAndType('input[placeholder="password"]', 'x');
  await clickText('Create account');
  await sleep(1800);
  text = await page.evaluate(() => document.body.innerText);
  ok(text.includes('at least 6 characters'), '1-char password rejected by Supabase Auth floor (plain message)');
  await page.screenshot({ path: `${SHOTS}au-2-floor.png` });

  /* 3 — valid signup */
  await clearAndType('input[placeholder="password"]', 'smoke-pass-123');
  await clickText('Create account');
  const landedSignup = await inApp();
  ok(landedSignup, 'valid signup lands in the app (Supabase Auth session)');
  await page.screenshot({ path: `${SHOTS}au-3-signup.png` });

  if (!landedSignup) {
    // Signup can be externally blocked by the project's auth config (email
    // confirmation ON, GoTrue email-domain validation, per-IP rate limit).
    // Those states ship honest on-screen copy; report them as SKIPPED, not
    // silent failures, and skip the session-dependent steps below.
    text = await page.evaluate(() => document.body.innerText);
    const externallyBlocked =
      /temporarily blocked|asks for email confirmation|rate limit|locked down|too many accounts|wait a few minutes/i.test(text);
    if (externallyBlocked) {
      const reason = (text.match(/[^\n]*(?:temporarily blocked|asks for email confirmation|rate limit|locked down|[Tt]oo many accounts|wait a few minutes)[^\n]*/i) || ['auth provider blocked signup'])[0].trim();
      console.log(`  ⚠ SKIP: signup blocked by project auth config — "${reason.slice(0, 90)}"`);
      console.log('  ⚠ SKIP: session reload / profile / logout / login round-trip (need a session)');
      console.log(`\nResult: ${passed} passed, ${failed} failed, 4 skipped (owner action documented in AUDIT.md §8)`);
      await browser.close();
      process.exit(failed > 0 ? 1 : 0);
    }
  }

  /* 4 — session survives reload (rail = signed-in shell) */
  await page.reload({ waitUntil: 'networkidle2' });
  const railRestored = await inApp();
  ok(railRestored, 'session persists across reload (signed-in shell renders)');
  await page.screenshot({ path: `${SHOTS}au-4-reload.png` });

  /* 5 — logout via profile pane */
  openedProfile = await page.evaluate(() => {
    const btn = document.querySelector('nav button[title="Profile"]');
    if (!btn) return false;
    btn.click();
    return true;
  });
  ok(openedProfile, 'profile pane opens from the rail');
  await sleep(900);
  await clickText('Log out');
  await sleep(1200);
  text = await page.evaluate(() => document.body.innerText);
  ok(text.includes('Log in'), 'logout returns to the auth gate');
  await page.screenshot({ path: `${SHOTS}au-5-logout.png` });

  /* 6 — login round-trip (Supabase Auth signInWithPassword) */
  await clearAndType('input[placeholder="username"]', uname);
  await clearAndType('input[placeholder="password"]', 'smoke-pass-123');
  await clickText('Log in');
  const landedLogin = await inApp();
  ok(landedLogin, 'login with the same credentials lands in the app again');
  await page.screenshot({ path: `${SHOTS}au-6-login.png` });
} catch (e) {
  failed++;
  console.log('  ✗ EXCEPTION:', e.message);
  try { await page.screenshot({ path: `${SHOTS}au-error.png` }); } catch {}
} finally {
  await browser.close();
}

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed === 0 ? 0 : 1);
