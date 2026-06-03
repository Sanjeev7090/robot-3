// Hybrid (QSC Engine) API client — all routes under /api/hybrid/
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const HYBRID_API = `${BACKEND_URL}/api/hybrid`;

export const hybridApi = axios.create({ baseURL: HYBRID_API, timeout: 30000 });

export const fetchAssets        = () => hybridApi.get("/assets").then((r) => r.data);
export const fetchPriceSeries   = (symbol, limit = 120) =>
  hybridApi.get(`/prices/${symbol}`, { params: { limit } }).then((r) => r.data);
export const fetchOrderBook     = (symbol) => hybridApi.get(`/orderbook/${symbol}`).then((r) => r.data);
export const fetchCorrelation   = () => hybridApi.get("/correlation").then((r) => r.data);
export const generateSignal     = (symbol) => hybridApi.post("/qsc/signal", { symbol }).then((r) => r.data);
export const listSignals        = (limit = 10) => hybridApi.get("/qsc/signals", { params: { limit } }).then((r) => r.data);
export const fetchRegulatory    = () => hybridApi.get("/regulatory/sentiment").then((r) => r.data);
export const executeTrade       = (body) => hybridApi.post("/trades/execute", body).then((r) => r.data);
export const listTrades         = (limit = 30) => hybridApi.get("/trades", { params: { limit } }).then((r) => r.data);
export const closeTrade         = (id) => hybridApi.post(`/trades/${id}/close`).then((r) => r.data);
export const fetchPositions     = () => hybridApi.get("/positions").then((r) => r.data);
export const fetchPortfolio     = () => hybridApi.get("/portfolio/summary").then((r) => r.data);

export function openPriceSocket(onMessage) {
  const wsUrl = BACKEND_URL.replace(/^http/, "ws") + "/api/ws/qsc-prices";
  let sock = null;
  let closedByUser = false;
  let retry = 0;
  const connect = () => {
    sock = new WebSocket(wsUrl);
    sock.onmessage = (ev) => {
      try { onMessage(JSON.parse(ev.data)); } catch (e) { /* noop */ }
    };
    sock.onopen = () => { retry = 0; };
    sock.onclose = () => {
      if (closedByUser) return;
      const delay = Math.min(1000 * 2 ** retry, 15000);
      retry += 1;
      setTimeout(connect, delay);
    };
    sock.onerror = () => { try { sock.close(); } catch {} };
  };
  connect();
  return {
    close: () => { closedByUser = true; try { sock && sock.close(); } catch {} },
  };
}
