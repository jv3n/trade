#!/usr/bin/env node
// Pulls the auto-generated caption track of a Trading Desk training into `transcripts/` and lists
// it in `transcription.md` (#431). The cues are read from the page (`video.textTracks`) : the
// track's `src` is a blob and the media sits behind a short-lived token. The session lives in a
// persistent Chromium profile, signed in from `tooling/.env` whenever the portal asks again.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));

const SITE = 'https://thetradingdesk.app.clientclub.net/';
const OUT_DIR = join(HERE, 'transcripts');
const INDEX = join(HERE, 'transcription.md');
const PROFILE =
  process.env.TRANSCRIPT_PROFILE ?? join(homedir(), '.local/share/trade-transcript/profile');
/** From `tooling/.env` (gitignored) — read here only to fill the sign-in form, never printed. */
const EMAIL = process.env.TRADING_DESK_EMAIL;
const PASSWORD = process.env.TRADING_DESK_PASSWORD;
/** Long enough for the SPA to sign in, load the post and initialise the player. */
const PLAYER_TIMEOUT_MS = 45_000;
/** One paragraph per minute of video : enough to find the passage, short enough to read. */
const PARAGRAPH_SECONDS = 60;

class UsageError extends Error {}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      login: { type: 'boolean', default: false },
      date: { type: 'string' },
      title: { type: 'string' },
      force: { type: 'boolean', default: false },
      headed: { type: 'boolean', default: false },
    },
  });

  if (values.login) return login();

  // Run bare (a click on the README's command), the tool asks for what the command line lacks.
  const asked = positionals[0]
    ? {}
    : await ask({ date: values.date === undefined, title: values.title === undefined });
  const url = positionals[0] ?? asked.url;
  const postId = url?.match(/\/posts\/([\w-]+)/)?.[1];
  if (!postId)
    throw new UsageError(
      'Usage : npm --prefix tooling run transcript -- "<post-url>" [--date YYYY-MM-DD] [--title "…"] [--force] [--headed]',
    );
  const date = values.date ?? (asked.date || localDate(new Date()));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new UsageError(`--date must be YYYY-MM-DD, got « ${date} ».`);

  const existing = findTranscript(postId);
  // The index counts too : a transcript added by hand (the 2026-09-14 one) has no post id inside.
  if ((existing || readFileSync(INDEX, 'utf8').includes(postId)) && !values.force) {
    console.log('Already pulled — nothing written (--force to pull it again).');
    return;
  }

  const training = await readCaptions(url, values.headed);
  // The page's own heading is often the site's name : a title typed in wins over it.
  const title = values.title ?? (asked.title || training.title);
  const file = existing ?? `${date}-${slug(title)}.md`;

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, file), render({ ...training, title, url, postId }));
  addToIndex({ date, title, url, postId, file });
  console.log(
    `Wrote transcripts/${file} — ${training.cues.length} cues, ${clock(training.duration)}.`,
  );
}

async function ask(wanted) {
  if (!process.stdin.isTTY) return {};
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  // Ctrl-D closes the input mid-question : an empty answer, then the usage message.
  const question = (text) =>
    prompt.question(text).then(
      (a) => a.trim(),
      () => '',
    );
  try {
    const url = await question('Post URL : ');
    if (!url) return {};
    const date = wanted.date ? await question(`Training date [${localDate(new Date())}] : `) : '';
    const title = wanted.title ? await question('Title [the page heading] : ') : '';
    return { url, date, title };
  } finally {
    prompt.close();
  }
}

/** Opens the site in the tool's profile and waits for the window to be closed. */
async function login() {
  const context = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(SITE);
  console.log('Sign in in the browser window, then close it.');
  await new Promise((done) => context.on('close', done));
}

async function readCaptions(url, headed) {
  const context = await chromium.launchPersistentContext(PROFILE, {
    headless: !headed,
  });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(url);
    let outcome = await playerOrLogin(page);
    if (outcome === 'login') {
      await signIn(page);
      await page.goto(url);
      outcome = await playerOrLogin(page);
    }
    if (outcome === 'login')
      throw new UsageError(
        'Still on the sign-in page after signing in — run `npm --prefix tooling run transcript -- --login` to see why.',
      );
    if (outcome === 'none')
      throw new UsageError(
        (await page.locator('video').count()) > 0
          ? 'The video has no caption track — the platform did not generate one for it (older trainings have none). Nothing written.'
          : 'No video on this page — nothing written. Check the URL, or retry with --headed.',
      );

    const captured = await page.evaluate(async () => {
      const video = [...document.querySelectorAll('video')].find((v) => v.textTracks.length > 0);
      const tracks = [...video.textTracks];
      const track =
        tracks.find((t) => t.kind === 'captions' || t.kind === 'subtitles') ?? tracks[0];
      // A disabled track is never loaded : 'hidden' makes the browser fetch and parse its cues.
      track.mode = 'hidden';
      for (let i = 0; i < 100 && !track.cues?.length; i++)
        await new Promise((r) => setTimeout(r, 200));
      return {
        label: track.label,
        heading: document.querySelector('h1')?.textContent?.trim() || document.title,
        duration: video.duration,
        cues: [...(track.cues ?? [])].map((c) => ({
          start: c.startTime,
          text: c.text,
        })),
      };
    });
    if (captured.cues.length === 0)
      throw new UsageError('The caption track is empty — nothing written.');

    const lastStart = captured.cues.at(-1).start;
    return {
      title: captured.heading,
      label: captured.label || 'captions',
      duration: Number.isFinite(captured.duration) ? captured.duration : lastStart,
      cues: captured.cues,
    };
  } finally {
    await context.close();
  }
}

/**
 * Whichever comes first : the player with its caption track, or the portal's redirect to `/login`
 * once the profile's session is gone. Waiting on both keeps a signed-in run instant.
 */
async function playerOrLogin(page) {
  const player = page
    .waitForFunction(
      () => [...document.querySelectorAll('video')].some((v) => v.textTracks.length > 0),
      null,
      { timeout: PLAYER_TIMEOUT_MS },
    )
    .then(() => 'player');
  const login = page.waitForURL(/\/login/, { timeout: PLAYER_TIMEOUT_MS }).then(() => 'login');
  return Promise.any([player, login]).catch(() => 'none');
}

/** Fills the portal's sign-in form from `.env` ; the session then stays in the profile. */
async function signIn(page) {
  if (!EMAIL || !PASSWORD)
    throw new UsageError(
      'The profile is not signed in : set TRADING_DESK_EMAIL and TRADING_DESK_PASSWORD in tooling/.env, or run `npm --prefix tooling run transcript -- --login`.',
    );
  await page.locator('input[type=text], input[type=email]').first().fill(EMAIL);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('#login--button').click();
  try {
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 });
  } catch {
    throw new UsageError(
      'Sign-in failed — check the credentials in tooling/.env. If the portal asks for a security code, run `npm --prefix tooling run transcript -- --login` once.',
    );
  }
}

function render({ title, url, postId, label, duration, cues }) {
  const paragraphs = [];
  let current = null;
  let previous = '';
  for (const cue of cues) {
    const text = cue.text
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    // Auto-generated tracks repeat a line across consecutive cues.
    if (!text || text === previous) continue;
    previous = text;
    if (!current || cue.start - current.start >= PARAGRAPH_SECONDS) {
      current = { start: cue.start, lines: [] };
      paragraphs.push(current);
    }
    current.lines.push(text);
  }
  return [
    `# ${title}`,
    '',
    `*Source : ${url} — ${clock(duration)}, ${cues.length} cues, ${label}. Post \`${postId}\`.*`,
    '',
    ...paragraphs.map((p) => `[${clock(p.start)}] ${p.lines.join(' ')}\n`),
  ].join('\n');
}

/** The file already holding this post, if any — the post id is written in its source line. */
function findTranscript(postId) {
  if (!existsSync(OUT_DIR)) return null;
  return (
    readdirSync(OUT_DIR).find(
      (f) => f.endsWith('.md') && readFileSync(join(OUT_DIR, f), 'utf8').includes(postId),
    ) ?? null
  );
}

function addToIndex({ date, title, url, postId, file }) {
  const index = readFileSync(INDEX, 'utf8');
  if (index.includes(postId)) return;
  const row = `| ${date} | ${title.replace(/\|/g, '\\|')} | [The Trading Desk](${url}) | [${file}](transcripts/${file}) |`;
  writeFileSync(INDEX, `${index.trimEnd()}\n${row}\n`);
}

function slug(text) {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60)
      .replace(/-$/, '') || 'training'
  );
}

/** `02:09`, or `1:08:27` past the hour. */
function clock(seconds) {
  const s = Math.floor(seconds);
  const [h, m, sec] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
  const mmss = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return h > 0 ? `${h}:${mmss}` : mmss;
}

function localDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

main().catch((error) => {
  console.error(error instanceof UsageError ? error.message : error);
  process.exit(1);
});
