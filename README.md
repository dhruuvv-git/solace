# Solace

> **Rapid incident response for non-consensual synthetic media, impersonation and harassment — a website workspace plus Mimi, the browser extension, on one account.**

Solace is a privacy-first incident triage and evidence-preservation workspace for the critical "golden hour" after digital extortion or synthetic-media discovery. **Mimi** is its Chrome extension: she checks images, messages and profiles inside WhatsApp Web and Instagram.

| Part | Folder | Stack |
|---|---|---|
| Website (landing, sign-in, onboarding, dashboard) | `src/`, `public/` | React 19 + Vite 8 + Tailwind 4 |
| API (accounts, sessions, extension link) | `server/` | Node 20+ built-ins only (`node:http`, `node:crypto`) |
| Mimi extension (Manifest V3) | `extension/` | React 18 + TypeScript + esbuild/Vite |
| Shared design tokens | `shared/design/solace-tokens.css` | CSS custom properties, extracted from the landing page |
| Shared config | `solace.config.json` | App URL, API port, extension ID + key |

---

## Run it locally

Requirements: **Node.js 20 or newer** and Chrome / Edge / Brave on a computer.

```bash
npm install                 # website + API (the API has no extra dependencies)
npm run extension:install   # Mimi's dependencies (once)
npm run extension:build     # builds Mimi → extension/dist and publishes the download ZIP
npm run dev                 # API on :8787 + website on http://localhost:5173
```

Open **http://localhost:5173**. Use `localhost` (or `127.0.0.1`) — Mimi only talks to the origins listed in `solace.config.json`.

### Load Mimi in Chrome

1. Go to `chrome://extensions` and remove any older TrustLens / Mimi.
2. Turn on **Developer mode** (top right).
3. **Load unpacked** → choose `extension/dist` (or unzip `public/downloads/solace-extension.zip` and choose that folder — the one with `manifest.json` inside).
4. Check it says **version 2.0.0**, ID `gkjdoahaifebddccafjnenhmjcgokcdf`. Pin it from the puzzle icon.
5. Reload the website. The dashboard pill says **Mimi installed · connect** → open **Mimi Extension** → **Connect Mimi to this account**.

You can also sign in from Mimi: click **Sign in** in her header → the website opens at `#/connect`, you log in, and Mimi is linked automatically.

### Production

```bash
npm run build                       # website → dist/
SOLACE_APP_ORIGINS=https://your-domain npm start   # API + serves dist/ on PORT (default 8787)
```

Put it behind HTTPS (the session cookie becomes `Secure` automatically when `X-Forwarded-Proto: https` is set, or set `SOLACE_COOKIE_SECURE=1`). For a live domain also edit `solace.config.json` → `appUrl` and add `https://your-domain/*` to `appOrigins`, then rebuild the extension so Chrome lets that site talk to Mimi.

### Environment variables (all optional locally)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` (`apiPort` in config) | API port |
| `HOST` | `127.0.0.1` | Bind address (`0.0.0.0` behind a proxy) |
| `SOLACE_DB_FILE` | `server/data/solace-db.json` | Where accounts are stored (git-ignored) |
| `SOLACE_APP_ORIGINS` | localhost/127.0.0.1, any port | Exact website origins allowed to call the API — **set this in production** |
| `SOLACE_EXTENSION_IDS` | `extensionId` from config | Extension origins allowed by CORS |
| `SOLACE_COOKIE_SECURE` | off | Force the `Secure` cookie flag |

No secrets are needed: there is no third-party auth provider and no API key in the code. Mimi's optional Groq key is entered by the user and stays in their browser.

---

## The user journey

**Landing → Sign up / Log in → Onboarding (first time) → Dashboard → Mimi linked to the same account.**

- **Landing** — your friend's page, unchanged in look. *Get Started* / *Start your case* open sign-up (or the dashboard when signed in); *Sign In* opens log-in; the navbar shows **Dashboard** with your initial when signed in.
- **Sign up / Log in** — the same two-column modal, now real: field validation (client and server), password show/hide, loading state that blocks double submits, "email already has an account → Log in instead", generic "email and password don't match", rate limiting, Escape / focus trap.
- **Onboarding** — *What brings you to Solace?* (6 options) → *When did you find it?* (starts the golden-hour clock, optional) → *Add Mimi to your browser* (live install status + download). Saved to the account; returning users skip it.
- **Dashboard** — protected; signed-out visitors are sent to log in and returned afterwards (`?next=`). Session survives refresh; an expired session shows "Your session expired. Please log in again."

## Authentication architecture

```
Browser (website)  ──cookie: solace_session (HttpOnly, SameSite=Lax)──▶  Solace API  ◀──Bearer device token──  Mimi (service worker / panel)
        │                                                                  ▲
        └── chrome.runtime.sendMessage(EXT_ID, {TL_LINK, code}) ──▶ Mimi ──┘  POST /api/extension/exchange
```

- **Passwords**: scrypt (N=2¹⁵, r=8, p=1) with a random salt, constant-time compare, equal timing for unknown emails. Never stored or logged in plain text.
- **Website sessions**: 32-byte random token in an HttpOnly, SameSite=Lax cookie; only its SHA-256 is stored. 7-day idle / 30-day absolute expiry. State-changing requests must be JSON and come from an allowed Origin (CSRF).
- **Linking Mimi**: the signed-in website asks for a **one-time link code** (valid 2 minutes, single use) and hands it to Mimi through Chrome's `externally_connectable` channel (only the origins in `solace.config.json`). Mimi's service worker swaps it for its **own device token** (30 days, revocable, hashed on the server) and keeps it in `chrome.storage.local`, which web pages and content scripts cannot read. The website never sees the device token; the extension never sees the cookie.
- **Signing out**: website sign-out deletes the session, revokes any Mimi linked from it and tells Mimi (`TL_UNLINK`). Mimi's own *Sign out* revokes its token. *Account → Linked devices* signs out any Mimi remotely. Any 401 puts Mimi in a visible **"Your session ended — Sign in again"** state.
- **Shared data**: Mimi's on/off settings (WhatsApp, Instagram, Abuse Shield, typing warnings, Pattern Detector, thresholds, custom words…) are stored per account and edited from either side. The account wins on link; local changes push within ~1 s. **Never synced:** the Groq API key, evidence, chat text, patterns, history — those stay on the device.
- **What needs an account**: the website workspace and settings sync. Mimi's safety checks keep working without an account — a person in crisis should never hit a login wall.

## What changed (and why)

**Website**
- `src/lib/` (new): `api.js` (API client), `auth.jsx` (session state), `router.js` (hash routes + safe `next`), `mimi.js` (extension bridge), `vault.js` (per-account IndexedDB evidence fingerprints), `concerns.js`.
- `src/components/AuthModal.jsx`: same design, real auth (the old modal called `onSuccess` with a hard-coded name). The Google/Facebook buttons were removed: they also just faked success, and real OAuth needs client IDs you'd have to register.
- `src/components/DashboardView.jsx`: same layout and styling, now real data —
  - the vault hashes and persists your files (the two sample "sealed" files were hard-coded), adds *Verify file*, delete and JSON export;
  - the golden-hour timer counts from your actual discovery time (it was a fixed "48 mins");
  - the takedown clock runs from when you mark the notice as sent;
  - the fabricated "+94.6% takedown probability" and "Court admissibility 100%" figures were removed;
  - **legal deadlines corrected** to the IT Amendment Rules 2026 (G.S.R. 120(E), in force 20 Feb 2026): Rule 3(2)(b) **2 hours** for intimate / morphed content, Rule 3(1)(d) **3 hours** for court / government orders (was shown as 24 h), grievances **7 days** (was shown as 36 h); sources linked in the page;
  - notices now insert your real evidence fingerprint (the old one used the hash of an empty file) and avoid over-claiming liability;
  - new **Mimi Extension** and **Account** tabs, plus a mobile drawer;
  - **Incident Report** tab (replaces Platform Notices): a 4-step guided builder — describe what happened, add photos/screenshots (each SHA-256 fingerprinted, optionally sealed in the vault), add your details, then print / save as PDF, copy or download a formal complaint for the police station, cyber cell or cybercrime.gov.in (`src/components/ReportBuilder.jsx`, `src/lib/report.js`). Draft text is kept in localStorage; photos stay in the tab;
  - dashboard switched to a light (white / lavender) theme in the same violet palette.
- `src/components/OnboardingView.jsx`, `MimiPanel.jsx`, `AccountPanel.jsx`, `Toaster.jsx` (new).
- `src/index.css`: the CSS reset now sits in Tailwind's base layer — unlayered, it was zeroing every `p-*`, `gap-*`, `m-*` utility, so the dashboard had no padding at all.
- `src/styles/solace-ui.css` (new): buttons, inputs, alerts, toasts, modal motion, focus rings, reduced-motion, and a responsive layer for the landing page (navbar links collapse, 2/4-column grids stack) that leaves the desktop design untouched.
- `App.jsx`, `Navbar.jsx`: routing, guards, signed-in navbar; `HeroSection`, `NotAloneSection`, `SolutionSection`: class names only (for responsiveness).

**Server** (`server/`, new): `app.mjs`, `security.mjs`, `store.mjs`, `index.mjs`, `app.test.mjs`.

**Extension** (`extension/`)
- Renamed TrustLens → **Solace** everywhere users can see it (v2.0.0). Storage keys and DOM ids kept, so existing evidence and settings survive the update.
- Theme rebuilt on the shared tokens: night background with the hero's cyan/magenta glow, Inter, gradient pill primary buttons, purple focus rings, glass cards; WhatsApp/Instagram overlays recoloured to match.
- `src/account/` (new): link / refresh / sync / sign-out logic and the header chip + Settings/popup account card.
- `messaging.ts` + `service-worker.ts`: `TL_LINK`, `TL_UNLINK`, account in `TL_HELLO`, debounced settings push. **Unchanged:** permissions, host permissions, content scripts, context menus, CSP, all analysis code.
- Removed the old TrustLens landing page and HAVEN glue (replaced by this website). `npm run package` now uses a cross-platform Node zipper (no `zip` binary needed on Windows).

## Preserved functionality

- **Landing page:** hero (Aurora, BlurText, CTAs), *The Reality* section (DriftWall), *Response Protocol* section (TextType, 4 steps), footer, smooth-scroll navbar.
- **Dashboard:** five original tabs, SHA-256 sealing via Web Crypto, copy hash, copy notice, protocol cards, helplines (1930, cybercrime.gov.in; 112 added).
- **Mimi:**
  - all four shields, Train Your Eye, Evidence Locker, Groq answers;
  - right-click menus, side panel, popup;
  - WhatsApp Web / Instagram blur, composer warnings, *Ask Mimi* button;
  - website *Open Mimi* / *Ask Mimi*, Pattern Detector, settings.

## Tests (run on this build)

| Command | What | Result |
|---|---|---|
| `npm run test:api` | 12 API tests: signup/validation, hashing, duplicate, generic errors, rate limit, CSRF, onboarding/incident, link code → device token, single-use codes, settings sync whitelist, sign-out revokes Mimi, device revoke, CORS, delete account | **12/12 pass** |
| `npm run test:web` | 22-step journey in real Chromium **with Mimi loaded**: landing nav, sign-up validation, real account + HttpOnly cookie, onboarding, dashboard, refresh persistence, protected routes, vault hash = Node SHA-256, incident report (photo + vault fingerprints)/deadlines, link Mimi, Mimi panel shows account, two-way settings sync, sign-out signs Mimi out, wrong/right password, duplicate account, sign-in from Mimi → auto-link, device revoke → Mimi "session ended", stale cookie → "session expired", popup, 390 px layouts, no page errors | **22/22 pass** |
| `npm run extension:test` | 147 unit tests (engines, service worker, account link/sync/expiry, manifest/permission guards) | **147/147 pass** |
| `extension/scripts/e2e-browser.mjs` | 18 side-panel UI checks | **18/18 pass** |
| `extension/scripts/e2e-content.mjs` | 19 WhatsApp/Instagram content-script checks on DOM fixtures | **19/19 pass** |
| `npm run build`, `npm run extension:build`, `tsc --noEmit` | builds + typecheck | pass |

`npm run test:web` needs `npm run build` and `npm run extension:build` first, and a Chromium binary (`CHROME_PATH=...`).

## Not verified here — please check

- **Live WhatsApp Web and Instagram**: content scripts are tested on copies of their page structure, not the live sites (which change without notice).
- **Your desktop Chrome**: the extension was tested in headless Chromium 141, not an installed desktop Chrome.
- **Deployed domain / HTTPS**: only localhost was run.
- **Groq**: the API is mocked in tests.
- **Legal text**: deadlines follow secondary sources on the 2026 amendment (linked in the dashboard); check the official gazette text before relying on it. Solace is not a lawyer.
- **Scale**: the JSON-file store is for demos and small pilots; swap `server/store.mjs` for Postgres or SQLite before real users.
- **Not built**: email verification, password reset and Google/Facebook login — each needs an email or OAuth provider account.

## Security & privacy

- Evidence files are hashed in the browser and never uploaded. The server stores names, emails, password hashes, session/device token hashes, onboarding answers, incident timestamps and Mimi's on/off settings — nothing else.
- Emergency help is always one tap away: *In danger? 112* in Mimi and the dashboard. 1930 is the cyber-crime helpline, and NALSA 15100 gives free legal aid.
