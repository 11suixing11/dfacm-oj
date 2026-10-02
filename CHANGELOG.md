# Changelog

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
