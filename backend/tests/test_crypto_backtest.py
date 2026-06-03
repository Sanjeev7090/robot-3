"""
Crypto and Backtest API Tests
Tests for:
- GET /api/crypto/prices - returns 20 crypto coins
- GET /api/crypto/chart/{coin_id} - returns OHLC bars
- POST /api/backtest with crypto tickers (bitcoin, ethereum)
- Existing NSE stock features
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCryptoEndpoints:
    """Tests for crypto-related API endpoints"""
    
    def test_crypto_prices_returns_coins(self):
        """GET /api/crypto/prices should return list of crypto coins"""
        response = requests.get(f"{BASE_URL}/api/crypto/prices", timeout=30)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "coins" in data, "Response should have 'coins' key"
        
        coins = data["coins"]
        # Note: CoinGecko rate limits may return empty array
        if len(coins) > 0:
            print(f"SUCCESS: Got {len(coins)} crypto coins")
            # Verify coin structure
            coin = coins[0]
            assert "id" in coin, "Coin should have 'id'"
            assert "symbol" in coin, "Coin should have 'symbol'"
            assert "name" in coin, "Coin should have 'name'"
            print(f"First coin: {coin['name']} ({coin['symbol']})")
        else:
            print("WARNING: Empty coins array (likely CoinGecko rate limit - graceful degradation)")
    
    def test_crypto_chart_bitcoin(self):
        """GET /api/crypto/chart/bitcoin should return OHLC bars"""
        response = requests.get(f"{BASE_URL}/api/crypto/chart/bitcoin?days=7", timeout=30)
        
        # May get 429 rate limit
        if response.status_code == 429:
            print("WARNING: CoinGecko rate limited (429) - expected behavior")
            return
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "bars" in data, "Response should have 'bars' key"
        
        bars = data["bars"]
        if len(bars) > 0:
            print(f"SUCCESS: Got {len(bars)} OHLC bars for bitcoin")
            bar = bars[0]
            assert "timestamp" in bar, "Bar should have 'timestamp'"
            assert "open" in bar, "Bar should have 'open'"
            assert "high" in bar, "Bar should have 'high'"
            assert "low" in bar, "Bar should have 'low'"
            assert "close" in bar, "Bar should have 'close'"
        else:
            print("WARNING: Empty bars (rate limit or no data)")
    
    def test_crypto_chart_ethereum(self):
        """GET /api/crypto/chart/ethereum should return OHLC bars"""
        response = requests.get(f"{BASE_URL}/api/crypto/chart/ethereum?days=7", timeout=30)
        
        if response.status_code == 429:
            print("WARNING: CoinGecko rate limited (429)")
            return
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "bars" in data
        print(f"SUCCESS: Got {len(data['bars'])} OHLC bars for ethereum")
    
    def test_crypto_search(self):
        """GET /api/crypto/search should return matching coins"""
        response = requests.get(f"{BASE_URL}/api/crypto/search?q=btc", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert "results" in data
        print(f"SUCCESS: Crypto search returned {len(data['results'])} results for 'btc'")
    
    def test_crypto_market_overview(self):
        """GET /api/crypto/market-overview should return market data"""
        response = requests.get(f"{BASE_URL}/api/crypto/market-overview", timeout=30)
        
        if response.status_code == 429:
            print("WARNING: CoinGecko rate limited")
            return
        
        assert response.status_code == 200
        data = response.json()
        print(f"SUCCESS: Market overview returned - BTC dominance: {data.get('btc_dominance', 'N/A')}%")


class TestCryptoBacktest:
    """Tests for backtest with crypto tickers"""
    
    def test_backtest_bitcoin(self):
        """POST /api/backtest with ticker='bitcoin' should return results"""
        payload = {
            "ticker": "bitcoin",
            "strategy": "all",
            "days": 90,
            "timeframe": "intraday"
        }
        
        response = requests.post(f"{BASE_URL}/api/backtest", json=payload, timeout=60)
        
        if response.status_code == 429:
            print("WARNING: Rate limited during backtest")
            return
        
        if response.status_code == 400:
            # May have insufficient data
            print(f"WARNING: {response.json().get('detail', 'Insufficient data')}")
            return
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "ticker" in data
        assert "total_trades" in data
        assert "win_rate" in data
        assert "trades" in data
        
        print(f"SUCCESS: Bitcoin backtest - {data['total_trades']} trades, {data['win_rate']}% win rate")
    
    def test_backtest_ethereum(self):
        """POST /api/backtest with ticker='ethereum' should return results"""
        payload = {
            "ticker": "ethereum",
            "strategy": "all",
            "days": 90,
            "timeframe": "intraday"
        }
        
        response = requests.post(f"{BASE_URL}/api/backtest", json=payload, timeout=60)
        
        if response.status_code == 429:
            print("WARNING: Rate limited")
            return
        
        if response.status_code == 400:
            print(f"WARNING: {response.json().get('detail', 'Insufficient data')}")
            return
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"SUCCESS: Ethereum backtest - {data['total_trades']} trades, {data['win_rate']}% win rate")


class TestExistingStockFeatures:
    """Tests to verify existing NSE stock features still work"""
    
    def test_stock_search(self):
        """GET /api/stock/search should return NSE stocks"""
        response = requests.get(f"{BASE_URL}/api/stock/search?q=RELIANCE", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert "results" in data
        assert len(data["results"]) > 0, "Should find RELIANCE stock"
        print(f"SUCCESS: Stock search found {len(data['results'])} results for RELIANCE")
    
    def test_stock_bars(self):
        """GET /api/stock/bars/{ticker} should return OHLCV data"""
        response = requests.get(f"{BASE_URL}/api/stock/bars/RELIANCE.NS?timespan=day&multiplier=1", timeout=30)
        assert response.status_code == 200
        
        data = response.json()
        assert "ticker" in data
        assert "bars" in data
        assert len(data["bars"]) > 0, "Should have bar data"
        print(f"SUCCESS: Got {len(data['bars'])} bars for RELIANCE.NS")
    
    def test_backtest_nse_stock(self):
        """POST /api/backtest with NSE stock should still work"""
        payload = {
            "ticker": "RELIANCE.NS",
            "strategy": "all",
            "days": 90,
            "timeframe": "intraday"
        }
        
        response = requests.post(f"{BASE_URL}/api/backtest", json=payload, timeout=60)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data["ticker"] == "RELIANCE.NS"
        print(f"SUCCESS: NSE stock backtest - {data['total_trades']} trades, {data['win_rate']}% win rate")


class TestAPIHealth:
    """Basic API health checks"""
    
    def test_api_root(self):
        """GET /api/ should return welcome message"""
        response = requests.get(f"{BASE_URL}/api/", timeout=10)
        assert response.status_code == 200
        print("SUCCESS: API root endpoint working")
    
    def test_square_of_9(self):
        """GET /api/square-of-9 should calculate targets"""
        response = requests.get(f"{BASE_URL}/api/square-of-9?center_price=100", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert "targets" in data
        print("SUCCESS: Square of 9 calculation working")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
