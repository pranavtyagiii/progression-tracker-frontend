# Progression Tracker -- Frontend

A standalone React app (built with Vite) that talks to the backend API.
This replaces the old Claude-artifact version -- same product, same features,
but now a real deployable web app with a real login screen instead of the
"pick your name" system.

## Setup

```bash
npm install
cp .env.example .env
# edit .env: set VITE_API_URL to wherever the backend is running
npm run dev      # local development, hot-reloading, http://localhost:5173
npm run build    # production build -> dist/
npm run preview  # serve the production build locally to sanity-check it
```

The backend must be running and reachable at whatever `VITE_API_URL` points
to -- see the backend's own README for getting that running first.

## Deploying it

`npm run build` produces a `dist/` folder of static files (HTML, CSS, JS) --
no Node server needed to serve them. Any static host works:
- **Vercel / Netlify**: connect the repo, they auto-detect Vite, done.
- **Your own portal's existing infrastructure**: `dist/` can be served by
  nginx, or dropped into any static file host you already run.

The one thing to set in whichever hosting platform you use: the
`VITE_API_URL` environment variable, pointed at your deployed backend's URL
(not `localhost` anymore, once both are actually deployed).

## What changed from the artifact version

- **Real login** (`src/components/Login.jsx`, `src/AuthContext.jsx`)
  instead of the old name-picker. Every screen now knows who's actually
  logged in via a real session token, checked against the backend.
- **`src/api.js`** replaces every `window.storage` call from the old
  version -- all data now goes through the backend's REST API.
- **`src/shared.js`** is the domain logic -- the 2x2 Matrix, QC quality
  scoring, due-date tracking, week math -- copied over unchanged from the
  product you already have. This is the part that makes the tool the tool;
  none of that logic changed, only where the data comes from.
- **AI drafting** ("Draft with AI" on the session forms) now calls the
  backend's `/api/ai/draft` proxy instead of Anthropic's API directly --
  the old version could only do that inside Claude's own sandboxed
  environment. Your tech team needs to set `ANTHROPIC_API_KEY` on the
  backend for this feature to work; without it, the button still appears
  but returns a clear "not configured yet" message instead of failing
  silently.

## A known limitation, honestly stated

Live microphone transcription (the "Start listening" button next to Draft
with AI) depends on the browser's own Speech Recognition API, which is
solid in Chrome and inconsistent-to-absent in Safari and Firefox. That's a
browser limitation, not something fixable in this codebase -- the feature
degrades gracefully (typing/pasting notes still works with Draft with AI)
where it isn't supported.
