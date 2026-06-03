"""
Moneycontrol Movers backend tests
Tests: GET /api/moneycontrol/movers, POST /api/moneycontrol/run,
       GET /api/moneycontrol/history, GET /api/moneycontrol/status
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


# ─── GET /api/moneycontrol/movers ─────────────────────────────────────────────
class TestMoneycontrolMovers:
    """Tests for GET /api/moneycontrol/movers"""

    def test_movers_returns_200(self):
        """GET /movers should return 200"""
        r = requests.get(f"{BASE_URL}/api/moneycontrol/movers")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:200]}"

    def test_movers_response_structure(self):
        """Response must have date, stocks, source, status, signals_ready_at"""
        r = requests.get(f"{BASE_URL}/api/moneycontrol/movers")
        assert r.status_code == 200
        d = r.json()
        for field in ["date", "stocks", "source", "status", "signals_ready_at"]:
            assert field in d, f"Missing field: {field}"

    def test_movers_stocks_count(self):
        """Should return 3 stocks (demo or yfinance fallback)"""
        r = requests.get(f"{BASE_URL}/api/moneycontrol/movers")
        assert r.status_code == 200
        d = r.json()
        stocks = d.get("stocks", [])
        assert len(stocks) >= 1, f"Expected >=1 stock, got {len(stocks)}"
        assert len(stocks) <= 3, f"Expected <=3 stocks, got {len(stocks)}"

    def test_movers_source_valid(self):
        """Source must be one of: demo, yfinance_fallback, moneycontrol"""
        r = requests.get(f"{BASE_URL}/api/moneycontrol/movers")
        assert r.status_code == 200
        d = r.json()
        assert d["source"] in ["demo", "yfinance_fallback", "moneycontrol"], (
            f"Unexpected source: {d['source']}"
        )

    def test_movers_stock_fields(self):
        """Each stock must have symbol, company_name, current_price, weekly_change_pct, atm_info"""
        r = requests.get(f"{BASE_URL}/api/moneycontrol/movers")
        assert r.status_code == 200
        d = r.json()
        stocks = d.get("stocks", [])
        assert len(stocks) > 0, "No stocks returned"
        for stock in stocks:
            for field in ["symbol", "company_name", "current_price", "weekly_change_pct", "atm_info"]:
                assert field in stock, f"Stock missing field: {field}"

    def test_movers_atm_info_fields(self):
        """atm_info must have strike, ltp, sl_price, target_price, signal"""
        r = requests.get(f"{BASE_URL}/api/moneycontrol/movers")
        assert r.status_code == 200
        d = r.json()
        stocks = d.get("stocks", [])
        assert len(stocks) > 0
        atm = stocks[0].get("atm_info", {})
        for field in ["atm_strike", "option_ltp", "sl_price", "target_price", "signal", "sl_pct", "target_pct"]:
            assert field in atm, f"atm_info missing field: {field}"

    def test_movers_atm_signal_value(self):
        """Signal should be 'BUY ATM CALL'"""
        r = requests.get(f"{BASE_URL}/api/moneycontrol/movers")
        assert r.status_code == 200
        d = r.json()
        stocks = d.get("stocks", [])
        assert len(stocks) > 0
        atm = stocks[0].get("atm_info", {})
        assert atm.get("signal") == "BUY ATM CALL", f"Unexpected signal: {atm.get('signal')}"

    def test_movers_sl_pct_10(self):
        """SL should be 10%"""
        r = requests.get(f"{BASE_URL}/api/moneycontrol/movers")
        assert r.status_code == 200
        d = r.json()
        stocks = d.get("stocks", [])
        assert len(stocks) > 0
        atm = stocks[0].get("atm_info", {})
        assert atm.get("sl_pct") == 10, f"SL pct should be 10, got: {atm.get('sl_pct')}"

    def test_movers_target_pct_20(self):
        """Target should be 20%"""
        r = requests.get(f"{BASE_URL}/api/moneycontrol/movers")
        assert r.status_code == 200
        d = r.json()
        stocks = d.get("stocks", [])
        assert len(stocks) > 0
        atm = stocks[0].get("atm_info", {})
        assert atm.get("target_pct") == 20, f"Target pct should be 20, got: {atm.get('target_pct')}"

    def test_movers_current_price_positive(self):
        """current_price should be positive for all stocks"""
        r = requests.get(f"{BASE_URL}/api/moneycontrol/movers")
        assert r.status_code == 200
        d = r.json()
        for stock in d.get("stocks", []):
            assert stock["current_price"] > 0, f"Stock {stock['symbol']} has non-positive price"

    def test_movers_status_completed(self):
        """Status must be 'completed'"""
        r = requests.get(f"{BASE_URL}/api/moneycontrol/movers")
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "completed", f"Unexpected status: {d['status']}"


# ─── POST /api/moneycontrol/run ───────────────────────────────────────────────
class TestMoneycontrolRun:
    """Tests for POST /api/moneycontrol/run (manual trigger)"""

    def test_run_returns_200(self):
        """POST /run should return 200"""
        r = requests.post(f"{BASE_URL}/api/moneycontrol/run", timeout=60)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:300]}"

    def test_run_response_structure(self):
        """Response must have status, message, result"""
        r = requests.post(f"{BASE_URL}/api/moneycontrol/run", timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert "status" in d, "Missing 'status'"
        assert "message" in d, "Missing 'message'"
        assert "result" in d, "Missing 'result'"

    def test_run_result_has_stocks(self):
        """Result must have stocks array with >=1 stock"""
        r = requests.post(f"{BASE_URL}/api/moneycontrol/run", timeout=60)
        assert r.status_code == 200
        d = r.json()
        result = d.get("result", {})
        stocks = result.get("stocks", [])
        assert len(stocks) >= 1, f"Expected at least 1 stock, got {len(stocks)}"

    def test_run_persists_to_mongodb(self):
        """After run, GET /movers should return today's data"""
        # Trigger run
        run_r = requests.post(f"{BASE_URL}/api/moneycontrol/run", timeout=60)
        assert run_r.status_code == 200
        run_data = run_r.json().get("result", {})

        # Fetch movers
        get_r = requests.get(f"{BASE_URL}/api/moneycontrol/movers")
        assert get_r.status_code == 200
        get_data = get_r.json()

        # Should have same date
        assert get_data["date"] == run_data["date"], (
            f"Date mismatch after run: run={run_data['date']}, movers={get_data['date']}"
        )

    def test_run_result_source_valid(self):
        """Result source must be demo, yfinance_fallback, or moneycontrol"""
        r = requests.post(f"{BASE_URL}/api/moneycontrol/run", timeout=60)
        assert r.status_code == 200
        d = r.json()
        result = d.get("result", {})
        assert result.get("source") in ["demo", "yfinance_fallback", "moneycontrol"], (
            f"Invalid source: {result.get('source')}"
        )

    def test_run_result_stocks_have_atm_info(self):
        """After run, stocks should have atm_info enrichment"""
        r = requests.post(f"{BASE_URL}/api/moneycontrol/run", timeout=60)
        assert r.status_code == 200
        d = r.json()
        stocks = d.get("result", {}).get("stocks", [])
        assert len(stocks) > 0
        for stock in stocks:
            assert "atm_info" in stock, f"Stock {stock.get('symbol')} missing atm_info"
            atm = stock["atm_info"]
            assert "atm_strike" in atm
            assert "option_ltp" in atm


# ─── GET /api/moneycontrol/history ───────────────────────────────────────────
class TestMoneycontrolHistory:
    """Tests for GET /api/moneycontrol/history"""

    def test_history_returns_200(self):
        """GET /history should return 200"""
        r = requests.get(f"{BASE_URL}/api/moneycontrol/history")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:200]}"

    def test_history_response_structure(self):
        """Response must have count and history fields"""
        r = requests.get(f"{BASE_URL}/api/moneycontrol/history")
        assert r.status_code == 200
        d = r.json()
        assert "count" in d, "Missing 'count'"
        assert "history" in d, "Missing 'history'"
        assert isinstance(d["history"], list), "history must be a list"

    def test_history_after_run_has_record(self):
        """After triggering run, history should have at least 1 record"""
        # Ensure a run has happened
        requests.post(f"{BASE_URL}/api/moneycontrol/run", timeout=60)

        r = requests.get(f"{BASE_URL}/api/moneycontrol/history?limit=30")
        assert r.status_code == 200
        d = r.json()
        assert d["count"] >= 1, f"History count should be >=1 after run, got {d['count']}"

    def test_history_record_fields(self):
        """Each history record should have date, stocks, source"""
        # Ensure run has happened
        requests.post(f"{BASE_URL}/api/moneycontrol/run", timeout=60)

        r = requests.get(f"{BASE_URL}/api/moneycontrol/history?limit=5")
        assert r.status_code == 200
        d = r.json()
        history = d.get("history", [])
        if len(history) > 0:
            rec = history[0]
            for field in ["date", "stocks", "source", "status"]:
                assert field in rec, f"History record missing field: {field}"

    def test_history_limit_param(self):
        """Limit parameter should constrain results"""
        r = requests.get(f"{BASE_URL}/api/moneycontrol/history?limit=5")
        assert r.status_code == 200
        d = r.json()
        assert len(d.get("history", [])) <= 5, "History should respect limit=5"


# ─── GET /api/moneycontrol/status ────────────────────────────────────────────
class TestMoneycontrolStatus:
    """Tests for GET /api/moneycontrol/status"""

    def test_status_returns_200(self):
        """GET /status should return 200"""
        r = requests.get(f"{BASE_URL}/api/moneycontrol/status")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:200]}"

    def test_status_scheduler_active(self):
        """scheduler_active must be a boolean (True if APScheduler started)"""
        r = requests.get(f"{BASE_URL}/api/moneycontrol/status")
        assert r.status_code == 200
        d = r.json()
        assert "scheduler_active" in d
        assert isinstance(d["scheduler_active"], bool)

    def test_status_next_run_shown(self):
        """next_run must be present"""
        r = requests.get(f"{BASE_URL}/api/moneycontrol/status")
        assert r.status_code == 200
        d = r.json()
        assert "next_run" in d
        assert d["next_run"], "next_run should not be empty"

    def test_status_total_records_int(self):
        """total_records must be a non-negative integer"""
        r = requests.get(f"{BASE_URL}/api/moneycontrol/status")
        assert r.status_code == 200
        d = r.json()
        assert "total_records" in d
        assert isinstance(d["total_records"], int)
        assert d["total_records"] >= 0

    def test_status_scheduler_active_true(self):
        """Scheduler should be running (started on module load)"""
        r = requests.get(f"{BASE_URL}/api/moneycontrol/status")
        assert r.status_code == 200
        d = r.json()
        assert d["scheduler_active"] is True, (
            f"scheduler_active should be True but got: {d['scheduler_active']}"
        )
