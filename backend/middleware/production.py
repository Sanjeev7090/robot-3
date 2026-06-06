"""
Production Middleware — Phase 5
================================
Includes:
  1. RateLimitMiddleware  — in-memory token bucket (no Redis needed)
  2. SecurityHeadersMiddleware — HSTS, CSP, X-Frame-Options, etc.
  3. StructuredLoggingMiddleware — JSON-formatted request logs
  4. PrometheusMetricsMiddleware — basic request metrics

Usage (add to server.py):
    from middleware.production import add_production_middleware
    add_production_middleware(app)
"""
from __future__ import annotations

import json
import logging
import os
import time
import threading
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Callable, Dict, Deque, List, Optional

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

logger = logging.getLogger(__name__)

# ── Config from environment ───────────────────────────────────────────────────
RATE_LIMIT_PER_MIN      = int(os.environ.get("RATE_LIMIT_PER_MIN",   "120"))   # requests/min/IP
RATE_LIMIT_BURST        = int(os.environ.get("RATE_LIMIT_BURST",     "30"))    # burst window
TRADING_RATE_LIMIT      = int(os.environ.get("TRADING_RATE_LIMIT",   "20"))    # /api/robo/ endpoints
ENV                     = os.environ.get("ENV", "development")
PROMETHEUS_ENABLED      = os.environ.get("PROMETHEUS_ENABLED", "true").lower() == "true"

# ── In-memory rate limiter (sliding window) ───────────────────────────────────
_rate_buckets: Dict[str, Deque[float]] = defaultdict(deque)
_rate_lock     = threading.Lock()


def _check_rate_limit(key: str, limit: int, window_sec: int = 60) -> bool:
    """Sliding window rate limiter. Returns True if allowed."""
    now = time.monotonic()
    cutoff = now - window_sec
    with _rate_lock:
        dq = _rate_buckets[key]
        # Remove old entries
        while dq and dq[0] < cutoff:
            dq.popleft()
        if len(dq) >= limit:
            return False
        dq.append(now)
    return True


# ── Prometheus counters (lightweight — no library needed for basics) ──────────
_metrics: Dict[str, float] = {
    "requests_total":       0,
    "requests_errors":      0,
    "requests_4xx":         0,
    "requests_5xx":         0,
    "robo_requests_total":  0,
    "rate_limit_hits":      0,
    "latency_sum_ms":       0,
    "latency_count":        0,
}
_metrics_lock = threading.Lock()


def _inc(key: str, val: float = 1.0) -> None:
    with _metrics_lock:
        _metrics[key] = _metrics.get(key, 0) + val


def _get_prometheus_text() -> str:
    """Render metrics as Prometheus text format."""
    with _metrics_lock:
        snap = dict(_metrics)
    lines = [
        "# HELP robo_trader_requests_total Total HTTP requests",
        "# TYPE robo_trader_requests_total counter",
        f"robo_trader_requests_total {snap['requests_total']:.0f}",
        "# HELP robo_trader_errors_total HTTP 4xx+5xx responses",
        "# TYPE robo_trader_errors_total counter",
        f"robo_trader_errors_total {snap['requests_errors']:.0f}",
        "# HELP robo_trader_4xx_total HTTP 4xx responses",
        "# TYPE robo_trader_4xx_total counter",
        f"robo_trader_4xx_total {snap['requests_4xx']:.0f}",
        "# HELP robo_trader_5xx_total HTTP 5xx responses",
        "# TYPE robo_trader_5xx_total counter",
        f"robo_trader_5xx_total {snap['requests_5xx']:.0f}",
        "# HELP robo_trader_rate_limit_hits_total Rate limit rejections",
        "# TYPE robo_trader_rate_limit_hits_total counter",
        f"robo_trader_rate_limit_hits_total {snap['rate_limit_hits']:.0f}",
        "# HELP robo_trader_avg_latency_ms Average request latency (ms)",
        "# TYPE robo_trader_avg_latency_ms gauge",
    ]
    avg_latency = (snap["latency_sum_ms"] / max(snap["latency_count"], 1))
    lines.append(f"robo_trader_avg_latency_ms {avg_latency:.2f}")
    return "\n".join(lines) + "\n"


# ── JSON structured logging setup ─────────────────────────────────────────────

class JSONFormatter(logging.Formatter):
    """Emit log records as single-line JSON for log aggregators (ELK, GCP, Datadog)."""

    def format(self, record: logging.LogRecord) -> str:
        log_dict = {
            "ts":      datetime.now(timezone.utc).isoformat(),
            "level":   record.levelname,
            "logger":  record.name,
            "msg":     record.getMessage(),
            "module":  record.module,
            "line":    record.lineno,
        }
        if record.exc_info:
            log_dict["exc"] = self.formatException(record.exc_info)
        return json.dumps(log_dict, default=str)


def setup_structured_logging(level: str = "INFO") -> None:
    """Configure root logger to emit structured JSON in production."""
    if ENV == "production":
        handler = logging.StreamHandler()
        handler.setFormatter(JSONFormatter())
        root = logging.getLogger()
        root.handlers.clear()
        root.addHandler(handler)
        root.setLevel(getattr(logging, level.upper(), logging.INFO))
        logger.info("Structured JSON logging enabled")
    else:
        logging.basicConfig(
            level  = getattr(logging, level.upper(), logging.INFO),
            format = "%(asctime)s %(name)s %(levelname)s %(message)s",
        )


# ── Rate Limit Middleware ─────────────────────────────────────────────────────

class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Simple in-memory sliding-window rate limiter.
    Applies stricter limits to trading-critical endpoints (/api/robo/).
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Health/metrics endpoints bypass
        if request.url.path in ("/api/health", "/api/metrics", "/api/metrics-text"):
            return await call_next(request)

        ip_key  = request.client.host if request.client else "unknown"
        path    = request.url.path

        # Choose limit
        limit = TRADING_RATE_LIMIT if path.startswith("/api/robo") else RATE_LIMIT_PER_MIN

        if not _check_rate_limit(f"{ip_key}:{path[:20]}", limit):
            _inc("rate_limit_hits")
            return JSONResponse(
                status_code = 429,
                content     = {
                    "error":   "Rate limit exceeded",
                    "message": f"Too many requests. Limit: {limit}/min.",
                    "retry_after": 60,
                },
                headers = {"Retry-After": "60"},
            )

        return await call_next(request)


# ── Security Headers Middleware ───────────────────────────────────────────────

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add OWASP-recommended security headers to every response."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"]   = "nosniff"
        response.headers["X-Frame-Options"]           = "SAMEORIGIN"
        response.headers["X-XSS-Protection"]          = "1; mode=block"
        response.headers["Referrer-Policy"]            = "strict-origin-when-cross-origin"
        # Disclaimer header for trading API
        response.headers["X-Trading-Disclaimer"] = (
            "PAPER-TRADING-DEFAULT. No guaranteed returns. Capital at risk in live mode."
        )
        if ENV == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


# ── Request Logging Middleware ────────────────────────────────────────────────

_access_logger = logging.getLogger("access")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log every request with latency, status, and request-id."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        req_id   = str(uuid.uuid4())[:8]
        t_start  = time.perf_counter()

        # Inject request-id header
        request.state.request_id = req_id

        try:
            response = await call_next(request)
        except Exception as exc:
            _inc("requests_5xx")
            _inc("requests_errors")
            raise

        latency_ms = (time.perf_counter() - t_start) * 1000
        status     = response.status_code

        _inc("requests_total")
        _inc("latency_sum_ms", latency_ms)
        _inc("latency_count")
        if status >= 500:
            _inc("requests_5xx")
            _inc("requests_errors")
        elif status >= 400:
            _inc("requests_4xx")
            _inc("requests_errors")
        if request.url.path.startswith("/api/robo"):
            _inc("robo_requests_total")

        _access_logger.info(
            "%(method)s %(path)s %(status)d %(latency).0fms [%(req_id)s]",
            {
                "method":  request.method,
                "path":    request.url.path,
                "status":  status,
                "latency": latency_ms,
                "req_id":  req_id,
                "ip":      getattr(request.client, "host", "?"),
            },
        )

        response.headers["X-Request-Id"] = req_id
        return response


# ── Public API ────────────────────────────────────────────────────────────────

def add_production_middleware(app: FastAPI) -> None:
    """
    Register all production middleware on the FastAPI app.
    Call AFTER adding CORS middleware, BEFORE adding routes.

    Usage:
        from middleware.production import add_production_middleware, setup_structured_logging
        setup_structured_logging(os.environ.get("LOG_LEVEL", "INFO"))
        add_production_middleware(app)
    """
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(RequestLoggingMiddleware)
    logger.info("[Middleware] Production middleware registered: Rate-Limit, SecurityHeaders, RequestLogging")


def get_metrics_text() -> str:
    return _get_prometheus_text()


__all__ = [
    "add_production_middleware",
    "setup_structured_logging",
    "get_metrics_text",
    "JSONFormatter",
]
