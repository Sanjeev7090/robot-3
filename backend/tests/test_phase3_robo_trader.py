"""
Phase 3 Robo-Trader Backend Tests
===================================
Tests for Phase 3 endpoints:
  - GET  /api/robo/loop-status
  - GET  /api/robo/positions
  - GET  /api/robo/orders
  - POST /api/robo/mode (paper, shadow, live)
  - POST /api/robo/set-interval
  - POST /api/robo/start
  - POST /api/robo/stop
  - POST /api/robo/close-all
  - GET  /api/robo/status
  - GET  /api/robo/settings
"""

import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


@pytest.fixture
def client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


# ── Phase 3: GET /api/robo/loop-status ────────────────────────────────────────

class TestLoopStatus:
    """Trading loop status endpoint"""

    def test_loop_status_returns_200(self, client):
        """GET /api/robo/loop-status returns HTTP 200"""
        res = client.get(f"{BASE_URL}/api/robo/loop-status")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        print("PASS: loop-status returns 200")

    def test_loop_status_structure(self, client):
        """loop-status returns success, loop object, exec_stats"""
        res = client.get(f"{BASE_URL}/api/robo/loop-status")
        data = res.json()
        assert data.get("success") is True, f"success not True: {data}"
        assert "loop" in data, f"'loop' key missing: {data}"
        assert "exec_stats" in data, f"'exec_stats' key missing: {data}"
        print("PASS: loop-status has required keys")

    def test_loop_status_loop_fields(self, client):
        """loop object contains running, interval_minutes, cycle_count, market_open"""
        res = client.get(f"{BASE_URL}/api/robo/loop-status")
        loop = res.json().get("loop", {})
        for field in ["running", "interval_minutes", "cycle_count", "market_open"]:
            assert field in loop, f"loop missing field '{field}': {loop}"
        assert isinstance(loop["running"], bool), "running should be bool"
        assert isinstance(loop["cycle_count"], int), "cycle_count should be int"
        print(f"PASS: loop fields verified | running={loop['running']} interval={loop['interval_minutes']} cycles={loop['cycle_count']}")


# ── Phase 3: GET /api/robo/positions ──────────────────────────────────────────

class TestPositions:
    """Open positions endpoint"""

    def test_positions_returns_200(self, client):
        res = client.get(f"{BASE_URL}/api/robo/positions")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        print("PASS: positions returns 200")

    def test_positions_structure(self, client):
        """positions returns success, mode, open_positions list"""
        res = client.get(f"{BASE_URL}/api/robo/positions")
        data = res.json()
        assert data.get("success") is True, f"success not True: {data}"
        assert "open_positions" in data, f"'open_positions' missing: {data}"
        assert "mode" in data, f"'mode' missing: {data}"
        assert isinstance(data["open_positions"], list), "open_positions should be list"
        print(f"PASS: positions structure verified | mode={data['mode']} open_count={len(data['open_positions'])}")


# ── Phase 3: GET /api/robo/orders ─────────────────────────────────────────────

class TestOrders:
    """Order history endpoint"""

    def test_orders_returns_200(self, client):
        res = client.get(f"{BASE_URL}/api/robo/orders")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        print("PASS: orders returns 200")

    def test_orders_structure(self, client):
        """orders returns success, orders list, daily_pnl, win_rate"""
        res = client.get(f"{BASE_URL}/api/robo/orders")
        data = res.json()
        assert data.get("success") is True, f"success not True: {data}"
        assert "orders" in data, f"'orders' missing: {data}"
        assert "daily_pnl" in data, f"'daily_pnl' missing: {data}"
        assert "win_rate" in data, f"'win_rate' missing: {data}"
        assert isinstance(data["orders"], list), "orders should be list"
        print(f"PASS: orders structure verified | count={data.get('count')} daily_pnl={data.get('daily_pnl')}")


# ── Phase 3: POST /api/robo/mode ──────────────────────────────────────────────

class TestModeSwitch:
    """Execution mode switching"""

    def test_mode_paper_returns_success(self, client):
        """POST /api/robo/mode {mode:'paper'} → success:true, mode:paper"""
        res = client.post(f"{BASE_URL}/api/robo/mode", json={"mode": "paper"})
        assert res.status_code == 200, f"Expected 200: {res.text}"
        data = res.json()
        assert data.get("success") is True, f"success not True: {data}"
        assert data.get("mode") == "paper", f"mode != 'paper': {data}"
        print(f"PASS: mode paper | {data}")

    def test_mode_shadow_returns_success(self, client):
        """POST /api/robo/mode {mode:'shadow'} → success:true, mode:shadow"""
        res = client.post(f"{BASE_URL}/api/robo/mode", json={"mode": "shadow"})
        assert res.status_code == 200, f"Expected 200: {res.text}"
        data = res.json()
        assert data.get("success") is True, f"success not True: {data}"
        assert data.get("mode") == "shadow", f"mode != 'shadow': {data}"
        print(f"PASS: mode shadow | {data}")

    def test_mode_live_fails_without_api_key(self, client):
        """POST /api/robo/mode {mode:'live'} should FAIL with error about missing GROWW_API_KEY"""
        res = client.post(f"{BASE_URL}/api/robo/mode", json={"mode": "live"})
        assert res.status_code == 200, f"Expected 200: {res.text}"
        data = res.json()
        # Live mode should fail because GROWW_API_KEY is not set
        assert data.get("success") is False, f"Expected failure for live mode (no GROWW_API_KEY), got: {data}"
        error_msg = data.get("error", "")
        assert "GROWW" in error_msg.upper() or "api" in error_msg.lower() or "key" in error_msg.lower(), \
            f"Error message should mention GROWW/API key: {error_msg}"
        print(f"PASS: live mode fails gracefully | error='{error_msg[:80]}'")

    def test_mode_invalid_returns_failure(self, client):
        """POST /api/robo/mode with invalid mode returns error"""
        res = client.post(f"{BASE_URL}/api/robo/mode", json={"mode": "invalid"})
        assert res.status_code == 200, f"Expected 200: {res.text}"
        data = res.json()
        assert data.get("success") is False, f"Should fail for invalid mode: {data}"
        print(f"PASS: invalid mode rejected | error='{data.get('error', '')[:60]}'")

    def teardown_method(self, method):
        """Reset to paper mode after each test"""
        try:
            requests.post(f"{BASE_URL}/api/robo/mode", json={"mode": "paper"})
        except Exception:
            pass


# ── Phase 3: POST /api/robo/set-interval ──────────────────────────────────────

class TestSetInterval:
    """Scan interval setting"""

    def test_set_interval_10(self, client):
        """POST /api/robo/set-interval {interval_minutes:10} → success:true, interval_minutes:10"""
        res = client.post(f"{BASE_URL}/api/robo/set-interval", json={"interval_minutes": 10})
        assert res.status_code == 200, f"Expected 200: {res.text}"
        data = res.json()
        assert data.get("success") is True, f"success not True: {data}"
        assert data.get("interval_minutes") == 10, f"interval_minutes != 10: {data}"
        print(f"PASS: set-interval 10 | {data}")

    def test_set_interval_5_reset(self, client):
        """Reset interval back to 5"""
        res = client.post(f"{BASE_URL}/api/robo/set-interval", json={"interval_minutes": 5})
        assert res.status_code == 200, f"Expected 200: {res.text}"
        data = res.json()
        assert data.get("success") is True, f"success not True: {data}"
        print(f"PASS: set-interval 5 | {data}")

    def test_set_interval_boundary_max(self, client):
        """Interval capped at 30"""
        res = client.post(f"{BASE_URL}/api/robo/set-interval", json={"interval_minutes": 30})
        assert res.status_code == 200, f"Expected 200: {res.text}"
        data = res.json()
        assert data.get("success") is True, f"success not True: {data}"
        print(f"PASS: set-interval 30 (max boundary) | {data}")


# ── Phase 3: POST /api/robo/start ─────────────────────────────────────────────

class TestStartStop:
    """Trading loop start and stop"""

    def test_start_loop_success(self, client):
        """POST /api/robo/start {ticker:'RELIANCE.NS', interval_minutes:5} → success:true"""
        # Ensure stopped first
        client.post(f"{BASE_URL}/api/robo/stop")
        time.sleep(0.5)

        res = client.post(f"{BASE_URL}/api/robo/start",
                          json={"ticker": "RELIANCE.NS", "interval_minutes": 5})
        assert res.status_code == 200, f"Expected 200: {res.text}"
        data = res.json()
        assert data.get("success") is True, f"success not True: {data}"
        print(f"PASS: start loop | {data}")

    def test_loop_status_running_after_start(self, client):
        """After start, loop-status should show running=True"""
        # Ensure running
        client.post(f"{BASE_URL}/api/robo/start",
                    json={"ticker": "RELIANCE.NS", "interval_minutes": 5})
        time.sleep(0.5)

        res = client.get(f"{BASE_URL}/api/robo/loop-status")
        loop = res.json().get("loop", {})
        assert loop.get("running") is True, f"Loop should be running: {loop}"
        print(f"PASS: loop running after start | running={loop.get('running')}")

    def test_stop_loop_success(self, client):
        """POST /api/robo/stop → success:true"""
        res = client.post(f"{BASE_URL}/api/robo/stop")
        assert res.status_code == 200, f"Expected 200: {res.text}"
        data = res.json()
        assert data.get("success") is True, f"success not True: {data}"
        print(f"PASS: stop loop | {data}")

    def test_loop_stopped_after_stop(self, client):
        """After stop, loop-status should show running=False"""
        client.post(f"{BASE_URL}/api/robo/stop")
        time.sleep(0.5)

        res = client.get(f"{BASE_URL}/api/robo/loop-status")
        loop = res.json().get("loop", {})
        assert loop.get("running") is False, f"Loop should be stopped: {loop}"
        print(f"PASS: loop stopped | running={loop.get('running')}")

    def test_double_start_fails(self, client):
        """Starting loop twice should fail"""
        client.post(f"{BASE_URL}/api/robo/stop")
        time.sleep(0.3)
        client.post(f"{BASE_URL}/api/robo/start",
                    json={"ticker": "RELIANCE.NS", "interval_minutes": 5})
        time.sleep(0.3)
        res = client.post(f"{BASE_URL}/api/robo/start",
                          json={"ticker": "RELIANCE.NS", "interval_minutes": 5})
        data = res.json()
        # Should return success=False because already running
        assert data.get("success") is False, f"Double start should fail: {data}"
        print(f"PASS: double start rejected | error='{data.get('error','')[:60]}'")

    def teardown_method(self, method):
        """Ensure loop is stopped after each test"""
        try:
            requests.post(f"{BASE_URL}/api/robo/stop")
        except Exception:
            pass


# ── Phase 3: POST /api/robo/close-all ─────────────────────────────────────────

class TestCloseAll:
    """Emergency close-all positions"""

    def test_close_all_returns_success(self, client):
        """POST /api/robo/close-all → success:true, closed_count:0 (no open positions)"""
        res = client.post(f"{BASE_URL}/api/robo/close-all")
        assert res.status_code == 200, f"Expected 200: {res.text}"
        data = res.json()
        assert data.get("success") is True, f"success not True: {data}"
        assert "closed_count" in data, f"'closed_count' missing: {data}"
        assert isinstance(data["closed_count"], int), "closed_count should be int"
        print(f"PASS: close-all | closed_count={data.get('closed_count')}")

    def test_close_all_closed_count_zero_no_positions(self, client):
        """With no open positions, close-all returns closed_count=0"""
        res = client.post(f"{BASE_URL}/api/robo/close-all")
        data = res.json()
        assert data.get("closed_count") == 0, f"Expected 0 closed (no positions): {data}"
        print("PASS: close-all closed_count=0 when no positions")


# ── Phase 1+2 validation: GET /api/robo/status ────────────────────────────────

class TestRoboStatus:
    """Robo status endpoint — Phase 1+2 fields still working"""

    def test_status_returns_200(self, client):
        res = client.get(f"{BASE_URL}/api/robo/status")
        assert res.status_code == 200, f"Expected 200: {res.text}"
        print("PASS: robo/status returns 200")

    def test_status_has_required_fields(self, client):
        """status has auto_mode, status, mode, daily_pnl fields"""
        res = client.get(f"{BASE_URL}/api/robo/status")
        data = res.json()
        assert data.get("success") is True, f"success not True: {data}"
        for field in ["auto_mode", "status", "mode", "daily_pnl"]:
            assert field in data, f"field '{field}' missing in status: {list(data.keys())}"
        print(f"PASS: status fields | mode={data.get('mode')} auto_mode={data.get('auto_mode')} status={data.get('status')}")


# ── GET /api/robo/settings ─────────────────────────────────────────────────────

class TestRoboSettings:
    """Settings endpoint"""

    def test_settings_returns_200(self, client):
        res = client.get(f"{BASE_URL}/api/robo/settings")
        assert res.status_code == 200, f"Expected 200: {res.text}"
        print("PASS: robo/settings returns 200")

    def test_settings_has_required_fields(self, client):
        """settings returns daily_profit_target, allocated_capital, risk_profile"""
        res = client.get(f"{BASE_URL}/api/robo/settings")
        data = res.json()
        assert data.get("success") is True, f"success not True: {data}"
        prefs = data.get("preferences", {})
        for field in ["daily_profit_target", "allocated_capital", "risk_tolerance"]:
            assert field in prefs, f"preferences missing '{field}': {prefs}"
        assert "risk_profile" in data, f"'risk_profile' missing: {list(data.keys())}"
        print(f"PASS: settings verified | target={prefs.get('daily_profit_target')} capital={prefs.get('allocated_capital')}")
