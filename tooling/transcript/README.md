# transcript

Pulls the French auto-generated captions of a Trading Desk training (#431) into
`transcripts/<date>-<title>.md` and adds a row to [`transcription.md`](transcription.md), the index
of the trainings the pattern sheets and notes are drawn from.

Your portal credentials go in `tooling/.env` (gitignored — copy `.env.example`). The commands run
from the repo root :

```bash
npm --prefix tooling install
```

```bash
npm --prefix tooling run transcript
```

Run bare, it asks for the post's URL, the training's date (today by default) and its title — the
page's heading is often just the site's name. They can be given
on the command line too — quote the URL, its `?` and `&` mean something to the shell :
`npm --prefix tooling run transcript -- "<post URL>" --date 2026-09-21`.

- `--date` defaults to today, `--title` to the post's heading.
- A post already pulled is skipped ; `--force` pulls it again into the same file.
- The session is kept in a Chromium profile, `~/.local/share/trade-transcript/profile`
  (`TRANSCRIPT_PROFILE` overrides it) ; when the portal asks to sign in again, the tool does it
  from `.env`. Without credentials, or when the portal wants a security code, `--login` opens the
  sign-in page to do it by hand.
- `--headed` shows the browser, to see what the page does when no caption track is found.
