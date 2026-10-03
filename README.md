# Learn&Share

A single-file, mobile-friendly web app for turning your study material into learning aids and sharing it with others. Add sources (documents, text, audio), then generate a **summary, mind map, quiz, podcast, video or slide deck** from them, and collaborate through password-protected **Spaces** and **Groups**.

Everything lives in one `index.html`: no build step, no framework, no package manager.

---

## Features

| Area | What it does |
|---|---|
| **Learn** | Create *Spaces*, add sources, and generate study outputs from them |
| **Sources** | Upload PDF and Word (`.docx`) files, paste text, or add audio; text is extracted in the browser |
| **Summary** | Condensed notes, exportable as Markdown |
| **Mind map** | Up to 4 levels deep, rendered as SVG and exportable as Markdown |
| **Quiz** | Easy / Medium / Hard, 5–50 questions, instant per-answer feedback with explanations |
| **Podcast** | Review, Revision, Research or Debate formats with 1–4 voices, read aloud with the browser's speech synthesis |
| **Video** | Scene-by-scene illustrated video with narration; can be recorded and downloaded as `.webm` |
| **PPT** | Slide decks (Few / Default / More) exported as `.pptx` |
| **Share** | Password-protected Spaces with a shareable ID, plus Groups with chat and voice messages |
| **Downloads** | Everything you export is kept in an in-app Downloads list |
| **Settings** | 12 interface/output languages (English, Tamil, Hindi, Telugu, Malayalam, Kannada, Spanish, French, German, Arabic, Chinese, Japanese) and light / dark / system theme |
| **Accounts** | Sign up / log in, with a "forgot password" OTP flow |

## Tech stack

- Plain HTML, CSS and vanilla JavaScript (single file)
- [Mammoth.js](https://github.com/mwilliamson/mammoth.js) 1.6.0: read `.docx`
- [PDF.js](https://mozilla.github.io/pdf.js/) 3.11.174: read PDFs
- [PptxGenJS](https://gitbrent.github.io/PptxGenJS/) 3.12.0: build `.pptx`
- Browser APIs: Web Speech (`speechSynthesis`), `MediaRecorder`, Web Crypto (SHA-256), `localStorage`

The three libraries are loaded from the cdnjs CDN, so an internet connection is needed on first load.

## Getting started

### Run locally

```bash
git clone https://github.com/<your-username>/Learn-Share.git
cd Learn-Share

# Option 1: just open the file
open index.html          # macOS (use xdg-open on Linux, or double-click on Windows)

# Option 2: serve it (recommended: microphone access needs http://localhost or https)
python3 -m http.server 8000
# then visit http://localhost:8000
```

### Deploy with GitHub Pages

1. Push this repository to GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, and save.
4. After a minute your site is live at `https://<your-username>.github.io/Learn-Share/`.

## Important: AI features and runtime dependencies

Learn&Share was built to run inside the Claude artifact runtime, and a few features rely on services it provides through `window.claude`:

| Feature | Needs | Behaviour on plain static hosting (e.g. GitHub Pages) |
|---|---|---|
| Generating summaries, mind maps, quizzes, podcasts, videos, slides | `window.claude.use('sample')` (AI generation) | Not available; the app shows *"AI is not available in this view"* |
| Cross-device sync | `window.claude.use('db')` | Skipped; data stays in the browser's `localStorage` |
| Saving exports to the host's downloads | `window.claude.use('downloads')` | Skipped; files still appear in the in-app Downloads list |
| Accounts / OTP email | An optional backend, enabled by adding `<meta name="backend">` to the page | Falls back to local-only accounts; the OTP is shown on screen as a demo |

Everything else (UI, sources, Spaces, local storage, quiz/mind-map/slide rendering, text-to-speech, exports) works as a plain static site.

**To get AI generation working outside the Claude runtime**, replace the `ai(p)` function in `index.html` with a call to your own backend or LLM API. Do **not** put an API key directly in client-side code; route requests through a small server or serverless function. The function receives a prompt and must return parsed JSON matching the schemas in the `SCH` object.

## Data and privacy

- App state (Spaces, Groups, settings, Downloads) is stored in your browser's `localStorage`.
- Space passwords are stored as SHA-256 hashes, not plain text. Note this is a convenience gate for a client-side app, not strong security.
- Uploaded documents are parsed locally in your browser. Content sent for AI generation goes wherever you configure `ai()` to send it.
- Clearing site data removes your local content.

## Project structure

```
Learn-Share/
├── index.html     # the entire app (HTML + CSS + JS)
├── README.md
├── LICENSE
├── .gitignore
└── .nojekyll      # tells GitHub Pages to serve files as-is
```

## Roadmap ideas

- Pluggable AI provider settings (bring your own endpoint)
- Real-time backend for Groups and chat
- Offline support via a service worker
- Splitting CSS/JS into separate files

## Contributing

Issues and pull requests are welcome. Please keep changes focused, and test in both light and dark themes and on a narrow mobile viewport.

## License

Released under the [MIT License](LICENSE).
