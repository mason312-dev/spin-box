import { GlobeHemisphereWestIcon } from '@phosphor-icons/react';

const FLAGS = { USD: 'us', NGN: 'ng', GHS: 'gh', KES: 'ke', ZAR: 'za', UGX: 'ug', TZS: 'tz', RWF: 'rw', EGP: 'eg', GBP: 'gb', EUR: 'eu', CAD: 'ca', AUD: 'au', AED: 'ae' };
export default function CurrencyFlag({ currency }) {
  const country = FLAGS[currency];
  return <span className="tsb-currency-flag" aria-hidden="true"><GlobeHemisphereWestIcon size={17} />{country && <img key={country} src={`https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/7.5.0/flags/4x3/${country}.svg`} width="20" height="15" alt="" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true; }} />}</span>;
}
