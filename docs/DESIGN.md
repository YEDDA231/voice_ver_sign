# UX & design notes (Voice2Sign web app)

## Role-specific dashboards

- **Hearing:** Voice → Sign is listed first — optimized for speech input and reading sign output.
- **Deaf / HoH:** Sign → Voice is listed first — camera and signing prioritized; voice input is secondary.
- **Admin:** Extra **Admin** section with DB-backed stats (`GET /api/admin/stats`). Admins are created via environment seed (`ADMIN_EMAIL` / `ADMIN_PASSWORD`), not public signup.

## Responsiveness

- Sidebar collapses to an overlay on small screens; use the header menu button.
- Touch targets stay ≥ 44px where possible (nav items, pipeline buttons).
- Header wraps (`flex-wrap`) so mic status + auth links stack cleanly on narrow phones.
- Prefer **single column** pipeline grids below ~900px (already in CSS).

## Microphone feedback

- **Web Audio API** drives level bars when a mic stream is active (chat composer or Voice → Sign pipeline).
- Respects **reduced motion** (`prefers-reduced-motion` / preference toggle) for calmer animations.

## Accessibility & inclusion

- Skip links on every page (`<a class="skip-link">`).
- `focus-visible` rings on all interactive elements (replaces browser default).
- `aria-current` on the active nav item, `aria-modal` / `aria-labelledby` on modals, `role="alert"` for inline form errors.
- All form inputs carry proper `<label>` + `autocomplete` + `aria-required` where applicable.
- Password toggle is a real `<button>` with `aria-label` that updates on toggle.
- All decorative SVGs use `aria-hidden="true"`.
- Keep **high contrast** and **reduced motion** toggles in Preferences.
- Ensure captions / transcripts remain visible for deaf users when voice features are used.
- Test with OS screen readers and browser zoom at 200%.

## Security headers (HTTP hardening)

Sent by `server/security_headers.py` middleware on every response:

- `Content-Security-Policy` (strict, same-origin; `frame-ancestors 'none'`)
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (deny geolocation, payment, usb; allow microphone + camera for self)
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`
- `Strict-Transport-Security` (only when `VVS_ENABLE_HSTS=1` is set, behind HTTPS)
- `Cache-Control: no-store` for HTML responses

Set `VVS_CSP_REPORT_ONLY=1` to switch CSP to report-only mode during rollout.
Set `VVS_CSP_EXTRA_ORIGINS=https://cdn.example.com,...` to add to `connect-src`.

## Client-side input handling

- All user-controlled strings are rendered via `textContent` or safe DOM construction.
- Avatars from localStorage are filtered against a strict allow-list (data URLs and same-origin paths only).
- Chat messages are length-capped (2000 chars) on both client and server.
- All `<a target="_blank">` and `window.open` calls pass `rel="noopener"` (or `noopener,noreferrer`).

## Connection state

A small banner appears at the top of the page when `/api/health` fails or the
browser is offline. Skipped on the auth pages so it does not show before sign-in.

## Recommended next design steps

1. **Larger sign video** on the deaf-first layout (full-width on mobile).
2. **Consistent iconography** for “sound on/off” vs “mic active” (already partially separated).
3. **Skeleton loaders** for admin stats and chat history.
4. **Dark mode** contrast audit (WCAG AA for text on `--bg-primary`).
5. **Nonce-based CSP** (drop `'unsafe-inline'` from `script-src`).

## Database

- Roles are stored in `users.user_type` (`hearing` | `deaf` | `admin`). Use Alembic when you evolve the schema in production.
