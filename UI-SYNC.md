# UI sync: the 予舍 studio look on I Renovation

Technical record of moving the interface style and home-page layout of the 予舍 studio site
(`3dgongfang/studio/web`) onto this site, and of the fixes made after review.
State as of 2026-11-07. Nothing here is committed; this folder is not a git repository.

## 1. Goal and boundaries

- This site leads; the studio site supplies its look. The supervisor's decision, recorded in
  `3dgongfang/WORKFLOW.md` §11.
- **Changed:** colours, fonts, the header, the home page, and inline colours on the inner pages.
- **Not changed:** business logic, the API routes, the database, the agents, the bidding flow
  (kept as built, by the owner's decision), and the packages. No dependency was added.
- **Later change:** after the UI sync, the demo login was replaced by real login and API
  permissions, which did change routes and pages. That work is described in `AUTH.md`; this
  document covers only the UI sync.
- **Backup of the original:** `D:\chatgpt\new3d\junction-main-backup-2026-11-07`.

## 2. How the theme works

The original pages use CSS variables everywhere (`--bg-deep`, `--accent`, `--text`, …).
The theme keeps **every variable name and every selector** and only changes their values,
so no component had to be rewritten. All styling is in `apps/web/app/globals.css`.

| Token | Value | Use |
|---|---|---|
| `--bg-deep` | `#f4f1eb` | page background (cream) |
| `--bg-panel`, `--bg-card` | `#fffdfa` | panels, cards |
| `--accent` | `#3c584b` | brand green: buttons, links, active states |
| `--accent2` | `#8b7959` | deep gold: labels, kickers |
| `--accent3` | `#17724a` | done / ok |
| `--accent-warn`, `--accent-danger` | `#8a5a00`, `#b3261e` | warnings, errors |
| `--text`, `--text-dim` | `#282d29`, `#6d746e` | body text, secondary text |
| `--border`, `--border-strong` | `#e3dfd6`, `#d3cfc4` | lines |
| `--chrome` *(new)* | `#263b32` | top bar and dark bands |
| `--gold` *(new)* | `#c9af83` | gold on dark backgrounds |
| `--accent-soft`, `--accent2-soft` *(new)* | `#e8ede5`, `#f3ecdf` | green and gold tints |
| `--ok-bg`, `--warn-bg`, `--bad-bg` *(new)* | `#e2f5ec`, `#fdf1d6`, `#fce6e3` | status backgrounds |
| `--scene-bg` *(new)* | `#1c2a23` | 3D view and image wells |
| `--font-serif` *(new)* | Georgia, Songti SC, STSong, SimSun | headings |

Old aliases (`--glow-cyan`, `--accent-purple`, …) still exist and point at the new values, so
nothing that reads them breaks.

**Other shared rules added**
- Buttons are pill-shaped. `.btn-light` and `.btn-outline-light` are for dark backgrounds.
- `.notice-*` status strips.
- Top-bar overrides (`.topbar .btn-primary`, `.btn-ghost`, `.tag`, `.user-name`, `.tag-brand`).
- `.topbar.over-hero` / `.scrolled` for the home page.
- `.scene3d-toggle` for the 3D view buttons.
- Phone rules (≤ 719 px): the top bar stays on one line and hides the role tag and user name;
  section labels wrap.
- Reduced-motion rules for every animation.

## 3. Home page

Files: `app/page.tsx` and `app/components/LeadHero.tsx`.

### 3.1 The opening (LeadHero), three stages, as on the studio site

1. **Intro still.** `/images/landing-fallback.png` (the living room) covers the screen. When the
   first video starts playing (and the image has loaded), `.landing-intro` gets `is-playing`.
   The still then closes through a turning circle (`landing-viewfinder`,
   `landing-counterturn`, 4.8 s), a gold ring expands (`landing-orbit`), and the title fades in
   (`landing-title`).
2. **First video** (loops): `…/hf_20260625_174131_395bc785-….mp4`.
3. **Second video**, at the first scroll: `…/hf_20260624_055914_ee2b3b56-….mp4`. It restarts
   from 0, and the first video fades out over 700 ms, then pauses. Scrolling back to the top
   returns to the first video.

**How it is built**
- The section is `200vh` tall with a sticky `100vh` stage, so the opening stays pinned while the
  page scrolls.
- Layer order: second video, first video, intro still, ring, shade, emblem, copy.
- **Playback:** paused when the tab is hidden or reduced motion is on. Every listener and timer
  is removed on unmount. With reduced motion, the still stays and nothing animates.
- **Top bar:** gets `over-hero` (transparent, over the video) and `scrolled` (solid green once
  the opening has scrolled past). Both classes are removed when leaving the page.

**Buttons:** `openAuth(mode)`, exported from `LeadHero.tsx`, is used by every home-page button.
- Signed out: it clicks the top bar's own `注册` / `登录` button, so the existing `RegisterModal` opens.
- Signed in (those buttons don't exist): it goes to the visitor's console, `/contractor` for a
  company and `/dashboard` otherwise, using the same mapping as `AuthNav`.

### 3.2 Sections, in order

| Section | Content source |
|---|---|
| Benefits strip | the five pipeline steps |
| `01 / THE I RENOVATION WAY` | the six-agent team (his roster in `lib/agents.ts`) |
| Feature cards | his three original feature cards |
| `02 / STYLES` gallery | his eight `/images/gallery/*.jpg` |
| `03 / CORE CHAIN` dark band | the five-step chain, ending in bidding and matching |
| Note | his own line: AI design free for homeowners, companies pay to take orders |
| Join band | 个人用户注册 / 装潢公司入驻, both opening the register form's role chooser |
| Footer | name, competition, track |

### 3.3 Removed from the original home page

- **Preloader and ticker.**
- **Budget and contact funnel.** It looked like a form but only kept the values in local state;
  nothing was saved or sent.
- **Rotating 3D carousel.** It called `preventDefault` on wheel events, so visitors couldn't
  scroll the page. Its photos are now the style gallery.

## 4. Other pages

- **`layout.tsx`:** the studio house icon (`/brand/icon.png`) is the logo and the favicon. The
  OPC tag uses `.tag-brand`.
- **`AuthNav.tsx`:** the user name uses `.user-name`, so the phone rule can hide it.
- **`Scene3D.tsx`:** muted earth colours.
  - Background and fog `0x1c2a23`; ambient light `0xd8d2c0`; point light `0xe6d2a8`.
  - Ground `0x22332a`; grid `0x3a4c40` / `0x2a3a30`.
  - Labels: background `rgba(28,42,35,.8)`, text `#f8f4ea`, sub-text `#c9af83`.
  - The view toggle gets `className="scene3d-toggle"`.
- **`FloorPlanStudio.tsx`:** canvas colours moved from cyan to the brand green and text greys.
- **`project/[id]`, `boss`, `dashboard`:** inline neon `rgba(...)` and hex values replaced by the
  tokens above.
- **`contractor`, `RegisterModal`:** the modal overlay is `rgba(20,28,24,.55)`.
- **Left unchanged on purpose:** the per-agent identity colours in `lib/agents.ts`. They are data.

## 5. Bugs found in review and fixed

| # | Problem | Cause | Fix |
|---|---|---|---|
| 1 | The home page showed only one opening scene; the studio's living-room intro before the videos was missing | The `landing-intro` and `landing-transition` layers and their four animations were not ported | Ported them exactly (§3.1): `LeadHero.tsx` adds the layers and the `playing` trigger; `globals.css` adds `--landing-center`, the rules, keyframes and reduced-motion overrides |
| 2 | Signed-in visitors clicked 立即注册, 已有账号登录 or the join-band buttons and nothing happened | The buttons clicked the top bar's 注册/登录 buttons, which don't exist when signed in | `openAuth` falls back to the visitor's console; the home page reuses it instead of its own copy |
| 3 | `boss/page.tsx` and `dashboard/page.tsx` showed every line as changed | The recolour script wrote Windows (CRLF) line endings into files that use LF | Restored each file's original line endings; the real change is now 1 and 2 lines |
| 4 | Autoprefixer warning: `end value has mixed support` | `align-items: end` / `start` in the gallery heading | Changed to `flex-end` / `flex-start` |
| 5 | The chain step 装修队匹配 didn't mention bidding | My wording, written before the owner decided to keep bidding | Now: 业主确认发布后，装修公司投标，匹配智能体按资质与真实投标择优推荐 |

Earlier fixes during the sync:
- The 3D view's 俯视 button was invisible.
- The phone header was squashed when signed in.
- The join band used the old neon background image.

## 6. Verification

- **Type check:** `npx tsc -b` from the monorepo root passes. (`tsc --noEmit` inside
  `apps/web` reports TS6305 unless `packages/shared` is built first; that comes from the repo's
  existing setup.)
- **Browser, desktop and 375 px phone,** dev server `next dev -p 3005`:
  - Opening: intro still, then circle reveal, first video, then the second video after
    scrolling. Measured: the first video fades to opacity 0 and pauses, the second plays.
  - Home buttons, signed out: the register form opens, or the login form for 已有账号登录.
  - Home buttons, signed in: 立即注册 goes to `/dashboard`.
  - `/`, `/dashboard`, `/project/1`, `/boss` and `/contractor` load with no horizontal overflow.
  - No new console errors or server warnings after the fixes.
- **Production build:** `NEXT_DIST_DIR=.next-build npx next build` in `apps/web` (Next.js
  15.5.29) passes.
  - It compiled, and the lint and type-validity checks passed.
  - All 18 routes generated: home 3.42 kB, first load 106 kB.
  - A separate build folder was used so the running dev server's `.next` wasn't touched.
    Afterwards the build folder was deleted, and the two files Next rewrote for it
    (`tsconfig.json`, `next-env.d.ts`) were restored from the backup.
  - The worker (`apps/worker`) wasn't built; it wasn't changed.
- **Not covered:** Safari and Firefox weren't tested. The intro relies on the CSS `:has()` selector, as the studio does. On a browser
  without `:has()`, the ring and the title timing don't run, but the still still closes.

## 7. Local side effects

- **Test data:** a test homeowner and project 1 were created in this PC's PGlite database
  during the checks.
- **`apps/web/next-env.d.ts`:** Next rewrites it on every dev start or build. It is currently
  back to the original (`.next-live`).
- **Type-check output:** `packages/shared/dist` and the `*.tsbuildinfo` files.
- **Dev server:** still running on port 3005.
- **`apps/web/.env.local` (new, local only, git-ignored):** holds `AGNES_API_KEY`. Without it,
  `lib/agnes.ts` sent an empty token and every image generation failed with
  `Agnes API 401 Invalid token`. Checked with one real generation through
  `/api/agnes/generate` (HTTP 200, image returned).
- The same file holds `MIMO_BASE_URL=https://api.xiaomimimo.com/v1` and `MIMO_API_KEY`, which
  `lib/mimo.ts` needs for floor-plan recognition and the agents. Checked:
  - The key lists the MiMo models, including the `mimo-v2.6-pro` the code uses.
  - `/api/mimo/recognize` read a three-room test plan correctly (HTTP 200).
- `apps/worker` reads the same variable names but wasn't set up or run.

## 8. Open items

- **`studio/`:** whether it keeps running alongside this site is undecided.
- **Contractor button:** 装潢公司入驻 opens the role chooser, not the company form directly.
  Skipping that step would need a small change to `RegisterModal`; not done, to keep its
  behaviour unchanged.
