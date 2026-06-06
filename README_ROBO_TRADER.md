# Dreamer V3 Robo-Trader 🤖
### Institutional-Grade Autonomous Trading Engine — Complete Setup & Deployment Guide

> **⚠️ DISCLAIMER — READ FIRST**
> This software is for **EDUCATIONAL / PAPER TRADING purposes only**.
> No guaranteed returns. Past performance ≠ future results.
> Live trading involves REAL capital at risk — you can lose all your money.
> Always consult a SEBI-registered investment advisor before live trading.
> The authors accept NO liability for financial losses.

---

## Table of Contents
1. [Architecture Overview](#architecture)
2. [Quick Start (Local)](#quick-start)
3. [Docker Deployment](#docker-deployment)
4. [Environment Variables](#environment-variables)
5. [Phases 1–5 Summary](#phases)
6. [API Reference](#api-reference)
7. [Testing Guide](#testing)
8. [Telegram Notifications Setup](#telegram)
9. [Groww Live Mode Setup](#live-trading)
10. [Production Checklist](#production)
11. [Legal & Compliance](#legal)

---

## Architecture {#architecture}

```
┌─────────────────────────────────────────────────────────────────┐
│                  Dreamer V3 Robo-Trader                         │
│                                                                 │
│  Frontend (React 19)         Backend (FastAPI + Python 3.11)   │
│  ┌──────────────────┐        ┌────────────────────────────┐    │
│  │ RoboAdvisorDash  │◄──────►│ Orchestrator (Phase 1)     │    │
│  │ AgentStatusPanel │  REST  │ RiskPortfolioMgr (Phase 2) │    │
│  │ TradeExplain     │  3s    │ ExecutionEngine (Phase 3)  │    │
│  │ TargetSettings   │  poll  │ TradingLoop/APScheduler    │    │
│  └──────────────────┘        │ Telegram Notifier (Phase 5)│    │
│                              └──────────┬───────────────────┘    │
│                                         │                        │
│                              ┌──────────┼──────────┐            │
│                              │  MongoDB │  Groww   │            │
│                              │  (data)  │  (live)  │            │
│                              └──────────┴──────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

### Agent Pipeline (4 layers)
```
Market Data (yfinance/Groww)
    ↓
[1] Perception Layer    → regime detection, ATR, RSI, volume ratio
    ↓
[2] DreamerV3 RSSM     → world model prediction, confidence 0-100
    ↓
[3] Risk Portfolio Mgr  → Kelly criterion, VaR/CVaR, position sizing
    ↓
[4] Execution Engine    → paper / live (Groww) / shadow mode
```

---

## Quick Start (Local) {#quick-start}

### Prerequisites
- Python 3.11+
- Node 20+ (with Yarn)
- MongoDB 7.0 (local or Atlas)

### 1. Clone and configure

```bash
git clone <your-repo>
cd dreamer-v3-robo-trader
cp .env.example backend/.env
cp .env.example frontend/.env
```

Edit `backend/.env`:
```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=trading_db
```

Edit `frontend/.env`:
```env
REACT_APP_BACKEND_URL=http://localhost:8001
```

### 2. Start Backend

```bash
cd backend
pip install -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

### 3. Start Frontend

```bash
cd frontend
yarn install
yarn start
```

### 4. Open App
Visit `http://localhost:3000` → Click the **🤖 ROBO** tab → Start Paper Trading

---

## Docker Deployment {#docker-deployment}

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env — fill in any optional keys (Telegram, Groww, etc.)

# 2. Start all services
docker compose up -d

# 3. View logs
docker compose logs -f backend

# 4. Check health
curl http://localhost:8001/api/health

# 5. Open app
open http://localhost:3000

# Stop all
docker compose down

# Wipe data (caution!)
docker compose down -v
```

### Production deployment extras

```bash
# Build with production env
REACT_APP_BACKEND_URL=https://your-domain.com docker compose up -d --build

# View metrics (Prometheus format)
curl http://localhost:8001/api/metrics

# Nginx SSL (recommended for production)
# Add certbot or Cloudflare proxy in front of port 80
```

---

## Environment Variables {#environment-variables}

| Variable | Required | Default | Description |
|---|---|---|---|
| `MONGO_URL` | ✅ | — | MongoDB connection string |
| `DB_NAME` | ✅ | `trading_db` | Database name |
| `REACT_APP_BACKEND_URL` | ✅ | — | Backend URL (frontend) |
| `OPENAI_API_KEY` | optional | — | OpenAI key (MiroFish AI) |
| `EMERGENT_LLM_KEY` | optional | — | Emergent universal LLM key |
| `GROWW_API_KEY` | ⚠️ live only | — | Groww broker API key |
| `GROWW_API_SECRET` | ⚠️ live only | — | Groww broker API secret |
| `TELEGRAM_BOT_TOKEN` | optional | — | Telegram bot token |
| `TELEGRAM_CHAT_ID` | optional | — | Telegram chat/group ID |
| `JWT_SECRET_KEY` | prod | `change-me` | JWT signing secret |
| `REQUIRE_AUTH` | optional | `false` | Enable JWT on all API calls |
| `ENV` | optional | `development` | `development`/`production` |
| `LOG_LEVEL` | optional | `INFO` | Logging verbosity |
| `PROMETHEUS_ENABLED` | optional | `true` | Enable /api/metrics endpoint |
| `SENTRY_DSN` | optional | — | Sentry error tracking DSN |

> ⚠️ **NEVER** commit `.env` with real API keys to version control.

---

## Phases 1–5 Summary {#phases}

| Phase | Description | Status |
|---|---|---|
| 1 | DreamerV3 Orchestrator + Skeleton | ✅ Complete |
| 2 | Risk & Portfolio Manager (Kelly, VaR/CVaR) | ✅ Complete |
| 3 | Execution Engine + Auto Trading Loop (APScheduler) | ✅ Complete |
| 4 | Frontend Robo Advisor Dashboard | ✅ Complete |
| 5 | Testing, Docker, Observability, Production Polish | ✅ Complete |

---

## API Reference {#api-reference}

All endpoints prefixed with `/api/robo/`:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/settings` | Current settings + risk profile |
| `POST` | `/settings` | Update daily target / capital |
| `POST` | `/start` | Start auto trading loop |
| `POST` | `/stop` | Stop auto trading loop |
| `GET` | `/status` | Full system state |
| `GET` | `/loop-status` | APScheduler loop state |
| `POST` | `/mode` | Switch paper/live/shadow |
| `GET` | `/positions` | Open positions |
| `GET` | `/orders` | Order history + P&L |
| `POST` | `/set-interval` | Change scan interval (1-30min) |
| `POST` | `/close-all` | Emergency close all positions |
| `POST` | `/recalculate` | Force risk recalculation |
| `GET` | `/risk-report` | Full RPM report |
| `GET` | `/audit` | Trade audit trail |
| `POST` | `/test-telegram` | Send Telegram test message |

System endpoints:
| `GET` | `/api/health` | Health check (Docker probe) |
| `GET` | `/api/metrics` | Prometheus metrics |

---

## Testing Guide {#testing}

```bash
cd backend

# Run all Phase 5 unit tests
pytest tests/test_risk_portfolio_manager.py tests/test_execution_engine.py tests/test_trading_loop.py -v

# Run specific test class
pytest tests/test_execution_engine.py::TestSLTPTriggers -v

# Run with coverage
pip install pytest-cov
pytest tests/test_risk_portfolio_manager.py tests/test_execution_engine.py tests/test_trading_loop.py \
  --cov=agents --cov-report=html -v

# Test API directly
API=http://localhost:8001
curl $API/api/health
curl $API/api/robo/status
curl -X POST $API/api/robo/start -H "Content-Type: application/json" \
  -d '{"ticker":"RELIANCE.NS","interval_minutes":5}'
curl $API/api/robo/loop-status
curl -X POST $API/api/robo/stop
```

### Test Coverage
| Module | Tests | Coverage |
|---|---|---|
| `risk_portfolio_manager` | 16 tests | Kelly, VaR, feasibility, budget |
| `execution_engine` | 28 tests | Paper/shadow, SL/TP, P&L, EOD |
| `trading_loop` | 22 tests | Meta decision, market hours, start/stop |

---

## Telegram Notifications Setup {#telegram}

1. Open [@BotFather](https://t.me/BotFather) → `/newbot` → copy token
2. Get chat ID: open [@userinfobot](https://t.me/userinfobot)
3. Add to `backend/.env`:
   ```env
   TELEGRAM_BOT_TOKEN=123456789:AAxxxxxxxxxxxxxxxx
   TELEGRAM_CHAT_ID=-1001234567890
   ```
4. Test: `curl -X POST http://localhost:8001/api/robo/test-telegram`

**Notifications you'll receive:**
- ▶️ Auto mode started/stopped
- 🟢🔴 Every trade opened (ticker, SL, TP, confidence)
- ✅❌ Every trade closed (P&L, exit reason)
- 🎯 Daily target reached
- ⚡ Circuit breaker triggered
- 🚨 System errors

---

## Groww Live Mode Setup {#live-trading}

> ⚠️ **WARNING**: Live mode places REAL orders. Read carefully.

1. Obtain API credentials from [Groww Developer Portal](https://trade.groww.in/developer)
2. Add to `backend/.env`:
   ```env
   GROWW_API_KEY=your_key_here
   GROWW_API_SECRET=your_secret_here
   ```
3. Restart backend
4. In the Robo Dashboard UI: click **Live** mode button
5. Read and confirm the warning modal
6. **30-second confirmation delay** applies before each live order
7. **30% position size reduction** applied automatically as safety margin

**Live mode safety features:**
- Maximum 1 open position at a time
- Circuit breaker on 2% daily loss / 5% drawdown
- EOD forced close at 15:15 IST
- SL order placed simultaneously with entry
- All trades logged with full explainability

---

## Production Checklist {#production}

### Security
- [ ] `JWT_SECRET_KEY` set to random 64-char string
- [ ] `REQUIRE_AUTH=true` enabled (optional)
- [ ] MongoDB auth enabled (MONGO_USER + MONGO_PASS set)
- [ ] Redis password set (REDIS_PASS)
- [ ] `.env` NOT committed to git
- [ ] HTTPS/TLS enabled (Nginx + certbot or Cloudflare)
- [ ] Rate limiting active (production middleware auto-enabled)
- [ ] Security headers active (X-Frame-Options, CSP, etc.)

### Monitoring
- [ ] `/api/health` endpoint reachable (Docker/k8s probe configured)
- [ ] `/api/metrics` endpoint active (Prometheus scraping)
- [ ] Telegram notifications configured + test message received
- [ ] Log aggregation configured (ELK, Datadog, or GCP Logging)
- [ ] Sentry DSN configured for error tracking

### Trading Safety
- [ ] Start in **Paper Mode** (default)
- [ ] Test paper trading for ≥ 2 weeks before live
- [ ] Daily target set realistically (< 0.5% of capital per day)
- [ ] Max daily loss circuit breaker verified working
- [ ] Groww API keys protected (not in codebase)
- [ ] Telegram alert received when circuit breaker trips

### Infrastructure
- [ ] MongoDB backups configured
- [ ] Docker image versioned (not `latest` tag in prod)
- [ ] Horizontal scaling tested (stateless backend)
- [ ] Graceful shutdown tested

---

## Legal & Compliance {#legal}

### Risk Disclosure Statement
By using this software for live trading, you acknowledge:

1. **No Guaranteed Returns**: This software makes no guarantee of profits. All trading strategies may result in financial loss.
2. **Capital Risk**: You may lose all invested capital. Only trade with money you can afford to lose completely.
3. **Not Financial Advice**: This software is a technical tool, not a financial advisor. It is not registered with SEBI or any regulatory body.
4. **Past Performance**: Historical backtests and paper trading results do not guarantee future performance.
5. **Model Risk**: DreamerV3 is an experimental ML model. Model predictions can be wrong.
6. **Market Risk**: Indian equity markets are subject to circuit breakers, trading halts, and liquidity constraints.
7. **Technology Risk**: Software bugs, connectivity failures, and API outages can result in unintended positions.
8. **Regulatory Compliance**: You are responsible for ensuring your trading activities comply with applicable SEBI regulations.

### Disclaimer Template (include in UI)
```
⚠️ DISCLAIMER: This is an algorithmic trading tool for EDUCATIONAL purposes.
Paper trading is the default mode. No guaranteed returns.
Past performance does not guarantee future results.
Always consult a SEBI-registered investment advisor before live trading.
```

---

## Support & Contributing

- Phase roadmap: See `/app/memory/PRD.md`
- Issue tracking: GitHub Issues
- Architecture: See `backend/agents/` directory

---

*Built with ❤️ on Dreamer V3 + FastAPI + React 19*
*June 2026 — All rights reserved*
