import { createContext, useContext, useEffect, useState } from 'react';
import { detectCurrency, supportedCurrency, validateRateData, formatUsdAmount, PREFERENCE_KEY, RATE_CACHE_KEY, RATE_MAX_AGE } from '@services/currency';

const CurrencyContext = createContext(null);
function readStorage(key) { try { return localStorage.getItem(key); } catch { return null; } }
function readRates() {
  try {
    const cached = JSON.parse(readStorage(RATE_CACHE_KEY));
    return validateRateData(cached);
  } catch { return null; }
}
function initialCurrency() {
  return detectCurrency({ saved: readStorage(PREFERENCE_KEY), languages: navigator.languages || [navigator.language], timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
}
export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState(initialCurrency);
  const [rateData, setRateData] = useState(readRates);
  const [rateError, setRateError] = useState(false);
  useEffect(() => {
    const cached = readRates();
    if (cached && cached.expiresAt > Date.now()) return undefined;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let disposed = false;
    async function loadRates() {
      try {
        const response = await fetch('https://open.er-api.com/v6/latest/USD', { signal: controller.signal, credentials: 'omit' });
        if (!response.ok) throw new Error('Rates unavailable');
        const raw = await response.json();
        const validated = validateRateData(raw);
        if (!validated) throw new Error('Invalid or old rate data');
        if (disposed) return;
        setRateData(validated);
        try { localStorage.setItem(RATE_CACHE_KEY, JSON.stringify(raw)); } catch { /* Rates still work in memory. */ }
      } catch {
        if (!disposed) setRateError(true);
      } finally { clearTimeout(timeout); }
    }
    loadRates();
    return () => { disposed = true; clearTimeout(timeout); controller.abort(); };
  }, []);
  useEffect(() => {
    if (!rateData) return undefined;
    const remaining = Math.max(0, rateData.updatedAt + RATE_MAX_AGE - Date.now());
    const expiry = setTimeout(() => setRateData(null), remaining);
    return () => clearTimeout(expiry);
  }, [rateData]);
  function selectCurrency(code) {
    if (!supportedCurrency(code)) return;
    setCurrency(code);
    try { localStorage.setItem(PREFERENCE_KEY, code); } catch { /* Keep the session preference. */ }
  }
  const hasRate = currency === 'USD' || Boolean(rateData?.rates[currency]);
  const formatMoney = (amount, options) => formatUsdAmount(amount, currency, rateData, options);
  return <CurrencyContext.Provider value={{ currency, selectCurrency, formatMoney, rateData, hasRate, rateError }}>{children}</CurrencyContext.Provider>;
}
// Kept alongside its provider so currency has one source of truth.
// eslint-disable-next-line react-refresh/only-export-components
export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error('useCurrency must be inside CurrencyProvider');
  return context;
}
