"""Tests for Multi-AI Ensemble Decision Engine + AI Gann optimisation."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Read from frontend/.env as a fallback
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

TIMEOUT_LLM = 120  # LLM calls can take 5-30s each, ensemble has 3 in parallel


# ---------- Ensemble core ----------

class TestEnsembleStatus:
    def test_status(self):
        r = requests.get(f"{BASE_URL}/api/ensemble/status", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["provider_mode"] in ("emergent", "freellmapi")
        assert data["key_configured"] is True
        models = data["models"]
        assert len(models) == 3
        names = [m["display_name"] for m in models]
        assert "Claude Sonnet 4.5" in names
        assert "Gemini 3 Pro" in names
        assert "GPT-5.2" in names


class TestEnsembleAsk:
    def test_ask_free_form(self):
        payload = {"user_text": "NIFTY closed +1.2% on heavy volume after RBI rate hold. Quick verdict?"}
        r = requests.post(f"{BASE_URL}/api/ensemble/ask", json=payload, timeout=TIMEOUT_LLM)
        assert r.status_code == 200
        d = r.json()
        assert d["consensus"] in ("BUY", "SELL", "HOLD", "ABSTAIN")
        assert isinstance(d["confidence"], int)
        assert 0 <= d["confidence"] <= 100
        assert d["valid_voters"] >= 1, f"No model voted: {d}"
        assert isinstance(d["votes"], list) and len(d["votes"]) == 3
        for v in d["votes"]:
            assert "model" in v and "signal" in v and "confidence" in v and "rationale" in v


class TestEnsembleSignal:
    def test_signal_for_reliance(self):
        r = requests.post(
            f"{BASE_URL}/api/ensemble/signal",
            json={"ticker": "RELIANCE.NS"},
            timeout=TIMEOUT_LLM,
        )
        assert r.status_code == 200
        d = r.json()
        if not d.get("success"):
            pytest.skip(f"yfinance fetch likely failed: {d}")
        assert d["success"] is True
        assert d["ticker"] == "RELIANCE.NS"
        ctx = d["context"]
        for k in ("close", "ema20", "sma50", "trend"):
            assert k in ctx
        v = d["verdict"]
        assert v["consensus"] in ("BUY", "SELL", "HOLD", "ABSTAIN")
        assert len(v["votes"]) == 3


# ---------- Gann optimisation ----------

class TestGannOptimize:
    def test_gann_optimize_reliance(self):
        r = requests.post(
            f"{BASE_URL}/api/ensemble/gann-optimize",
            json={"ticker": "RELIANCE.NS"},
            timeout=TIMEOUT_LLM,
        )
        assert r.status_code == 200
        d = r.json()
        if not d.get("success"):
            pytest.skip(f"data fetch failed: {d}")
        assert d["success"] is True
        # chosen pivot
        cp = d["chosen_pivot"]
        assert "price" in cp and "type" in cp
        # active angles
        assert isinstance(d["active_angles"], list)
        assert 1 <= len(d["active_angles"]) <= 5
        # soq ring
        assert d["soq_ring"] in [8, 16, 24, 32]
        # gann fan
        assert isinstance(d["gann_fan"], list)
        # soq levels
        assert isinstance(d["soq_levels"], list) and len(d["soq_levels"]) > 0
        # ensemble verdict embedded
        ens = d["ensemble"]
        assert ens["consensus"] in ("BUY", "SELL", "HOLD", "ABSTAIN")
        assert "confidence" in ens


# ---------- Regression: existing endpoints unaffected ----------

class TestRegression:
    def test_stock_search(self):
        r = requests.get(f"{BASE_URL}/api/stock/search", params={"q": "RELIANCE"}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        # Could be {"results": [...]} or list directly
        results = d.get("results") if isinstance(d, dict) else d
        assert isinstance(results, list)

    def test_paper_trade_portfolio(self):
        r = requests.get(f"{BASE_URL}/api/paper-trade/portfolio", timeout=30)
        assert r.status_code == 200
        d = r.json()
        # initial_balance may be top-level or nested
        bal = d.get("initial_balance") or d.get("portfolio", {}).get("initial_balance")
        assert bal == 50000 or bal == 50000.0

    def test_rl_agent_status(self):
        r = requests.get(f"{BASE_URL}/api/rl-agent/status", timeout=30)
        assert r.status_code == 200
        d = r.json()
        status = d.get("status") or d.get("state")
        assert status in ("idle", "running", "training", "trained", "ready", "stopped")
