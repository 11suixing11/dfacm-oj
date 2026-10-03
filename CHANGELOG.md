# Changelog

## v1.2.0 - 2026-10-03

### Changed

- Default theme switched from forced dark back to Hydro's native light; every user can pick Light/Dark in preferences again (`preference.theme` system key removed, per-user `theme` fields cleared, `ui-default` default restored to `light`).
- Brand overlay rebuilt as `theme/00-brand.css` covering both modes: shared base (brand fonts, buttons, active menu, table/markdown readability, focus rings), dark specifics (dark nav, body contrast, immersive auth pages) and new light specifics (white nav with gold edge, deep-gold highlights for AA contrast, light table headers, light immersive auth gradient). Replaces the dark-only `00-native-dark-brand.css`.

### Added

- Footer theme toggle injected via `ui-default.footer_extra_html`: signed-in users get a one-click `白天 / 夜间` switch hitting `GET /set_theme/:theme` (redirects back, guarded by `PRIV_USER_PROFILE`); guests are pointed at the login flow instead.
- Landing page dual-theme: default light with the full CSS variable set re-based for day (deep-gold accents, light ridges/mountains, white cards), `html.dark` carries the original night look; day/night toggle button in the nav (and mobile menu) persisted in `localStorage 'swpu-theme'` with a head-level anti-FOUC script; the OJ footer toggle now writes the same key so the landing page follows the OJ choice (`deploy/update-footer-toggle-sync.js`). The judge terminal card intentionally stays dark in both modes; `meta theme-color` follows the active mode.

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
