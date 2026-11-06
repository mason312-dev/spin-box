// Live Crypto Price Oracle (CoinGecko / Binance Fallback)
const FALLBACK_PRICES = {
  USDT: 1.00,
  USDC: 1.00,
  SOL: 175.00,
  TRX: 0.16,
  ETH: 2650.00,
  BTC: 68500.00
};

let cachedPrices = { ...FALLBACK_PRICES };
let lastFetchTime = 0;
const PRICE_TTL_MS = 60 * 1000; // 60 seconds

export async function getAssetUsdPrice(asset) {
  const symbol = asset.toUpperCase();
  if (symbol === 'USDT' || symbol === 'USDC') return 1.00;

  const now = Date.now();
  if (now - lastFetchTime < PRICE_TTL_MS && cachedPrices[symbol]) {
    return cachedPrices[symbol];
  }

  try {
    const res = await fetch(
      'https://api.binance.com/api/v3/ticker/price?symbols=["SOLUSDT","TRXUSDT","ETHUSDT","BTCUSDT"]',
      { signal: AbortSignal.timeout(5000) }
    );
    if (res.ok) {
      const list = await res.json();
      for (const item of list) {
        if (item.symbol === 'SOLUSDT') cachedPrices.SOL = Number(item.price);
        if (item.symbol === 'TRXUSDT') cachedPrices.TRX = Number(item.price);
        if (item.symbol === 'ETHUSDT') cachedPrices.ETH = Number(item.price);
        if (item.symbol === 'BTCUSDT') cachedPrices.BTC = Number(item.price);
      }
      lastFetchTime = now;
    }
  } catch {
    // Keep last known or fallback price on network timeout
  }

  return cachedPrices[symbol] || FALLBACK_PRICES[symbol] || 0;
}
