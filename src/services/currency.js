export const CURRENCIES = [
  ['USD', 'US dollar'], ['NGN', 'Nigerian naira'], ['GHS', 'Ghanaian cedi'],
  ['KES', 'Kenyan shilling'], ['ZAR', 'South African rand'], ['UGX', 'Ugandan shilling'],
  ['TZS', 'Tanzanian shilling'], ['RWF', 'Rwandan franc'], ['XOF', 'West African CFA franc'],
  ['XAF', 'Central African CFA franc'], ['EGP', 'Egyptian pound'], ['GBP', 'British pound'],
  ['EUR', 'Euro'], ['CAD', 'Canadian dollar'], ['AUD', 'Australian dollar'], ['AED', 'UAE dirham'],
];
export const PREFERENCE_KEY = 'spinbox_currency_v1';
export const RATE_CACHE_KEY = 'spinbox_fx_usd_v1';
export const RATE_MAX_AGE = 48 * 60 * 60 * 1000;
const COUNTRY_CURRENCY = { NG: 'NGN', GH: 'GHS', KE: 'KES', ZA: 'ZAR', UG: 'UGX', TZ: 'TZS', RW: 'RWF', SN: 'XOF', CI: 'XOF', BJ: 'XOF', TG: 'XOF', CM: 'XAF', GA: 'XAF', EG: 'EGP', GB: 'GBP', US: 'USD', CA: 'CAD', AU: 'AUD', AE: 'AED', DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', IE: 'EUR', NL: 'EUR', PT: 'EUR' };
const ZONE_CURRENCY = { 'Africa/Lagos': 'NGN', 'Africa/Accra': 'GHS', 'Africa/Nairobi': 'KES', 'Africa/Johannesburg': 'ZAR', 'Africa/Kampala': 'UGX', 'Africa/Dar_es_Salaam': 'TZS', 'Africa/Kigali': 'RWF', 'Africa/Abidjan': 'XOF', 'Africa/Dakar': 'XOF', 'Africa/Douala': 'XAF', 'Africa/Cairo': 'EGP' };
export function supportedCurrency(value) { return CURRENCIES.some(([code]) => code === value); }
export function detectCurrency({ saved, languages = [], timeZone = '' } = {}) {
  if (supportedCurrency(saved)) return saved;
  // Time zones and regional locales are suggestions, not verified location. Never request GPS.
  if (ZONE_CURRENCY[timeZone]) return ZONE_CURRENCY[timeZone];
  for (const language of languages) {
    try { const region = new Intl.Locale(language).region; if (COUNTRY_CURRENCY[region]) return COUNTRY_CURRENCY[region]; } catch { /* No usable regional hint. */ }
  }
  return 'USD';
}
export function validateRateData(data, now = Date.now()) {
  if (data?.result !== 'success' || data.base_code !== 'USD' || !Number.isFinite(data.time_last_update_unix)) return null;
  const updatedAt = data.time_last_update_unix * 1000;
  if (updatedAt > now + 300000 || now - updatedAt > RATE_MAX_AGE || data.rates?.USD !== 1) return null;
  const rates = { USD: 1 };
  for (const [code] of CURRENCIES) if (Number.isFinite(data.rates[code]) && data.rates[code] > 0) rates[code] = data.rates[code];
  return { rates, updatedAt, expiresAt: Math.min((data.time_next_update_unix || 0) * 1000 || updatedAt + 86400000, updatedAt + RATE_MAX_AGE) };
}
export function formatUsdAmount(amount, currency, rateData, { approximate = true } = {}) {
  // Provider accepts validated data and discards it when its maximum age is reached.
  const available = Boolean(rateData);
  const rate = currency === 'USD' ? 1 : available ? rateData.rates[currency] : null;
  const displayedCurrency = rate ? currency : 'USD';
  const value = Number(amount) * (rate || 1);
  const formatted = new Intl.NumberFormat('en', { style: 'currency', currency: displayedCurrency, currencyDisplay: displayedCurrency === 'USD' ? 'symbol' : 'narrowSymbol', maximumFractionDigits: 2 }).format(value);
  return `${displayedCurrency !== 'USD' && approximate ? '≈ ' : ''}${formatted}${displayedCurrency === 'USD' ? ' USD' : ` ${displayedCurrency}`}`;
}
