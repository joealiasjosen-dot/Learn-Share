# Learn&Share

Learn&Share helps students gather sources, turn them into study material with AI, and share what they know in groups.

- **Learn:** create learning spaces, add sources (files, pasted text, web addresses), and let the AI filter them for learning value. Then create a mind map, video, podcast, quiz, slide deck (PPT) or summary from the sources you pick.
- **Share:** create or join groups (ID + password), chat with text, voice recordings, audio, video and documents, and share learning spaces.
- **Settings, downloads, light/dark theme, language, and a guided tour** that walks new users through the first steps.

This package contains a Node.js server and the web app it serves. **Each student uses their own Anthropic API key** (added in Settings), so the AI is billed to them and you never pay for their usage.

> Status: this repository includes a Render Blueprint, automatic Postgres schema initialization, a production Express server, and the browser app. AI features require an Anthropic API key.

## What's in the box

```
learn-share/
  server.js               API server (Express) and static file host
  schema.sql              Postgres tables
  package.json            dependencies and start script
  .env.example            settings to copy to .env
  public/index.html       the web app (talks to the server's /api)
  standalone/
    learn-share-standalone.html   single-file version for a Claude artifact
                                  (no server: local accounts, uses the viewer's own Claude usage)
```

## Requirements

- Node.js 20.6 or newer
- PostgreSQL 13 or newer
- An SMTP account on your domain (for password-reset OTP emails)
- HTTPS in production (the login cookie is marked `secure` when `NODE_ENV=production`)
- Optional: a speech-to-text key for audio/video sources (see `TRANSCRIBE_URL`)


## Deploy on Render

The easiest deployment is **Render Blueprint**:

1. Push the contents of this folder to the **root** of your GitHub repository.
2. In Render, choose **New → Blueprint** and select the GitHub repository.
3. Render reads `render.yaml`, creates the web service and a Postgres database, and wires `DATABASE_URL` automatically.
4. The Blueprint generates `JWT_SECRET` and `KEY_ENC` automatically. Do not commit your own secrets.
5. After the first deploy, open the service's **Environment** page. If you want the server to pay for AI usage for every user, add `ANTHROPIC_API_KEY` and change `ALLOW_SERVER_KEY` to `1`. Otherwise leave `ALLOW_SERVER_KEY=0` and each user can add their own Anthropic key in Settings.
6. Open the service URL shown by Render. It will be an `https://<service-name>.onrender.com` URL.
7. Copy that URL into the README's **Live Demo** section.

Render web services receive a public `onrender.com` URL and can deploy directly from a connected GitHub repository. Free web services sleep after 15 minutes of inactivity, and free Postgres databases currently expire after 30 days, so this free setup is best for demos/testing rather than permanent production storage.

### Live Demo

**Live:** `https://learn-share.onrender.com`

## Setup

1. Install dependencies: `npm install`
2. Create the database and tables:
   ```
   createdb learnshare
   psql learnshare -f schema.sql
   ```
   Upgrading an existing database? Run the `ALTER TABLE` line in the last comment of `schema.sql`.
3. Create your settings: `cp .env.example .env`, then fill it in (table below).
4. Start: `npm start` and open `http://localhost:8080`

## Settings (`.env`)

| Variable | Required | What it is |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `JWT_SECRET` | yes | long random string used to sign login cookies |
| `KEY_ENC` | yes | 64 hex characters (`openssl rand -hex 32`) that encrypts students' API keys. If lost or changed, every student must re-enter their key |
| `CLAUDE_MODEL` | no | model name used for AI calls (default `claude-sonnet-5-5`). Check it against the current Anthropic docs |
| `SMTP_URL`, `MAIL_FROM` | for OTP email | without `SMTP_URL`, emails are only logged, not sent |
| `TRANSCRIBE_URL`, `TRANSCRIBE_KEY` | optional | OpenAI-compatible speech-to-text endpoint for audio/video sources. **Billed to you** |
| `ALLOW_SERVER_KEY` | no | `1` lets users without a key use `ANTHROPIC_API_KEY` (you pay). Keep `0` for bring-your-own-key only |
| `PORT` | no | default 8080 |

## How the AI pipeline works

1. **Upload:** file, pasted text or web address.
2. **Extract:** PDF text (scanned PDFs and images are read by the AI), DOCX, plain text, audio/video via transcription.
3. **AI learning filter:** removes content that is not useful for learning and says why. Users can override with "Keep anyway".
4. **Save:** stored in the learning space (10-character ID, user-set password).
5. **Select and configure:** the user picks sources and options (length, format, language, focus areas, and so on).
6. **Generate:** runs as a background job; the app polls until it finishes. Results: mind map, video storyboard with a built-in player, podcast script with a built-in audio player, quiz and PPT shown as slides, summary in a small window.

## API overview

All routes are under `/api` and use a login cookie. Space routes also need the `x-space-token` header returned by unlocking the space.

| Area | Routes |
|---|---|
| Account | `POST /auth/signup`, `/auth/login`, `/auth/logout`, `/auth/otp`, `/auth/reset`; `GET/PUT /me`; `PUT/DELETE /me/key` |
| Spaces | `POST/GET /spaces`; `POST /spaces/:id/unlock`; `POST/GET /spaces/:id/sources`; `POST .../sources/:sid/keep`; `DELETE .../sources/:sid`; `POST /spaces/:id/generate`; `GET /jobs/:id`; `GET/DELETE .../outputs` |
| Groups | `POST/GET /groups`; `POST /groups/join`; `GET/POST /groups/:id/messages`; `GET /messages/:id/file` |
| Utilities | `GET /fetch-url?url=`; `POST /transcribe`; `GET /health` |

## Test it in this order

1. Sign up, then confirm the OTP email arrives (Forgot password).
2. Add your own API key in Settings; it should say "saved (ends in ....)".
3. Create a space, add a short text source, and create a summary.
4. Try a PDF, then an image, then (if configured) an audio file.
5. With two accounts, create a group, join it, and send text, a file, and a shared space.

## Known limits

- Google, Microsoft and GitHub sign-in are not implemented (the buttons show a notice).
- Group chat checks for new messages every 3 seconds; it is not instant.
- The podcast and video narration use the browser's text-to-speech voices. The downloadable video has pictures and captions but no sound.
- Video and PPT illustrations are simple AI-drawn SVG pictures, not photos.
- PPTX and XLSX files cannot be used as sources; convert them to PDF first.
- Email address cannot be changed from Settings.
- The downloads list lives in each person's browser, so it is not shared across devices.
- No rate limiting, antivirus scanning of uploads, or S3 storage yet (chat files are stored in Postgres, 50 MB max per upload).
- Audio/video transcription and sign-up/OTP requests are not limited per user, so add limits before going public.

## Security notes

- Passwords and space/group passwords are hashed with bcrypt. API keys are encrypted with AES-256-GCM and never sent back to the browser.
- Web address fetching blocks private network addresses and redirects.
- Keep `.env` out of version control (`.gitignore` already excludes it).

## Standalone version

`standalone/learn-share-standalone.html` is the single-file build used as a Claude artifact. It needs no server, but accounts live only in the browser, the AI runs on the viewer's own Claude usage, and web fetching, OTP email, audio/video transcription and the microphone are unavailable.
