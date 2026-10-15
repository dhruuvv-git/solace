# Solace

A privacy-first Chrome extension (Manifest V3) that helps students and families in India answer four questions about what they see online — on **WhatsApp Web**, **Instagram** and ordinary websites:

| Shield | Question | What it does |
|---|---|---|
| 1 | **Is it real?** | Seven image/forward signals fused with Bayes’ rule into *Likely real* or *Likely fake*, with a high/medium/low confidence level |
| 2 | **Is it kind?** | Hurtfulness score (English, Hindi, Hinglish), Think Before You Send, Abuse Shield blur, Pattern Detector, Evidence Locker |
| 3 | **Is it really them?** | Look-alike usernames, reused profile photos (dHash), account risk model |
| 4 | **Am I safe?** | Local Safety Copilot: threat type, risk 1–25, emergency override, Do/Don’t plan, auto-saved evidence |
| + | **Train Your Eye** | Real-vs-edited image game with Elo ratings |

Everything runs **on the device** by default. No backend, no analytics. An **optional Groq AI answer** for message checks can be switched on with your own API key (see below). The “AI” is a set of documented mathematical models and rules — not a trained neural network — and every verdict shows its reasoning, its uncertainty and its limits.

---

## Quick start

**Prerequisites:** Node.js 18+ (tested with Node 22) and Google Chrome 116+.

```bash
npm install
npm run build          # production build of the extension → dist/
```

**Load it in Chrome**

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the **`dist`** folder.
4. Pin Solace from the puzzle-piece menu.
5. **Reload** any WhatsApp Web or Instagram tabs that were already open (content scripts only attach to pages loaded after install).

`npm run package` also creates `solace-extension.zip` (the contents of `dist/`).

The Solace website (landing page, account, dashboard) lives in the parent folder — see `../README.md`.

**Tests**

```bash
npm test                   # 147 unit/integration tests (Vitest, Node)
npm run typecheck          # TypeScript strict mode
# Browser tests need a Chrome/Chromium binary and the built output:
CHROME_PATH=/path/to/chrome npm run test:content                    # content scripts vs mock WhatsApp/Instagram DOM
(cd dist && python3 -m http.server 8765) & CHROME_PATH=... npm run test:browser   # side panel UI flows
```

---


## Mimi and the Solace website

- **Mimi** is the assistant: tap **Mimi** in the panel header for every feature (Home, Is it real?, Is it kind?, Is it really them?, Am I safe?, Evidence Locker, Train your eye, Settings, Open website). On WhatsApp/Instagram the floating button is “Ask Mimi”.
- **Website** button next to “In danger? 112” opens the Solace website (`../solace.config.json → appUrl`, or Settings → Website).
- **Account**: *Sign in* in the header opens the website at `#/connect`; after you log in there, Mimi is linked to the same account with a one-time code and her own revocable device token (see `src/account/account.ts`). Settings → Account shows who is signed in and signs out.
- **Connected**: the website detects Mimi, opens her, sends messages to check, links and unlinks the account (`externally_connectable`, pinned extension ID `gkjdoahaifebddccafjnenhmjcgokcdf`).
- **Download from the website**: `npm run extension:build` in the parent folder builds Mimi and publishes `public/downloads/solace-extension.zip`.

## Using each shield

Open the side panel from the toolbar icon → **Open Solace panel**, or use the right-click menu on any page.

**Is it real?**
- Right-click an image → **Check image with Solace**, or upload one in the panel, or pick a labelled sample.
- Optional: paste the caption that came with the image (it becomes the sixth signal).
- Read the verdict, the probability meter, “How each signal voted” (one bar per signal: left = toward authentic, right = toward manipulated, dashed = unavailable), and expand any signal for its heatmap, spectrum chart or metadata.
- **Forwarded message** tab: paste a forward, see the hoax-style score and copy a polite Hindi/English reply.
- **Add to my known-fakes list** stores the image fingerprint locally; you can also import a JSON list `[{"label": "...", "hash": "16 hex chars"}]`.

**Is it kind?**
- *Think before you send*: paste a draft → warning, highlighted words, a kinder template, Copy / Use as my draft / Dismiss. Solace never edits or sends.
- *Check a message you received*: add the sender name to use **Add to pattern history**.
- *Pattern Detector*: per-sender score with decay; alerts only on repeated targeting.
- On WhatsApp/Instagram (if enabled): hurtful visible messages/comments are blurred with **Reveal / Hide again**; typing warnings appear next to the message box.

**Is it really them?**
- Compare two usernames (shows normalised forms, similarity and highlighted differences).
- Compare two profile photos (dHash distance; save fingerprints of real photos).
- Review an account: fill in what you can see, or on an Instagram profile use the floating Solace button → **Review this profile** (username, photo and counts are read from the page; account age is never visible, so it stays “unknown”).

**Am I safe?**
- Paste the chat (or right-click selected text → *Am I safe?*). Optionally attach a screenshot and the sender name.
- You get the threat type, `Risk = Likelihood × Severity`, the warning signs that raised likelihood, a Do/Don’t plan and India contacts (112, 1930, cybercrime.gov.in). You can correct the detected type.
- On first use Solace asks whether to save safety checks to the Evidence Locker automatically.

**Evidence Locker** — view, verify fingerprints, export an HTML report or JSON, delete selected or all. Right-click selected text → **Save selection as evidence** captures a screenshot of the visible tab.

**Train Your Eye** — pick *Real original* or *Edited fake*; ratings update with Elo.

**Settings** — WhatsApp/Instagram on/off, blur, typing warnings, floating button, automatic pattern tracking, history, auto-save, screenshots, thresholds, extra words, optional “image access on all sites”, data deletion.

### Enabling WhatsApp and Instagram
They are on by default (Settings). The extension declares host access only for `web.whatsapp.com`, `www.instagram.com` and Instagram’s image CDNs. For right-click image checks on other sites whose images live on another server, grant **Settings → Allow image access on all sites** (optional permission, removable at any time).

### Troubleshooting
- **No Solace items in the right-click menu** — reload the extension on `chrome://extensions`; menus are created on install/startup. Image items appear only when right-clicking an image; the other four only with selected text.
- **Side panel did not open** — Chrome only allows opening it right after a click on an extension surface. Click the toolbar icon → *Open Solace panel*; the item you sent is waiting there (kept for 5 minutes).
- **Nothing happens on WhatsApp/Instagram** — reload the tab after installing/updating; check Settings toggles; the Overview tab shows which page features are active, unavailable or off.
- **“Image could not be read”** — the site serves images from another domain: allow image access on all sites, or save the image and upload it.
- **Screenshot missing from evidence** — screenshots are taken with `captureVisibleTab`, which Chrome allows after a right-click/toolbar action; evidence saved from the in-page button is saved as text only with a note unless all-sites access is granted.

---

## Architecture

```
manifest.json            MV3 manifest (copied into dist/)
sidepanel.html, popup.html
public/icons      robot logo icons (made from assets/logo-source.png)
public/samples    generated by `npm run assets` (scripts/gen-assets.ts)
src/
  shared/      types.ts, constants.ts (every coefficient, documented), messaging.ts (+ validation),
               settings.ts (chrome.storage / localStorage), idb.ts, local-data.ts
  engine/      metadata-analysis, ela-analysis, spectral-analysis (FFT), noise-analysis,
               known-fakes (dHash), misinformation, bayesian-fusion, image-analysis (orchestrator),
               image-decode + image-worker + image-client (browser codecs in a Web Worker),
               toxicity (+ data/lexicon), bullying-patterns, identity-analysis, threat-analysis
  evidence/    fingerprint.ts, evidence-store.ts (IndexedDB), report-export.ts, EvidenceLocker.tsx
  game/        elo.ts, quiz-data.ts, TrainYourEye.tsx
  shields/     real/, kind/, identity/, safety/, shared.tsx
  ui/          theme.css, components.tsx, App.tsx, Overview, SettingsView, app-context, env
  sidepanel/   side panel entry (+ job consumer)       popup/  popup entry
  background/  service-worker.ts
  content/     whatsapp.ts, instagram.ts, generic-site.ts, dom-utils.ts, parsers.ts
account/       Solace account link, sync and account UI (src/account)
tests/         Vitest suites          scripts/  build + browser test runners
```

- **Pages** (side panel, popup) are built by Vite + React. **Service worker and content scripts** are bundled by esbuild as single-file IIFEs (content scripts cannot import modules).
- **Hand-off**: the service worker writes a `pendingJob` to `chrome.storage.session`; the side panel consumes it (image bytes, selected text, saved-evidence id, profile snapshot).
- **Storage**: `chrome.storage.local` for settings/game; IndexedDB for evidence, pattern history, scan summaries and user fingerprints.
- **Isolation**: injected UI uses closed Shadow DOM; page text is only ever read as data and written with `textContent`; messages from content scripts are type/length validated; the only `innerHTML` assignment is a static SVG constant (enforced by a test).

---

## The mathematics (as implemented)

All constants are in `src/shared/constants.ts`. **None were fitted on a labelled dataset**; they are documented engineering defaults and must be calibrated before relying on the numbers.

### Shield 1 — Is it real?

| Signal | Formula | log LR mapping (clamped) | weight wᵢ |
|---|---|---|---|
| Metadata | EXIF (incl. exposure, f-number, ISO, focal length, lens, GPS presence), XMP, PNG text, C2PA Content Credentials (JPEG APP11, PNG caBX, WebP C2PA) parsed from raw bytes | AI tool, generator prompt, AI-signed C2PA or IPTC AI label +3.0; camera with ≥ 3 capture fields −2.0 (≥ 1: −1.2, make/model only −0.6, GPS −0.3 more); camera-signed C2PA −2.0; editing software +0.6; nothing 0 | 1.0 |
| ELA | E = \|I − JPEG90(I)\|, 8×8 blocks, CV = σ/μ | 1.0·(CV − 1.0), range [−0.3, 1.5]; halved for non-JPEG | 0.6 |
| Spectral slope | 256² Hann-windowed FFT, radial power, fit log P = c − α log f on f∈[4,96]; dev = \|α − 2\| | 0.8·(dev − 1.0), range [−0.3, 1.5], scaled by fit quality (R²) | 0.5 |
| Noise | R = I − blur₃ₓ₃(I), 32×32 blocks, σ(var)/μ(var) over the smoothest half of usable blocks | 0.6·(x − 3.0), range [−0.3, 1.2] | 0.6 |
| Known fake | dHash 9×8, d = popcount(h₁ ⊕ h₂), match if d ≤ 10 | 3·(1 − d/22) on match; **0 on no match** | 1.0 |
| Forward text | p = σ(β₀ + Σβⱼxⱼ) | 0.5 × logit | 0.5 |
| Size & file name | pixel size, aspect ratio, file name | AI download name +2.5; exact generator size (1024×1024, 1024×1536, 832×1216, Midjourney presets…) +1.4; square multiple of 64 +1.0; camera frame shape (4:3, 3:2, 16:9, phone screen) −0.9; camera file name (IMG_1234, PXL_…, DSC_…) −0.8; other multiples of 64 +0.5; total in [−1.5, 3] | 0.8 |

**Re-saved copies:** the JPEG quality is estimated from the luminance quantisation table (IJG scaling: S = 100·Σq/Σq_std, Q = (200−S)/2 or 5000/S). A JPEG with no camera metadata and Q ≤ 85 is treated as a messenger re-save (WhatsApp/Instagram), and the ELA and noise weights are multiplied by 0.35, because re-saving erases editing traces and phone effects (portrait blur, HDR) look like uneven noise. The panel says so in a “Re-saved copy detected” note. Thirteen public-domain test photos cropped to 4:3, resized to 1600×1200 and re-saved at quality 75 with WhatsApp file names were all called *Likely real* (P 0.28–0.47; 3 medium, 10 low confidence).

Fusion: `L = log(π/(1−π)) + Σ wᵢ·log LRᵢ`, `P = 1/(1+e^(−L))`, π = 0.5 (no base-rate data), each log LR clamped to ±3. Unavailable signals are skipped, never imputed. **Verdict is binary:** `P ≥ t` → *Likely fake*, otherwise *Likely real*, with `t = C_FP/(C_FP+C_FN) = 0.5` (equal costs; adjustable 0.2–0.8 in Settings). **Confidence** = |P − 0.5|: ≥ 0.30 high, ≥ 0.15 medium, else low — so a verdict reached on thin evidence is labelled as a weak lean.

Misinformation model: β₀ = −2.0; urgency phrases 0.9 each (max 3); capitals share ×3.0 (only with ≥ 20 Latin letters); “!” 0.35 each (max 5); no source/link 1.0. Levels: medium ≥ 0.35, high ≥ 0.65.

### Shield 2 — Is it kind?

`S = Σ wₖ·mₖ`, `Toxicity = 1 − e^(−S)`. Modifiers per match, each applied at most once and multiplied: aimed at “you” (±4 words, incl. tu/tum/tera/तुम) ×1.5, negated (3 words before: not/nahi/मत…) ×0.3, emphasis (mostly capitals or “!!”) ×1.2, and a Solace addition — reported speech or asking for help (“someone called me…”, “how do I report…”) ×0.4. Overlapping phrases are counted once (longest first). Levels: mild ≥ 0.25, hurtful ≥ 0.5, severe ≥ 0.8. The page Abuse Shield blurs hurtful and severe only.

Pattern Detector: `S_sender ← λ^Δt·S_sender + s_new`, λ = 0.8/day, alert when `S_sender > θ = 2.0`. Since s_new ≤ 1, one message never alerts. Escalation = OLS slope of severity vs days over the last ≤ 10 events (≥ 3 needed), escalating if > 0.02/day. Only events with toxicity ≥ 0.25 are recorded; duplicates are ignored via a salted message hash; sender keys are `SHA-256(salt | platform | name)`; events older than 60 days are dropped.

Evidence fingerprint: `h = SHA-256(magic ‖ len‖screenshot ‖ len‖text(NFC) ‖ len‖timestamp ‖ len‖URL)` with 8-byte big-endian lengths (`TRUSTLENS-EVIDENCE-V1`). It detects later changes to a saved record; it does not prove the content was genuine.

### Shield 3 — Is it really them?

Normalise (trim, drop “@”, NFKC, lower-case, Cyrillic/Greek homoglyphs, then rn→m, vv→w, 0→o, 1→l); `sim = 1 − Levenshtein(a,b)/max(|a|,|b|)`; flag when sim ≥ 0.85 and the raw names are not identical. Photos reuse the Shield 1 dHash (d ≤ 10).

Profile risk: `p = σ(−2.2 + 1.2·new + 0.25·min(following/(followers+1), 10) + 0.9·[posts < 3] + 2.5·asksMoneyOrOtp)`. **Missing-data policy:** an unavailable input contributes 0 and the result states how many of the 4 inputs were known.


### Abuse vs. serious threats (Am I safe?)

- **Ordinary abuse** (swearing, gaalis, insults) → “Abusive message, not a threat”: the words found, what it means, block/mute/report steps for WhatsApp and Instagram, Pattern Detector tip, two calm replies to copy. **No legal sections.**
- **Serious threats** (sextortion, threats of violence or sexual violence, stalking, scams) → **Technical analysis** (does the sender really have images, morphed/AI fakes, how they could be tracking you, what an OTP lets a scammer do, foreign vs Indian number) and **Legal options in India** with “may apply” sections: BNS 2023 §308 extortion, §351(2)/(3) criminal intimidation, §351(4) anonymous intimidation, §75 sexual harassment, §77 voyeurism, §78 stalking, §318/319 cheating; IT Act §66C/66D, §66E, §67/67A; POCSO if the target is under 18 — plus where to report (112, 1930, cybercrime.gov.in, StopNCII.org, Sanchar Saathi–Chakshu, NCW, 1098). Not legal advice.
- Detection undoes disguised spellings (f*ck, fuk, “ill fuck” → “I’ll fuck”), knows English/Hinglish/Hindi swear words, treats swearing that targets nobody as mild, and never shows sextortion or violence threats below *High*.


### Optional: Groq AI answers for messages

Settings → **AI answers (Groq)**: paste your key from console.groq.com/keys, pick a model (default `openai/gpt-oss-120b`), **Test connection**, then switch on **Let Groq answer message checks**. Chrome asks once for permission to contact `api.groq.com` (optional host permission).

- Applies to **Am I safe?** and **Is it kind?** (received messages and drafts). Groq’s answer appears first; Solace’s local analysis stays underneath and is used automatically if Groq fails (no key, offline, rate limit, bad model) — the panel says why.
- Groq must return strict JSON (category, risk, summary, why, do/don’t, technical, legal, replies, rewrite). It is validated and length-limited; **law sections are accepted only from Solace’s verified list** — anything else is dropped and counted (“1 unverified reference removed”). Legal and technical sections are removed if Groq says the message is not serious.
- Local emergency detection is never downgraded by the AI: if Solace detects immediate danger, the 112 block is shown regardless.
- Privacy: only the checked message text and Solace’s local findings are sent; images, evidence and history never are. The key is stored in this browser only. Off by default.
- Tested with a mocked Groq API (unit + browser). The live Groq service was not reachable from the build environment.

### Shield 4 — Am I safe?

`Risk = Likelihood × Severity` (1–25). Severity: abuse 2, scam 3, stalking 4, sextortion 4, physical 5. Likelihood = min(5, 1 + distinct warning signs) from: personal details known, deadline, money demanded, repeated contact (≥ 5 lines from one sender in a pasted chat, “why aren’t you replying”, or user tick), Pattern Detector rising/alert. Levels: 1–4 low, 5–9 medium, 10–16 high, 17–25 emergency; 0 = no threat found. **Emergency override:** stated presence (“I’m outside your house”, “tere ghar ke bahar khada hoon”, “घर के बाहर खड़ा हूँ”), “outside your house” together with a threat, or a time word (“tonight”, “aaj raat”, “आज रात”) together with a **physical** threat. For blackmail/scams, “tonight” counts as a deadline, not as immediate danger. Solace never calls or contacts anyone.

### Train Your Eye

`E = 1/(1 + 10^((R_img − R_user)/400))`, `R'_user = R_user + 32(S − E)`, `R'_img = R_img + 32((1−S) − (1−E))`. Next item: unseen (else least recently seen half) with rating closest to the player.

---

## Privacy

- All analysis happens in the browser (pages, Web Worker, service worker). Images and evidence are never uploaded. The only third-party request is the optional Groq call, which sends the text of a message check only when you have switched Groq answers on.
- Stored locally: settings, Evidence Locker, scan summaries (type + result only, max 100), Pattern Detector events (salted sender key, display label, time, score, salted message hash — no message text), image fingerprints you saved, game progress. Every category can be deleted in Settings; uninstalling removes all of it.
- Pages are read only for user actions or features switched on in Settings; WhatsApp is never scraped beyond messages currently rendered; nothing is sent, reported, followed or blocked automatically.
- Permissions: `contextMenus`, `storage`, `sidePanel`, `activeTab`, `scripting`; host access to WhatsApp Web, Instagram and its image CDNs; optional `<all_urls>` only for cross-site image downloads.

## Known limitations

- **Heuristics, not proof.** Signal thresholds were sanity-checked on 13 public-domain test photos (scikit-image samples, not bundled) and on the project’s own drawings; there is no labelled evaluation set, so there are no accuracy figures. Modern AI generators can pass every image signal; screenshots, messenger recompression and filters can trip them. Without metadata, the verdict often rests on the image size and shape alone and is labelled low or medium confidence; a real photo cropped to 1024×1024 will lean fake, and an AI image cropped to 4:3 will lean real.
- **dHash** is a near-duplicate detector: crops, rotations and mirroring defeat it, and on very flat images heavy recompression can push distances above 10. The bundled known-fake list is a **demonstration set of three images made for this project**, not a database of real debunked images.
- **Practice images** are procedurally drawn scenes (`scripts/gen-assets.ts`), not photos. “Real” means the untouched drawing.
- **Lexicon-based** language checks miss new slang, sarcasm, coded insults and spelling tricks, and can misread jokes or quotes. Hindi/Hinglish coverage is a starting list (editable in Settings).
- **No OCR**: screenshots are stored as evidence, but their text must be typed/pasted for analysis (no OCR engine can be bundled locally within the project’s constraints).
- **WhatsApp/Instagram markup can change** without notice. The integration anchors on `[data-pre-plain-text]`, `[data-id]`, the footer composer, `span[dir="auto"]` and the profile `header`; if these change, page blurring/typing warnings stop (the Overview shows “unavailable”) while the side panel, popup and right-click checks keep working.
- `chrome.sidePanel.open()` requires a user gesture; from in-page buttons Chrome may refuse, in which case the item waits in the panel and the page shows a hint to click the toolbar icon.

## Test report (what was actually run)

| Check | How | Result |
|---|---|---|
| TypeScript strict typecheck | `npm run typecheck` | pass |
| Engine, storage, evidence, game, parsers, message validation, manifest/permission/unsafe-code checks | `npm test` (Vitest, Node, fake IndexedDB) | 136/136 pass |
| Service worker logic (menus, image hand-off, CORS fallback error, evidence with/without screenshot, message validation, pattern opt-in, profile job) | Vitest with stubbed `chrome.*` | included above, pass |
| Production build + manifest file references | `npm run build` | pass |
| Side panel UI flows in a real browser engine (worker image analysis with real codecs, all four shields, locker verify, game, settings persistence) | `npm run test:browser`, headless Chromium 153, pages served over http | 18/18 pass |
| Content scripts against mock WhatsApp/Instagram DOMs (blur, own-message skip, live updates, typing warnings, floating menu → message, sender extraction, disabled state, foreign-extension messages ignored) | `npm run test:content`, headless Chromium | 19/19 pass |

**Not verified (no installed-extension browser or logged-in accounts were available in the build environment):**
- Loading the unpacked extension in desktop Chrome, the real context-menu → side-panel flow, `captureVisibleTab` permission behaviour, and `chrome.permissions.request`.
- Behaviour on the live `web.whatsapp.com` and `www.instagram.com` (current markup, login-gated pages, Instagram image CDN headers).

**Next steps to test on the real sites:** load `dist/` unpacked → open WhatsApp Web, open a chat, select a received message → right-click → *Is it kind?*; check that hurtful messages get the blur chip; type an insult in the composer to see the warning; right-click an image → *Check image*. On Instagram, open a post with comments and a profile page → floating button → *Review this profile*. Use the Overview tab to see which features report *active* or *unavailable*.

## Assumptions made

- “Real” vs “fake” in the game is defined on project-made drawings because no freely redistributable labelled photo set could be bundled.
- A neutral prior (π = 0.5) is used because no base rate of fake images in Indian WhatsApp forwards was available.
- Reported-speech softening (×0.4) and the 0.25 minimum severity for pattern events were added to meet “don’t flag supportive or reporting context” and “single message ≠ bullying”.
- Time words trigger the emergency override only with a physical threat; for blackmail they are treated as a deadline.
- A user-reported real WhatsApp photo scored P = 0.61 in the first build (noise σ/μ = 2.8, ELA CV = 1.26). The noise neutral point was raised from 2.0 to 3.0 and the re-saved-copy rule added; such photos now land near 0.5 (*Not sure*). After user feedback that every result was *Not sure*, the three-way verdict was replaced with a binary verdict plus confidence, metadata parsing was extended (capture settings, GPS, C2PA) and the size & file-name signal was added.
- In-page evidence capture falls back to text-only (with a note) when Chrome does not grant a screenshot.
