// Live end-to-end smoke against production (axonlogs.vercel.app).
// Creates two confirmed users via the auth-signup edge function (admin API,
// no email), then drives the REAL UI in two browser sessions:
//   login → explore/search → follow → follow back → DM round-trip
//   (realtime both ways) → notifications badge/content → logout.
// Cleans up both test accounts via the Management API at the end.
//
// Env: SUPABASE_ACCESS_TOKEN (required for cleanup), LIVE_URL (optional).
// Run: cd axonlogs && node scripts/e2e-live.mjs

import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';

const LIVE_URL = process.env.LIVE_URL || 'https://axonlogs.vercel.app';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
const { URL: SB_URL, KEY: SB_KEY } = (() => {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  return {
    URL: env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim(),
    KEY: env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim(),
  };
})();

const STAMP = Date.now().toString(36).slice(-6);
const USER_A = `e2ea${STAMP}`;
const USER_B = `e2eb${STAMP}`;
const PASSWORD = 'e2e-live-test-2026';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? '✓ PASS' : '✗ FAIL'} - ${name}${detail ? ` (${detail})` : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function edgeSignup(username) {
  const res = await fetch(`${SB_URL}/functions/v1/auth-signup`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORD, avatar_gradient: 'g3' }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function sqlCleanup(usernames) {
  if (!TOKEN) return;
  const q = usernames
    .map(u => `delete from auth.users where email = '${u}@users.axonlogs.app'; delete from public.accounts where username = '${u}';`)
    .join('\n');
  await fetch(`https://api.supabase.com/v1/projects/qlepfndedkpqmzyfnhmc/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  }).catch(() => {});
}

/** Login through the real auth screen and wait for the signed-in rail. */
async function login(page, username) {
  console.log(`  [login:${username}] opening ${LIVE_URL}`);
  await page.goto(LIVE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  console.log(`  [login:${username}] page loaded, waiting for auth input`);
  await page.waitForSelector('input[placeholder="username, email or mobile"]', { timeout: 30000 });
  await page.type('input[placeholder="username, email or mobile"]', username, { delay: 10 });
  await page.type('input[type="password"]', PASSWORD, { delay: 10 });
  console.log(`  [login:${username}] credentials typed, screenshot + submit`);
  await page.screenshot({ path: `scripts/e2e-shots/login-${username}.png` });
  await page.click('button[type="submit"]');
  console.log(`  [login:${username}] submitted, waiting for rail`);
  await page.waitForSelector('button[aria-label="Chats"]', { timeout: 45000 });
  console.log(`  [login:${username}] signed in`);
}

/** Find a button by exact rendered text whose ancestors mention @target. */
const clickRowButton = (page, target, labelRegex) =>
  page.evaluate(
    (t, re) => {
      const rx = new RegExp(re, 'i');
      for (const b of [...document.querySelectorAll('button')]) {
        if (!rx.test(b.innerText.trim())) continue;
        let el = b;
        for (let i = 0; i < 8 && el; i++) {
          if (el.innerText && el.innerText.includes(`@${t}`)) {
            b.click();
            return true;
          }
          el = el.parentElement;
        }
      }
      return false;
    },
    target,
    labelRegex,
  );

/** Follow `target` from the explore screen; returns 'Following' when active. */
async function followViaExplore(page, target) {
  try {
    await page.goto(`${LIVE_URL}/explore`, { waitUntil: 'networkidle2', timeout: 60000 });
    const input = 'input[placeholder="Search people by username or name…"]';
    await page.waitForSelector(input, { timeout: 30000 });
    await page.type(input, target, { delay: 15 });
    // result row appears with @target
    await page.waitForFunction(
      t => document.body.innerText.includes(`@${t}`),
      { timeout: 30000 },
      target,
    );
  } catch (e) {
    await page.screenshot({ path: `scripts/e2e-shots/debug-explore-${target}.png` }).catch(() => {});
    const txt = await page.evaluate(() => document.body.innerText.slice(0, 600)).catch(() => '(no text)');
    console.log(`  [debug explore:${target}] ${String(e?.message || e).slice(0, 120)}\n  PAGE TEXT: ${txt}`);
    throw e;
  }
  // click the Follow button inside the row that contains @target
  const clicked = await clickRowButton(page, target, '^follow$');
  if (!clicked) {
    await page.screenshot({ path: `scripts/e2e-shots/debug-nofollow-${target}.png` }).catch(() => {});
    const dump = await page.evaluate(t => {
      const rows = [...document.querySelectorAll('div')].filter(d => d.innerText.includes(`@${t}`));
      return rows.map(r => r.innerText.replace(/\n/g, ' | ').slice(0, 200)).join('\n----\n').slice(0, 1200);
    }, target).catch(() => '(dump failed)');
    console.log(`  [debug nofollow:${target}] ${JSON.stringify(clicked)}\nROWS:\n${dump}`);
    return 'NO_FOLLOW_BUTTON';
  }
  await page.waitForFunction(
    t => /following/i.test(document.body.innerText),
    { timeout: 20000 },
    target,
  );
  return 'Following';
}

/** Open the DM via the explore row "Chat" button and send `text`. */
async function chatFromExploreAndSend(page, target, text) {
  const ok = await clickRowButton(page, target, '^chat$');
  if (!ok) {
    await page.screenshot({ path: `scripts/e2e-shots/debug-nochat-${target}.png` }).catch(() => {});
    console.log(`  [debug nochat:${target}] no CHAT button reachable`);
    return false;
  }
  try {
    await page.waitForSelector('textarea[placeholder="Message…"], input[placeholder="Message…"]', { timeout: 30000 });
  } catch (e) {
    await page.screenshot({ path: `scripts/e2e-shots/debug-nocomposer-${target}.png` }).catch(() => {});
    const dump = await page.evaluate(() => document.body.innerText.replace(/\n+/g, ' | ').slice(0, 800)).catch(() => '(no text)');
    console.log(`  [debug nocomposer:${target}] url=${page.url()}\n  TEXT: ${dump}`);
    throw e;
  }
  const sel = (await page.$('textarea[placeholder="Message…"]')) ? 'textarea[placeholder="Message…"]' : 'input[placeholder="Message…"]';
  await page.type(sel, text, { delay: 10 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(txt => document.body.innerText.includes(txt), { timeout: 20000 }, text);
  return true;
}

const run = async () => {
  // ---------- setup: two confirmed users via edge function ----------
  const a = await edgeSignup(USER_A);
  const b = await edgeSignup(USER_B);
  check('edge-signup userA', a.status === 200 && a.body?.ok === true, JSON.stringify(a.body));
  check('edge-signup userB', b.status === 200 && b.body?.ok === true, JSON.stringify(b.body));
  if (a.status !== 200 || b.status !== 200) throw new Error('setup failed');

  const browser = await puppeteer.launch({
    headless: 'shell',
    protocolTimeout: 120000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  // keep the tab snappy: block multi-MB AI model downloads the shell never uses
  const wireInterception = async page => {
    await page.setRequestInterception(true);
    page.on('request', req => {
      const u = req.url();
      if (/mlc-ai|huggingface\.co|hf\.co|webllm|models?\.(json|bin)|\.wasm($|\?)/i.test(u)) req.abort().catch(() => {});
      else req.continue().catch(() => {});
    });
  };
  /** Isolated context per user: localStorage/IndexedDB of one user
   *  must never leak into the other's session. */
  const newUserPage = async () => {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await wireInterception(page);
    return { ctx, page };
  };
  try {
    const { page: pageA } = await newUserPage();
    const { page: pageB } = await newUserPage();

    // ---------- login both ----------
    console.log('STAGE: login userA');
    await login(pageA, USER_A);
    check(`login userA lands in app (${USER_A})`, true);
    await pageA.screenshot({ path: 'scripts/e2e-shots/1-a-logged-in.png' });

    console.log('STAGE: login userB');
    await login(pageB, USER_B);
    check(`login userB lands in app (${USER_B})`, true);

    // ---------- follow: A→B then B→A ----------
    console.log('STAGE: follow A->B');
    const f1 = await followViaExplore(pageA, USER_B);
    check('userA follows userB via search', f1 === 'Following', String(f1));
    await pageA.screenshot({ path: 'scripts/e2e-shots/2-a-follows-b.png' });

    console.log('STAGE: follow B->A');
    const f2 = await followViaExplore(pageB, USER_A);
    check('userB follows userA via search', f2 === 'Following', String(f2));

    // ---------- DM round trip ----------
    console.log('STAGE: DM A->B');
    const sent = await chatFromExploreAndSend(pageA, USER_B, `hello-from-${USER_A}`);
    check('userA opens DM via Chat button and sends message', sent, 'hello-from-a');
    await pageA.screenshot({ path: 'scripts/e2e-shots/3-a-dm-sent.png' });
    const dmUrl = pageA.url();
    // The Chat action opens the conversation in client state on /direct;
    // deep links (/direct/t/:id) exist for hard navigation — both are valid.
    check('DM conversation open on a direct route', /\/direct(\/t\/|$)/.test(dmUrl), dmUrl);

    // B opens the inbox, sees the row, opens the chat
    await pageB.goto(`${LIVE_URL}/direct`, { waitUntil: 'networkidle2', timeout: 60000 });
    await pageB.waitForFunction(t => document.body.innerText.includes(`hello-from-${t}`), { timeout: 45000 }, USER_A);
    check('userB inbox shows A’s message preview (realtime/persisted)', true);
    const openOk = await pageB.evaluate(t => {
      const els = [...document.querySelectorAll('button, div[role="button"], a')].filter(n =>
        n.innerText.includes(`hello-from-${t}`),
      );
      // leaf-most match: the innermost clickable containing the marker
      const el = els.filter(n => !els.some(m => m !== n && n.contains(m))).at(-1);
      if (!el) return false;
      el.click();
      return true;
    }, USER_A);
    check('userB opens the conversation', openOk);
    await pageB.waitForFunction(t => document.body.innerText.includes(`hello-from-${t}`), { timeout: 30000 }, USER_A);
    await pageB.screenshot({ path: 'scripts/e2e-shots/4-b-sees-message.png' });

    // reply
    try {
      await pageB.waitForSelector('textarea[placeholder="Message…"], input[placeholder="Message…"]', { timeout: 20000 });
    } catch {
      await pageB.screenshot({ path: 'scripts/e2e-shots/debug-b-composer.png' }).catch(() => {});
      const dump = await pageB.evaluate(() => document.body.innerText.replace(/\n+/g, ' | ').slice(0, 700)).catch(() => '(no text)');
      console.log(`  [debug b-composer] TEXT: ${dump}`);
      throw new Error('composer not visible for B');
    }
    await pageB.type('textarea[placeholder="Message…"], input[placeholder="Message…"]', `hi-from-${USER_B}`, { delay: 10 });
    await pageB.keyboard.press('Enter');
    await pageB.waitForFunction(t => document.body.innerText.includes(`hi-from-${t}`), { timeout: 20000 }, USER_B);

    // A should receive the reply (realtime; fallback reload)
    try {
      await pageA.waitForFunction(t => document.body.innerText.includes(`hi-from-${t}`), { timeout: 12000 }, USER_B);
      check('userA receives reply in realtime', true);
    } catch {
      await pageA.reload({ waitUntil: 'networkidle2' });
      await pageA.waitForFunction(t => document.body.innerText.includes(`hi-from-${t}`), { timeout: 20000 }, USER_B);
      check('userA receives reply (after reload fallback)', true);
    }
    await pageA.screenshot({ path: 'scripts/e2e-shots/5-a-sees-reply.png' });

    // ---------- notifications: B should hold a follow item about A ----------
    await pageB.goto(`${LIVE_URL}/notifications`, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(1500);
    const notifText = await pageB.evaluate(() => document.body.innerText);
    const notifOk = notifText.includes(USER_A) && (/follow/i.test(notifText));
    check('userB notifications include follow event for userA', notifOk);
    await pageB.screenshot({ path: 'scripts/e2e-shots/6-b-notifications.png' });

    // ---------- logout B (Profile → "Log out @user" + confirm dialog) ----------
    pageB.on('dialog', d => d.accept().catch(() => {}));
    await pageB.goto(`${LIVE_URL}/profile`, { waitUntil: 'networkidle2', timeout: 60000 });
    const loggedOut = await pageB.evaluate(() => {
      const btn = [...document.querySelectorAll('[role="button"], button, div')]
        .filter(n => /^log out @/i.test(n.innerText.trim()))
        .at(-1);
      if (!btn) return false;
      btn.click();
      return true;
    });
    await sleep(3000);
    const backAtAuth = await pageB.evaluate(() => !!document.querySelector('input[type="password"]'));
    check('logout returns to the auth screen', loggedOut && backAtAuth, `clicked=${loggedOut} backAtAuth=${backAtAuth}`);
  } finally {
    await browser.close().catch(() => {});
  }
};

try {
  await run();
} catch (e) {
  check('E2E run completed without fatal error', false, String(e?.message || e));
} finally {
  await sqlCleanup([USER_A, USER_B]);
  const passed = results.filter(r => r.pass).length;
  console.log('\n----------------------------------------------------');
  console.log(`E2E Total: ${results.length}  Passed: ${passed}  Failed: ${results.length - passed}`);
  console.log('----------------------------------------------------');
  process.exit(passed === results.length ? 0 : 1);
}
