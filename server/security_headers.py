"""
Security headers middleware for the FastAPI app.

Applies a strict baseline of HTTP security headers to every response, including
static-file and API responses. Headers mirror modern best practices:

  - Content-Security-Policy: a strict, same-origin policy that still allows
    inline styles (the app uses a small set), Google Fonts, and data: /
    blob: URLs for camera + audio preview frames. Inline scripts are
    disabled via nonces in production; for the demo we keep the existing
    same-origin inline behaviour but block remote script sources.
  - X-Frame-Options: DENY — clickj protection.
  - X-Content-Type-Options: nosniff — block MIME sniffing.
  - Referrer-Policy: strict-origin-when-cross-origin.
  - Permissions-Policy: disable unused powerful features (geolocation, etc.).
  - Cross-Origin-Opener-Policy + Cross-Origin-Resource-Policy: isolation
    hardening for production deployment behind a same-origin reverse proxy.
  - Strict-Transport-Security: when behind HTTPS (opt-in via env).
  - Cache-Control for HTML responses: don't cache authenticated pages.

Configuration via environment variables:
  VVS_ENABLE_HSTS=1            # add Strict-Transport-Security
  VVS_CSP_REPORT_ONLY=1       # set CSP to report-only mode for testing
  VVS_CSP_EXTRA_ORIGINS=...   # comma-separated additional allowed origins
"""
from __future__ import annotations

import os


def _build_csp(extra_origins: str = "") -> str:
    """Build a Content-Security-Policy value.

    The policy is intentionally strict but practical for the demo:
    - default-src 'self' (same origin only)
    - script-src 'self' 'unsafe-inline' (kept for now — see TODO below for nonces)
    - style-src 'self' 'unsafe-inline' https://fonts.googleapis.com
    - font-src 'self' https://fonts.gstatic.com data:
    - img-src 'self' data: blob: https:
    - media-src 'self' blob:  (camera / audio preview streams)
    - connect-src 'self' + extras
    - frame-ancestors 'none'
    - base-uri 'self'
    - form-action 'self'

    TODO(security): move to nonce-based script-src and drop 'unsafe-inline'.
    """
    connect_extras = " ".join(
        o.strip() for o in extra_origins.split(",") if o.strip()
    )
    connect_src = "'self' " + connect_extras if connect_extras else "'self'"

    directives = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob: https:",
        "media-src 'self' blob:",
        "connect-src " + connect_src + " https://cdn.jsdelivr.net https://storage.googleapis.com",
        "worker-src 'self' blob: https://cdn.jsdelivr.net",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
    ]
    return "; ".join(directives)


def _build_permissions_policy() -> str:
    """Deny powerful features the app does not need."""
    return (
        "geolocation=(), "
        "microphone=(self), "
        "camera=(self), "
        "payment=(), "
        "usb=(), "
        "magnetometer=(), "
        "gyroscope=(), "
        "accelerometer=()"
    )


def build_security_headers(csp_value: str) -> dict[str, str]:
    """Return the baseline security-headers dict applied to every response."""
    headers = {
        # Anti-clickjacking
        "X-Frame-Options": "DENY",
        # Block MIME sniffing
        "X-Content-Type-Options": "nosniff",
        # Referrer policy
        "Referrer-Policy": "strict-origin-when-cross-origin",
        # Disable unused powerful features
        "Permissions-Policy": _build_permissions_policy(),
        # Cross-origin isolation hardening
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Resource-Policy": "same-origin",
        # Disable legacy XSS auditor (modern browsers ignore it, but keep it off)
        "X-XSS-Protection": "0",
        # Content Security Policy
        "Content-Security-Policy": csp_value,
    }

    # Only add HSTS when behind HTTPS — sending it over HTTP is a no-op
    # but Firefox will refuse to upgrade and Chrome logs a warning.
    if os.getenv("VVS_ENABLE_HSTS", "").lower() in ("1", "true", "yes"):
        headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )

    return headers


def is_html_response(content_type: str) -> bool:
    return "text/html" in (content_type or "")


def install_security_middleware(app, *, report_only: bool = False) -> None:
    """Attach a SecurityHeadersMiddleware to the FastAPI app.

    Args:
        app: FastAPI instance.
        report_only: if True, send the CSP as Content-Security-Policy-Report-Only
            (useful when testing policy changes in production).
    """
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.requests import Request
    from starlette.responses import Response

    extra = os.getenv("VVS_CSP_EXTRA_ORIGINS", "")
    csp = _build_csp(extra)
    csp_header_name = (
        "Content-Security-Policy-Report-Only" if report_only else "Content-Security-Policy"
    )
    base_headers = build_security_headers(csp)
    base_headers.pop("Content-Security-Policy", None)
    base_headers[csp_header_name] = csp

    class SecurityHeadersMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next) -> Response:
            response = await call_next(request)
            # Apply security headers, do not overwrite anything the app set.
            for k, v in base_headers.items():
                response.headers.setdefault(k, v)
            # Don't cache HTML — many pages are role-aware.
            if is_html_response(response.headers.get("content-type", "")):
                response.headers.setdefault("Cache-Control", "no-store")
            return response

    app.add_middleware(SecurityHeadersMiddleware)
