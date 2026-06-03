"""
Tests for Visualization endpoints:
- GET /api/viz/correlation-matrix
- GET /api/viz/options-network/{symbol}
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestCorrelationMatrix:
    """Correlation Matrix endpoint tests"""

    def test_correlation_matrix_status_200(self):
        """Endpoint returns HTTP 200"""
        response = requests.get(f"{BASE_URL}/api/viz/correlation-matrix", timeout=60)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"

    def test_correlation_matrix_response_structure(self):
        """Response has required keys: tickers, matrix, period"""
        response = requests.get(f"{BASE_URL}/api/viz/correlation-matrix", timeout=60)
        assert response.status_code == 200
        data = response.json()
        assert "tickers" in data, "Missing 'tickers' key"
        assert "matrix" in data, "Missing 'matrix' key"
        assert "period" in data, "Missing 'period' key"

    def test_correlation_matrix_15_tickers(self):
        """Response has exactly 15 tickers"""
        response = requests.get(f"{BASE_URL}/api/viz/correlation-matrix", timeout=60)
        assert response.status_code == 200
        data = response.json()
        tickers = data.get("tickers", [])
        assert len(tickers) == 15, f"Expected 15 tickers, got {len(tickers)}: {tickers}"

    def test_correlation_matrix_is_square(self):
        """Matrix dimensions match number of tickers"""
        response = requests.get(f"{BASE_URL}/api/viz/correlation-matrix", timeout=60)
        assert response.status_code == 200
        data = response.json()
        n = len(data["tickers"])
        matrix = data["matrix"]
        assert len(matrix) == n, f"Expected {n} rows, got {len(matrix)}"
        for i, row in enumerate(matrix):
            assert len(row) == n, f"Row {i} has {len(row)} cols, expected {n}"

    def test_correlation_matrix_values_range(self):
        """All correlation values are valid floats between -1 and 1"""
        response = requests.get(f"{BASE_URL}/api/viz/correlation-matrix", timeout=60)
        assert response.status_code == 200
        data = response.json()
        matrix = data["matrix"]
        for i, row in enumerate(matrix):
            for j, val in enumerate(row):
                assert isinstance(val, (int, float)), f"matrix[{i}][{j}] is not numeric: {val}"
                assert -1.0 <= val <= 1.0, f"matrix[{i}][{j}] = {val} is out of range [-1,1]"

    def test_correlation_matrix_diagonal_is_one(self):
        """Diagonal elements should be ~1.0 (self-correlation)"""
        response = requests.get(f"{BASE_URL}/api/viz/correlation-matrix", timeout=60)
        assert response.status_code == 200
        data = response.json()
        matrix = data["matrix"]
        for i in range(len(matrix)):
            assert abs(matrix[i][i] - 1.0) < 0.01, f"Diagonal[{i}]={matrix[i][i]}, expected ~1.0"

    def test_correlation_matrix_period_3mo(self):
        """Period is '3mo' by default"""
        response = requests.get(f"{BASE_URL}/api/viz/correlation-matrix", timeout=60)
        assert response.status_code == 200
        data = response.json()
        assert data.get("period") == "3mo", f"Expected period='3mo', got '{data.get('period')}'"

    def test_correlation_matrix_tickers_no_ns_suffix(self):
        """Tickers should not have .NS or .BO suffix (stripped)"""
        response = requests.get(f"{BASE_URL}/api/viz/correlation-matrix", timeout=60)
        assert response.status_code == 200
        data = response.json()
        tickers = data.get("tickers", [])
        for t in tickers:
            assert not t.endswith(".NS"), f"Ticker '{t}' still has .NS suffix"
            assert not t.endswith(".BO"), f"Ticker '{t}' still has .BO suffix"

    def test_correlation_matrix_tickers_list(self):
        """Check expected NSE large-cap tickers are present"""
        response = requests.get(f"{BASE_URL}/api/viz/correlation-matrix", timeout=60)
        assert response.status_code == 200
        data = response.json()
        tickers = data.get("tickers", [])
        expected = ["RELIANCE", "HDFCBANK", "INFY", "TCS", "ICICIBANK"]
        for t in expected:
            assert t in tickers, f"Expected ticker '{t}' not found in {tickers}"


class TestOptionsNetwork:
    """Options Flow Network endpoint tests"""

    def test_options_network_nifty_status_200(self):
        """NIFTY options network returns HTTP 200"""
        response = requests.get(f"{BASE_URL}/api/viz/options-network/NIFTY", timeout=30)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"

    def test_options_network_response_structure(self):
        """Response has required keys: nodes, edges, symbol"""
        response = requests.get(f"{BASE_URL}/api/viz/options-network/NIFTY", timeout=30)
        assert response.status_code == 200
        data = response.json()
        assert "nodes" in data, "Missing 'nodes' key"
        assert "edges" in data, "Missing 'edges' key"
        assert "symbol" in data, "Missing 'symbol' key"

    def test_options_network_symbol_matches(self):
        """Response symbol matches requested symbol"""
        response = requests.get(f"{BASE_URL}/api/viz/options-network/NIFTY", timeout=30)
        assert response.status_code == 200
        data = response.json()
        assert data.get("symbol") == "NIFTY", f"Expected symbol=NIFTY, got {data.get('symbol')}"

    def test_options_network_nodes_is_list(self):
        """nodes field is a list"""
        response = requests.get(f"{BASE_URL}/api/viz/options-network/NIFTY", timeout=30)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data["nodes"], list), "nodes must be a list"

    def test_options_network_edges_is_list(self):
        """edges field is a list"""
        response = requests.get(f"{BASE_URL}/api/viz/options-network/NIFTY", timeout=30)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data["edges"], list), "edges must be a list"

    def test_options_network_graceful_fallback(self):
        """Even if NSE is not accessible, returns valid structure (no 500 error)"""
        response = requests.get(f"{BASE_URL}/api/viz/options-network/BANKNIFTY", timeout=30)
        assert response.status_code == 200, f"Should return 200 even if NSE unavailable, got {response.status_code}"
        data = response.json()
        # Should always have these keys
        assert "nodes" in data
        assert "edges" in data
        assert "symbol" in data

    def test_options_network_symbol_banknifty(self):
        """BANKNIFTY options network returns HTTP 200 with correct symbol"""
        response = requests.get(f"{BASE_URL}/api/viz/options-network/BANKNIFTY", timeout=30)
        assert response.status_code == 200
        data = response.json()
        assert data.get("symbol") == "BANKNIFTY"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
