"""
Telegram Notifier — Phase 5
============================
Lightweight trade notifications via Telegram Bot API.
Uses only `requests` (already installed). No extra library needed.

Configuration (.env):
    TELEGRAM_BOT_TOKEN = 123456789:AAxxxxxxxxxxxxxxxx
    TELEGRAM_CHAT_ID   = -1001234567890   (or your personal chat ID)

Get bot token: https://t.me/BotFather
Get chat ID:   https://t.me/userinfobot  or  @RawDataBot

Notifications sent for:
  • Trade opened (entry price, SL, TP, confidence)
  • Trade closed (P&L, exit reason)
  • Daily target reached
  • Circuit breaker triggered
  • Auto mode start/stop
  • Error alerts

DISCLAIMER: Telegram is a third-party service. Notifications are best-effort.
No sensitive financial data (PAN, bank) should be sent via Telegram.
"""
from __future__ import annotations

import logging
import os
import threading
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import requests

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
_BOT_TOKEN: Optional[str] = None
_CHAT_ID:   Optional[str] = None
_ENABLED:   bool          = False


def init_telegram() -> bool:
    """
    Initialise from environment. Call once at startup.
    Returns True if both token and chat_id are configured.
    """
    global _BOT_TOKEN, _CHAT_ID, _ENABLED
    _BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    _CHAT_ID   = os.environ.get("TELEGRAM_CHAT_ID",   "").strip()
    _ENABLED   = bool(_BOT_TOKEN and _CHAT_ID)
    if _ENABLED:
        logger.info("[Telegram] Notifications ENABLED (chat_id=%s)", _CHAT_ID)
    else:
        logger.info("[Telegram] Notifications DISABLED (TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set)")
    return _ENABLED


def _send_async(text: str) -> None:
    """Fire-and-forget: send in a daemon thread so it never blocks the main loop."""
    def _worker():
        try:
            url = f"https://api.telegram.org/bot{_BOT_TOKEN}/sendMessage"
            requests.post(
                url,
                json    = {"chat_id": _CHAT_ID, "text": text, "parse_mode": "HTML"},
                timeout = 5,
            )
        except Exception as exc:
            logger.debug("[Telegram] Send failed: %s", exc)

    t = threading.Thread(target=_worker, daemon=True)
    t.start()


def send(text: str) -> None:
    """Send a raw message. No-op if not configured."""
    if not _ENABLED:
        return
    _send_async(text)


# ── Formatted notification helpers ────────────────────────────────────────────

def _now_ist() -> str:
    """Current time as IST string."""
    from datetime import timedelta
    ist = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    return ist.strftime("%d %b %H:%M IST")


def notify_trade_opened(order: Dict[str, Any]) -> None:
    """Notify when a new position is opened."""
    direction = order.get("direction", "?")
    ticker    = order.get("ticker",    "?")
    qty       = order.get("quantity",  0)
    entry     = order.get("entry_price",  0)
    sl        = order.get("sl_price",     0)
    tp        = order.get("tp_price",     0)
    conf      = order.get("confidence",   0)
    mode      = (order.get("mode") or "paper").upper()
    oid       = order.get("order_id",     "?")

    emoji = "🟢" if direction == "BUY" else "🔴"
    mode_tag = "📄 PAPER" if mode == "PAPER" else ("👁 SHADOW" if mode == "SHADOW" else "🔴 LIVE")

    text = (
        f"{emoji} <b>TRADE OPENED</b>\n"
        f"━━━━━━━━━━━━━━\n"
        f"<b>{direction}</b> {ticker} × {qty}\n"
        f"Entry: ₹{entry:,.0f}  |  {_now_ist()}\n"
        f"SL: ₹{sl:,.0f}  TP: ₹{tp:,.0f}\n"
        f"Confidence: {conf:.0f}%  |  {mode_tag}\n"
        f"<code>#{oid}</code>\n"
        f"<i>⚠️ No guaranteed returns</i>"
    )
    send(text)
    logger.info("[Telegram] Trade opened notification sent: %s %s", direction, ticker)


def notify_trade_closed(order: Dict[str, Any]) -> None:
    """Notify when a position is closed with P&L."""
    direction  = order.get("direction",   "?")
    ticker     = order.get("ticker",      "?")
    pnl        = order.get("net_pnl") or order.get("pnl") or 0
    pnl_pct    = order.get("pnl_pct",     0) or 0
    exit_price = order.get("exit_price",  0)
    reason     = order.get("exit_reason", "?")
    oid        = order.get("order_id",    "?")

    emoji = "✅" if pnl >= 0 else "❌"
    pnl_str = f"+₹{pnl:,.0f}" if pnl >= 0 else f"-₹{abs(pnl):,.0f}"
    reason_labels = {
        "TP": "Take Profit hit",
        "SL": "Stop Loss hit",
        "EOD": "End of Day close",
        "CIRCUIT_BREAKER": "Circuit Breaker",
        "MANUAL": "Manual close",
        "EMERGENCY_CLOSE": "Emergency close",
    }

    text = (
        f"{emoji} <b>TRADE CLOSED</b>\n"
        f"━━━━━━━━━━━━━━\n"
        f"<b>{direction}</b> {ticker}\n"
        f"Exit: ₹{exit_price:,.0f}  |  {_now_ist()}\n"
        f"Net P&L: <b>{pnl_str}</b> ({pnl_pct:+.2f}%)\n"
        f"Reason: {reason_labels.get(reason, reason)}\n"
        f"<code>#{oid}</code>"
    )
    send(text)


def notify_circuit_breaker(reason: str) -> None:
    """Alert when circuit breaker trips."""
    text = (
        f"⚡ <b>CIRCUIT BREAKER TRIPPED</b>\n"
        f"━━━━━━━━━━━━━━\n"
        f"Reason: {reason}\n"
        f"Time: {_now_ist()}\n"
        f"<b>All positions closed. Auto mode paused.</b>\n"
        f"<i>Review risk settings before restarting.</i>"
    )
    send(text)
    logger.warning("[Telegram] Circuit breaker notification sent: %s", reason)


def notify_daily_target_reached(pnl: float, target: float) -> None:
    """Celebrate when daily P&L target is reached."""
    pct = (pnl / max(target, 1)) * 100
    text = (
        f"🎯 <b>DAILY TARGET REACHED!</b>\n"
        f"━━━━━━━━━━━━━━\n"
        f"P&L: <b>+₹{pnl:,.0f}</b> / Target ₹{target:,.0f}\n"
        f"Achieved: {pct:.0f}%  |  {_now_ist()}\n"
        f"<i>Consider stopping auto mode to protect profits.</i>\n"
        f"<i>⚠️ No guaranteed returns. Past performance ≠ future results.</i>"
    )
    send(text)


def notify_auto_mode_changed(started: bool, ticker: str, mode: str) -> None:
    """Notify when auto mode is started or stopped."""
    if started:
        mode_label = "📄 PAPER" if mode == "paper" else ("👁 SHADOW" if mode == "shadow" else "🔴 LIVE")
        text = (
            f"▶️ <b>AUTO MODE STARTED</b>\n"
            f"━━━━━━━━━━━━━━\n"
            f"Ticker: {ticker}  |  {mode_label}\n"
            f"Time: {_now_ist()}\n"
            f"<i>DreamerV3 scanning market every few minutes.</i>\n"
            f"<i>⚠️ No guaranteed returns.</i>"
        )
    else:
        text = (
            f"⏹ <b>AUTO MODE STOPPED</b>\n"
            f"━━━━━━━━━━━━━━\n"
            f"Ticker: {ticker}  |  Time: {_now_ist()}"
        )
    send(text)


def notify_error(component: str, error: str) -> None:
    """Alert on critical system errors."""
    text = (
        f"🚨 <b>SYSTEM ERROR</b>\n"
        f"━━━━━━━━━━━━━━\n"
        f"Component: {component}\n"
        f"Error: {error[:200]}\n"
        f"Time: {_now_ist()}"
    )
    send(text)


def send_test_message() -> bool:
    """Send a test message to verify Telegram config. Returns True if enabled."""
    if not _ENABLED:
        return False
    send(
        f"✅ <b>Dreamer V3 Robo-Trader</b>\n"
        f"Telegram notifications connected!\n"
        f"Time: {_now_ist()}\n"
        f"<i>Paper trading default. No real orders.</i>"
    )
    return True


# ── Auto-init on import ───────────────────────────────────────────────────────
init_telegram()

__all__ = [
    "init_telegram", "send", "send_test_message",
    "notify_trade_opened", "notify_trade_closed",
    "notify_circuit_breaker", "notify_daily_target_reached",
    "notify_auto_mode_changed", "notify_error",
]
