# Changelog

## v1.5.0 - 2026-10-03

### Changed

- **Login is now clean — no forced redirects, no native auth UI anywhere.** Caddy serves the branded `/reg` page *in place* at the native auth URLs (`rewrite` instead of `302`): bare `GET /login` renders the branded page with the password tab active at the same URL, bare `GET /register` renders it with the register tab. `POST /login`, `GET /login?...` (two-step flows) and `POST /register` / `/register/<token>` still pass through untouched. The rewritten `?tab=pwd` reaches the regcode plugin through Hydro's merged handler args, which boots the right tab via an injected `window.__SWPU_BOOT` script (the browser URL keeps no query after a rewrite).
- **Every login-required trigger now opens the branded page itself, in place.** `deploy/clean-auth-entries.js` replaces Hydro's global `showSignInDialog()` with an overlay that embeds `/reg?embed=1` (same-origin iframe, compact card layout); the native `dialog--signin` is never shown (and hidden + replaced if it ever slips through before the hook applies). The header 登录 button — whose jQuery handler bypasses the global function — is intercepted at capture phase on `[name="nav_login"]`. On mobile Hydro navigates to the nav href, which now points at the branded page anyway. The embedded page posts `swpu-auth-success` / `swpu-auth-close` to the host: success navigates the host to the `return` path (site-relative only, validated), so users land back where they started, logged in. Close via the in-card ✕, Esc, or clicking the backdrop. `/reg` alone is downgraded to `X-Frame-Options: SAMEORIGIN` / `frame-ancestors 'self'` (two disjoint header matchers — a later `header` line cannot override the catch-all block); every other route keeps `DENY` / `frame-ancestors 'none'`.
- `/reg` noscript fallback links now point at `/login?fallback=1` / `/register?fallback=1` so they still reach the native pages after the rewrite.
- Password login on `/reg` now distinguishes outcomes by response status: 403/401 (and a bare `/login` render) mean wrong credentials; any other non-2xx reports the status instead of mislabeling, and two-step-verification redirects navigate to the native 2FA step as before. Hydro renders `footer_extra_html` line-by-line inside `<ol>` items, so multi-line scripts are shredded into inert text — every installed script stays on one line (the historical multi-line `/login` banner script never executed; its remains are removed and the feature reinstalled as a single line).

## v1.4.0 - 2026-10-03

### Changed

- The site now has exactly one login interface. Bare `GET /login` is redirected (302) to `/reg?tab=pwd` by Caddy — `POST /login` and `GET /login?...` (two-step verification flows) pass through untouched. Hydro's in-page login modal (`dialog--signin`, shown on restricted pages when signed out) is intercepted by a footer script (`deploy/unify-login-entries.js`) and replaced with a redirect to `/reg?tab=pwd&return=<current path>`; `/reg` honors the `return` parameter (site-relative paths only) on both the code-login and password-login success paths, so users land back where they started.

## v1.3.0 - 2026-10-03

### Added

- `/reg` is now a one-stop auth page with a third `密码登录` tab: the form posts natively to Hydro's `/login` (uname/password/rememberme plus the tfa/authnChallenge hidden fields), enhanced with a seamless fetch submit that detects success by the final URL (wrong credentials return 403 on `/login`; success redirects away, including two-step-verification flows). The footer links switch to the password tab in-page and point lost-password to `/lostpass`; landing page login links now target `/reg?tab=pwd`. Verified end to end with a temporary user (created, logged in via POST /login with session cookie, preference page 200, deleted).

## v1.2.0 - 2026-10-03

### Changed

- Default theme switched from forced dark back to Hydro's native light; every user can pick Light/Dark in preferences again (`preference.theme` system key removed, per-user `theme` fields cleared, `ui-default` default restored to `light`).
- Brand overlay rebuilt as `theme/00-brand.css` covering both modes: shared base (brand fonts, buttons, active menu, table/markdown readability, focus rings), dark specifics (dark nav, body contrast, immersive auth pages) and new light specifics (white nav with gold edge, deep-gold highlights for AA contrast, light table headers, light immersive auth gradient). Replaces the dark-only `00-native-dark-brand.css`.

### Added

- Footer theme toggle injected via `ui-default.footer_extra_html`: signed-in users get a one-click `白天 / 夜间` switch hitting `GET /set_theme/:theme` (redirects back, guarded by `PRIV_USER_PROFILE`); guests are pointed at the login flow instead.
- Landing page dual-theme: default light with the full CSS variable set re-based for day (deep-gold accents, light ridges/mountains, white cards), `html.dark` carries the original night look; day/night toggle button in the nav (and mobile menu) persisted in `localStorage 'swpu-theme'` with a head-level anti-FOUC script; the OJ footer toggle now writes the same key so the landing page follows the OJ choice (`deploy/update-footer-toggle-sync.js`). The judge terminal card intentionally stays dark in both modes; `meta theme-color` follows the active mode.
- Fixed the immersive auth pages (login/register/lostpass): the native full-page backdrop lives on `.layout--immersive #panel` (an ID selector that outranks any class combination), so the brand overlay now targets `#panel` for both modes — light gets the soft gradient panel with all native inverse white text re-based for day (labels, inputs, checkboxes, supplementary links, footer), dark keeps the brand gradient and now actually clears the leftover native wallpaper image.

## v1.1.0 - 2026-10-03

### Security

- `swpu-regcode` stores verification codes as salted SHA-256 digests instead of plaintext, binds each code to its salt/generation/UID/purpose, and consumes it with an atomic `findOneAndDelete` so concurrent requests cannot reuse one code.
- Login codes are only sent to the account's bound mailbox; registration codes are bound to the exact delivery address that received them.
- `swpu-regcode` now runs Hydro's login policy checks (disabled account, `server.login`, two-factor/passkey accounts, contest-mode IP binding) before issuing and before consuming a code, and emits `auth/before-login`, `user.loginSuccess` and `auth/login` with codes/passwords stripped from the audit record.
- Real client IP resolution (direct peer wins, loopback falls back to the proxy-written XFF) is used for rate limits, login records and contest IP binding.
- Caddy cache headers now apply only to successful static responses; `/home.html` keeps `no-cache` after the `/` rewrite and `/resource/*` keeps Hydro's own policy. Requires Caddy 2.9.1+ for `header ... { match status 2xx }`.

### Added

- `plugin-swpu-ops`: read-only admin scripts for weekly training reports (CSV/Markdown) and judge health summaries (Markdown/JSON), registered with Hydro's `PRIV_EDIT_SYSTEM` + sudo script permissions and no HTTP routes.
- `scripts/backup-hydro.sh`: locked, non-destructive backup wrapper around `hydrooj backup --withAddons` with ZIP validation, sidecar state archives, checksums and offsite/restore guidance.
- `scripts/check-deployment.sh`: read-only deployment checks with `--role web|judge` and opt-in HTTP cache verification.
- Handler-level regression tests for `swpu-regcode` and `deploy/deployment.md` sections on backup/restore, deployment checks and manual judge acceptance.

### Repository

- CI now installs the regcode test dependency, runs the regcode handler tests, the ops plugin tests and the deployment script tests.

## v1.0.0 - 2026-10-03

### Security

- `swpu-regcode` now uses `crypto.randomInt` for six-digit codes.
- Verification codes are bound to their `purpose` (`reg` or `login`).
- Failed attempts are counted with an atomic MongoDB update, so concurrent guesses cannot bypass the five-attempt limit.
- Code verification checks `expireAt` explicitly instead of relying only on delayed TTL cleanup.
- Client IP extraction uses `request.ip` for direct connections and only trusts the first `X-Forwarded-For` entry when the direct peer is loopback.
- Caddy adds HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options` and a minimal `Content-Security-Policy`, and overwrites client-supplied XFF.

### Changed

- Landing page finishes the `swpuacm.xyz` migration and adds canonical, Open Graph, Twitter card and icon metadata.
- Registration front end handles fetch/network failures without leaving buttons stuck in a loading state.
- Theme direction is now Hydro native Dark plus `theme/00-native-dark-brand.css`; 01-05 remain as legacy fallback.
- `deploy/install-landing.sh` installs `index.html` as `home.html` and flattens `landing/assets/*`.
- `deploy/install-theme.sh` applies the brand overlay idempotently and supports the legacy overlay set via `SWPU_THEME_LEGACY=1`.
- Deployment docs cover reverse-proxy IP handling, security headers, plugin symlink caveats and reproducible installs.

### Repository

- Added plugin unit tests for code format, expiry, purpose binding and verification filters.
- Added GitHub Actions CI for secret scanning, plugin tests, retired-domain checks, shell syntax and Python compilation.
- Added `.gitattributes` and ignored local secret/QA files.
