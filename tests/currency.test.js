import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCurrency, validateRateData, formatUsdAmount, RATE_MAX_AGE } from '../src/services/currency.js';

function fixture(now = Date.now()) {
  return { result: 'success', base_code: 'USD', time_last_update_unix: Math.floor(now / 1000), time_next_update_unix: Math.floor(now / 1000) + 86400, rates: { USD: 1, NGN: 1500, GHS: 12, KES: 130 } };
}
test('manual preference overrides region hints', () => {
  assert.equal(detectCurrency({ saved: 'KES', languages: ['en-NG'], timeZone: 'Africa/Lagos' }), 'KES');
});
test('African time zones take priority over generic browser English', () => {
  assert.equal(detectCurrency({ languages: ['en-US'], timeZone: 'Africa/Lagos' }), 'NGN');
  assert.equal(detectCurrency({ languages: ['en-GB'], timeZone: 'Africa/Accra' }), 'GHS');
  assert.equal(detectCurrency({ languages: ['en-US'], timeZone: 'Africa/Nairobi' }), 'KES');
});
test('regional locales work without a mapped time zone', () => {
  assert.equal(detectCurrency({ languages: ['en-GH'], timeZone: 'UTC' }), 'GHS');
  assert.equal(detectCurrency({ languages: ['en-NG'] }), 'NGN');
});
test('unknown or malformed hints fall back to USD', () => {
  assert.equal(detectCurrency({ languages: ['en'], timeZone: 'UTC' }), 'USD');
  assert.equal(detectCurrency({ saved: 'INVALID', languages: ['not valid'] }), 'USD');
});
test('invalid base, negative rates and stale cache are not used', () => {
  const now = Date.now();
  assert.equal(validateRateData({ ...fixture(now), base_code: 'NGN' }, now), null);
  assert.equal(validateRateData({ ...fixture(now), time_last_update_unix: Math.floor((now - RATE_MAX_AGE - 10000) / 1000) }, now), null);
  assert.equal(validateRateData({ ...fixture(now), rates: { USD: 2 } }, now), null);
  assert.equal(validateRateData({ ...fixture(now), rates: { USD: 1, NGN: -1 } }, now).rates.NGN, undefined);
});
test('shipping threshold and cash example share the chosen reference rate', () => {
  const rates = validateRateData(fixture());
  assert.match(formatUsdAmount(33, 'NGN', rates), /≈.*49,500.*NGN/);
  assert.match(formatUsdAmount(33, 'GHS', rates), /396.*GHS/);
  assert.match(formatUsdAmount(33, 'KES', rates), /4,290.*KES/);
  assert.match(formatUsdAmount(80, 'NGN', rates), /120,000/);
  assert.match(formatUsdAmount(40, 'NGN', rates), /60,000/);
});
test('missing rates show USD explicitly, never an invented conversion', () => {
  assert.equal(formatUsdAmount(33, 'NGN', null), '$33.00 USD');
  assert.equal(formatUsdAmount(33, 'KES', { rates: { USD: 1 } }), '$33.00 USD');
});
