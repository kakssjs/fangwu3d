# Login and permissions

Technical record of the real login added to `apps/web`. State as of 2026-11-07.
Nothing is committed; this folder is not a git repository.

## 1. What was wrong

Before this change the site had a demo login:

- `POST /api/auth/login` checked only that the phone number existed. There was no password check.
  The password at sign-up was optional and stored as plain text.
- The server never knew who was signed in. The browser remembered the account in `localStorage`,
  and every API route trusted whatever `homeownerId`, `companyId`, `role` or `signer` the page sent.
- So anyone could sign in as anyone, open the boss console, approve contractors, read or delete
  other people's projects, bid under another company's name, and sign contracts for either side.
- The AI routes (Agnes, MiMo) were open to anyone, so a stranger could spend the paid credits.

## 2. How it works now

| Piece | Where | What it does |
|---|---|---|
| Password hashing | `apps/web/lib/auth.ts` | `scrypt` (Node built-in) with a random 16-byte salt. Stored as `scrypt$salt$hash` in the existing `users.password_hash` column. Minimum 8 characters. |
| Session | `apps/web/lib/auth.ts` | After login or sign-up the server sets an `ireno_session` cookie: `payload.signature`, where the payload is `{uid, role, exp}` and the signature is HMAC-SHA256 with `SESSION_SECRET`. The cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in production, valid for 7 days. |
| Checking | `requireSession(req, roles?)` | Reads and verifies the cookie, re-checks that the account still exists with the same role, and returns the session or a ready-made 401 or 403 response. |
| Ownership | `isOrderParty`, `companyCanSeeOrder`, `canViewProject`, `canEditProject` | Decide who may see or change a given order or project. |
| Boss account | `.env.local` | There is no boss role in the database, so the boss is configured: `BOSS_PHONE` and `BOSS_PASSWORD`. That phone number can't be registered as a normal account. |
| Old accounts | `checkPassword` | A plain-text password from before is accepted once, then replaced by a hash on that login. |

The server trusts only the signed cookie. Ids, roles and signers sent by the page are ignored or
checked against it.

### Routes

| Route | Who may call it |
|---|---|
| `POST /api/auth/register` | anyone; password required; signs the new user in |
| `POST /api/auth/login`, `POST /api/auth/logout` | anyone |
| `GET /api/auth/me` | any signed-in user; returns the account from the cookie, never the hash |
| `POST /api/agnes/*`, `POST /api/mimo/recognize` | homeowner or boss |
| `GET /api/boss`, `POST /api/users/[id]/verify` | boss only |
| `GET/PATCH /api/users/[id]` | the account itself (PATCH: companies only); GET also for the boss |
| `GET/POST /api/projects` | homeowner (own projects only; the owner is taken from the login, not the form); the boss may list by `homeownerId` |
| `GET /api/projects/[id]`, `GET .../results` | the owner, the boss, or a company that may see the project's order |
| `DELETE /api/projects/[id]`, `POST .../results`, `.../replan`, `.../recheck`, `.../resume` | the owner or the boss |
| `POST /api/orders` | homeowner, for their own project |
| `GET /api/orders` | only the caller's own orders (`id` is ignored unless boss); the open market is for companies and the boss |
| `GET /api/orders/[id]` | the two parties, the boss, or a company that may see it (open, selected, or has bid) |
| `PATCH /api/orders/[id]` | the order's homeowner or the boss (choosing a winner) |
| `POST /api/bids` | company only; company id and name come from the account; only on `open` orders |
| `GET /api/bids?orderId=` | the homeowner and boss see all bids; a company sees only its own |
| `POST /api/orders/[id]/confirm` and `/contract` (sign) | the signer is the **logged-in** party, never the request body; only the order's own homeowner or selected company |

## 3. Changes to the screens

- **Sign-up:** a password of at least 8 characters is required, now also in the company form,
  which had no password field.
- **Login form:** phone and password. A wrong password shows 手机号或密码错误.
- **Header (`AuthNav`):** logout calls the server. On every load the page asks `/api/auth/me`; if
  the session is gone, the remembered account is cleared. The boss gets a 老板控制台 link.
- **Boss console:** shows 仅限老板账号 with a way back to the home page if the visitor isn't the boss.
- **Company portal:** new **签署合同** button in the contract window, and the contract text scrolls
  so the button stays reachable. Previously the company could not sign at all; only the
  homeowner's page had a demo button for "Sign as Company".
- **Homeowner's project page:** the "Confirm as Company" and "Sign as Company" demo buttons are
  replaced by a waiting message. When both have signed, the **server** sets the order to
  `contracted`, so it no longer depends on which side signs last.

## 4. Files

- New: `apps/web/lib/auth.ts`, `apps/web/app/api/auth/logout/route.ts`.
- Changed:
  - `packages/shared/src/db.ts`: one function, `setUserPasswordHash`.
  - All routes under `apps/web/app/api/` except `health`.
  - `app/components/RegisterModal.tsx`, `AuthNav.tsx`, `LeadHero.tsx` (boss link).
  - `app/boss/page.tsx`, `app/contractor/page.tsx`, `app/project/[id]/page.tsx`.
  - `.env.example`.
- Local only (git-ignored): `apps/web/.env.local` gets `SESSION_SECRET`, `BOSS_PHONE`,
  `BOSS_PASSWORD`.
- No dependency was added.

## 5. Settings

In `apps/web/.env.local`:

```
SESSION_SECRET=   at least 32 random characters; keep it secret
BOSS_PHONE=       the boss's login phone
BOSS_PASSWORD=    at least 8 characters
```

`SESSION_SECRET` has been generated for this PC, and `BOSS_PHONE` is a placeholder
(`19900000000`). **Change `BOSS_PHONE` and `BOSS_PASSWORD` to your own** before showing the site.
On a real server set all three as environment variables, with a different secret. Changing
`SESSION_SECRET` signs everyone out.

### If `SESSION_SECRET` is not set

`.env.local` is git-ignored, so a copy of the site on another machine does not have it. Originally that
made **every sign-in return 500 and every sign-up fail** ("登录失败" / "注册失败"), and a sign-up created
the account and then failed to start the session. Reproduced and fixed: if `SESSION_SECRET` is missing
(or shorter than 32 characters), the site generates a random one on first use and keeps it in
`apps/web/.session-secret` (git-ignored, so restarts don't sign people out; it logs a warning). If the
file can't be written (read-only host), the secret lives only in memory and everyone has to sign in
again after a restart. For a real deployment, still set `SESSION_SECRET` in the environment; the file
is a safety net, and deleting it signs everyone out. Tested with no secret configured: sign-up, sign-in,
wrong password, and a session surviving a restart. Accounts left half-created by the broken sign-up
work normally now.

## 6. Verification

- **Type check:** `npx tsc -b` passes. **Production build:** `next build` passes (19 routes).
- **HTTP test, 75 checks, all passing:** register and login rules, wrong and missing passwords, a
  forged boss cookie and a cookie without a valid signature (rejected), A/B homeowners separated
  (read, write, delete, replan, publish), companies limited to their own data and bids, a
  company can't see a competitor's bid, only the selected company can confirm or sign, a
  homeowner asking to sign "as company" is recorded as the homeowner, boss-only routes, logout.
  The script was a one-off and isn't kept in the project.
- **Browser:** the short-password message, sign-up, login with a wrong and a right password,
  logout (session and remembered account both cleared), the boss console refusing a visitor,
  project creation, the company portal signing a contract, and the homeowner signing last
  (order became `contracted`). The new project page got only 200 responses.
- **Not tested:** signing in as the boss in the browser (the API test covers it; try it once
  yourself); the old-plain-text-password upgrade path (written and reviewed, not run); the
  background worker.

## 7. Known limits

- **Old accounts with no password** (made before passwords were required; the registration form
  used to make the password optional). They used to be locked out: login said "wrong password" and
  registering said "already registered". Now the login says the account has no password yet, and
  registering again with **the same phone number and the same account type** sets a password and signs
  the person in (`claimed: true`). The wrong account type, or an account that already has a password,
  is still refused. **Trade-off:** there is no SMS check, so anyone who knows the phone number of a
  still-password-less account can claim it before its owner does. Those accounts had no protection
  at all before, and only the first claim works; an SMS code is the real fix. Old accounts that
  do have a password (including plain-text ones) are not affected and still sign in as before.
  There is still no password reset for accounts that have a password.
- **No limit on login attempts.** Passwords are hashed, but nothing slows down guessing. Add rate
  limiting before a public launch.
- **No SMS or email check.** Anyone can register any phone number; a verification code needs a
  paid SMS service (decision pending).
- **No CSRF token.** `SameSite=Lax` blocks cross-site form posts, but a stricter setup would add
  one.
- **`/api/projects/[id]` returns the project's `floorPlanPath` and homeowner id** to companies
  that may see it. Fine for now; trim if privacy matters.
- **The 3-second boss-console polling and project-page polling** keep sending requests with the
  cookie; they stop on a 401 or 403 only on the boss page.

## 8. Test data on this PC

Several test accounts and projects were created in the local database during testing
(`UI Test Owner`, `Flow Owner`, `Flow Renovation Co`, and numbered test users). They are
harmless but not part of the code.

## 9. Email verification and email-code login (2026-11-07)

Registration can require a verified email, and people can log in with a code sent to that email.
Phone + password login still works. Payment is separate: a company still pays its membership fee
first, and the membership becomes active only after the boss confirms the payment.

**How it works** (`apps/web/lib/email.ts`, same design as the studio's email service):

- `POST /api/auth/email/code` `{email, purpose: "register" | "login"}` sends a 6-digit code. It is valid
  for 5 minutes, works once, and is cancelled after 5 wrong tries. Only a keyed hash of it is stored
  (`email_codes`), keyed with the session secret.
- Send limits are kept in the database (`email_quotas`) and spent *before* sending, so retries and
  timeouts can't flood a mailbox: 1 per minute and 5 per day per address (registration and login share
  them), 10 per hour per IP, 200 per day for the whole site.
- For a login code, an address with no account gets the same answer as a real one, but no email is sent,
  so nobody can find out who has registered.
- `POST /api/auth/register`: when email is on, `email` and `emailCode` are required. The code is used
  only after the phone checks pass, so a duplicate phone doesn't waste it. A verified email can belong
  to only one account (case doesn't matter). The account stores `email_verified_at`.
- `POST /api/auth/email/login` `{email, code}` signs in only accounts whose email was verified.
- `GET /api/auth/email` returns `{enabled}` so the screens know whether to show the email fields.
- Screens (`RegisterModal.tsx`): at sign-up, an email field with "获取验证码" and a code field; at login,
  a choice between "手机号密码登录" and "邮箱验证码登录". The countdown is only a hint; the server decides.

**Settings** (`apps/web/.env.local`; off unless `EMAIL_ENABLED=true`):

```
EMAIL_ENABLED=true
SMTP_HOST=smtp.qq.com          # QQ Mail; 163: smtp.163.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=3168432265@qq.com
SMTP_PASSWORD=<the mailbox's SMTP 授权码, not its login password>
SMTP_FROM=3168432265@qq.com
```

For local tests, `EMAIL_DEV_OUTBOX=/path/file.jsonl` (ignored in production) writes the messages to that
file instead of sending them.

**Checked:** a 25-step test on a fresh database covered sending, limits, register with and without a
code, one-time codes, duplicate emails in any case, company sign-up with its membership,
email login, unknown addresses, 5 wrong tries, and phone login. The payment flow was also checked:
a new company is pending and can't bid, the boss approves, the membership is active, and a second
approval is refused. In the browser, email login worked through the real screen. On the live server, a real code was
sent through QQ.

**Fixed on the way:** the setup SQL added `membership_payments` columns before creating that table,
so a brand-new database failed to start. The teammate had fixed the same thing directly on the
server; their fixes there are now in git too (commit "Bring in the payment fixes made directly on the server").
