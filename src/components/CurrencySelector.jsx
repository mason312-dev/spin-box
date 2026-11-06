import { CaretDownIcon } from '@phosphor-icons/react';
import { useCurrency } from '@/context/CurrencyContext';
import CurrencyFlag from '@components/CurrencyFlag';
import { CURRENCIES } from '@services/currency';

export default function CurrencySelector() {
  const { currency, selectCurrency, hasRate, rateError } = useCurrency();
  return (
    <label className="tsb-currency" title={!hasRate ? (rateError ? 'Exchange rates unavailable; amounts are shown in USD.' : 'Loading exchange rates; amounts are shown in USD.') : 'Display currency. Converted values are approximate.'}>
      <CurrencyFlag currency={currency} />
      <span className="tsb-currency-value">{currency}</span>
      <CaretDownIcon size={10} aria-hidden="true" />
      <select aria-label="Display currency" value={currency} onChange={(event) => selectCurrency(event.target.value)}>{CURRENCIES.map(([code, name]) => <option key={code} value={code}>{code}: {name}</option>)}</select>
    </label>
  );
}
