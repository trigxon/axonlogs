/**
 * Headless smoke — Follow-gated chat + plain-language copy.
 * Run: node scripts/smoke-follow-gate.mjs  (expects `npm run dev` on :5173)
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

try {
  /* 1 — auth gate renders with plain-language guarantees */
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(800);
  const gateText = await page.evaluate(() => document.body.innerText);
  ok(gateText.includes('Log in'), 'auth gate shows Log in');
  ok(gateText.includes('Only you and the person you message can read your chats.'), 'SecurityNote plain privacy guarantee visible');
  ok(gateText.includes('Your password is scrambled'), 'SecurityNote plain password guarantee visible');
  ok(!gateText.includes('PBKDF2-hashed'), 'no crypto jargon (PBKDF2-hashed) on auth screen');
  await page.screenshot({ path: `${SHOTS}fg-1-auth.png` });

  /* 2 — signup flow with live availability */
  const uname = process.env.SMOKE_USER || `smoke${Math.floor(Math.random() * 100000)}`;
  const clearAndType = async (sel, val) => {
    await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) throw new Error(`missing ${s}`);
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, sel);
    await page.type(sel, val, { delay: 12 });
  };
  const switchBtn = await page.evaluateHandle(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Sign up'));
  if (switchBtn && switchBtn.asElement()) { await switchBtn.asElement().click(); await sleep(400); }
  await clearAndType('input[aria-label="Username"]', uname);
  await sleep(900); // availability debounce
  const gateText2 = await page.evaluate(() => document.body.innerText);
  ok(gateText2.includes('available'), `live availability check ran for @${uname}`);
  await clearAndType('input[aria-label="Password"]', 'x');
  await page.screenshot({ path: `${SHOTS}fg-2-signup.png` });
  const submitBtn = await page.evaluateHandle(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Create account')));
  await submitBtn.asElement().click();
  await sleep(2500);

  const afterAuth = await page.evaluate(() => document.body.innerText);
  ok(afterAuth.includes('@') && (afterAuth.includes('Your messages') || afterAuth.includes('No chats yet')), 'landed in the app after signup');
  await page.screenshot({ path: `${SHOTS}fg-3-app.png` });

  /* 3 — New message modal is the Instagram people picker with follow gating */
  const newMsgBtn = await page.evaluateHandle(() => [...document.querySelectorAll('button')].find(b => (b.title || '').includes('New message') || b.textContent.trim() === 'New message'));
  if (newMsgBtn && newMsgBtn.asElement()) { await newMsgBtn.asElement().click(); await sleep(900); }
  const modalText = await page.evaluate(() => document.body.innerText);
  ok(modalText.includes('New message'), 'New message modal opens');
  ok(modalText.includes('Pick someone you follow'), 'picker explains the follow rule in plain words');
  ok(modalText.includes('You follow') || modalText.includes("You're not following anyone yet"), 'picker shows followed suggestions section');
  await page.screenshot({ path: `${SHOTS}fg-4-picker.png` });

  /* 4 — picker search */
  const toInput = await page.$('input[placeholder="Search @username…"]');
  if (toInput) {
    await toInput.type('@z', { delay: 15 });
    await sleep(900);
    const pickerText = await page.evaluate(() => document.body.innerText);
    ok(pickerText.includes('Results') || pickerText.includes('No people found'), 'picker searches people');
    await page.screenshot({ path: `${SHOTS}fg-5-picker-search.png` });
  } else {
    ok(false, 'To: search input found');
  }

  /* 5 — Chat stays disabled until a followed person is picked */
  const toInput2 = await page.$('input[placeholder="Search @username…"]');
  if (toInput2) {
    await page.evaluate(() => {
      const el = document.querySelector('input[placeholder="Search @username…"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await toInput2.type('@nonfriend_user_x', { delay: 12 });
    await sleep(900);
    const chatBtn = await page.evaluateHandle(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Chat'));
    ok(chatBtn && chatBtn.asElement() && await chatBtn.asElement().evaluate(b => b.disabled), 'Chat button disabled until a followed person is picked');
    await page.screenshot({ path: `${SHOTS}fg-6-chat-disabled.png` });
  }

  /* 6 — group modal filters to followed people */
  const closeX = await page.evaluateHandle(() => [...document.querySelectorAll('.term-panel button')].find(b => b.querySelector('svg.lucide-x')));
  if (closeX && closeX.asElement()) { await closeX.asElement().click(); await sleep(500); }
  const newGroupBtn = await page.evaluateHandle(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('New group')));
  if (newGroupBtn && newGroupBtn.asElement()) { await newGroupBtn.asElement().click(); await sleep(800); }
  const groupText = await page.evaluate(() => document.body.innerText);
  ok(groupText.includes('add people you follow'), 'group modal explains follow rule');
  const gInput = await page.$('input[placeholder="Search people you follow…"]');
  ok(!!gInput, 'group member search placeholder says "Search people you follow…"');
  if (gInput) {
    await gInput.type('a', { delay: 10 });
    await sleep(900);
    const gt = await page.evaluate(() => document.body.innerText);
    ok(gt.includes('No one you follow matches'), 'group results filtered to followed accounts (none followed → hint shown)');
    await page.screenshot({ path: `${SHOTS}fg-7-group-filtered.png` });
  }
} catch (err) {
  failed++;
  console.error('SMOKE ERROR:', err.message);
  try { await page.screenshot({ path: `${SHOTS}fg-error.png` }); } catch {}
} finally {
  await browser.close();
}

console.log(`\nFollow-gate smoke: ${passed}/${passed + failed} checks passed`);
process.exit(failed > 0 ? 1 : 0);
