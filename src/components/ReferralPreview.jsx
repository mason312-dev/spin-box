import { useState } from 'react';
import { UsersThreeIcon, ArrowUpRightIcon, CheckIcon, ArrowRightIcon } from '@phosphor-icons/react';
import { useCurrency } from '@/context/CurrencyContext';

const GENERATIONS = [
  { percent: 10, name: 'Your direct invite', explanation: 'Someone joins through your link and makes a qualifying deposit.' },
  { percent: 5, name: 'Your invite’s invite', explanation: 'A person invited by your direct referral makes a qualifying deposit.' },
  { percent: 4, name: 'Three generations away', explanation: 'A qualifying deposit comes from the third generation in your network.' },
  { percent: 3, name: 'Four generations away', explanation: 'A qualifying deposit comes from the fourth generation in your network.' },
  { percent: 2, name: 'Five generations away', explanation: 'A qualifying deposit comes from the fifth generation in your network.' },
];
export default function ReferralPreview({ onJoin }) {
  const [generation, setGeneration] = useState(0);
  const { formatMoney } = useCurrency();
  const active = GENERATIONS[generation];
  return (
    <section id="referrals" className="tsb-referrals tsb-wrap" aria-labelledby="referral-title">
      <div className="tsb-referral-intro"><p className="tsb-kicker"><UsersThreeIcon size={18} /> Bring your people</p><h2 id="referral-title">One link.<br /><span>Five generations.</span></h2><p>Earn a commission when someone in your referral network makes a qualifying deposit. Tap a generation to see the breakdown.</p><button className="tsb-text-link" onClick={onJoin}>Create your referral link <ArrowUpRightIcon size={18} /></button></div>
      <div className="tsb-referral-explorer"><div className="tsb-referral-chain" aria-label="Explore referral generations"><span className="tsb-referral-you">You</span>{GENERATIONS.map((item, index) => <button type="button" key={item.percent} aria-pressed={generation === index} onClick={() => setGeneration(index)} aria-label={`Generation ${index + 1}, ${item.percent} percent`}><span>Gen {index + 1}</span><strong>{item.percent}%</strong></button>)}</div><div className="tsb-referral-detail" aria-live="polite"><div><span>Generation {generation + 1}</span><strong>{active.percent}<small>%</small></strong></div><article><h3>{active.name}</h3><p>{active.explanation}</p><div className="tsb-referral-example"><span>Example deposit {formatMoney(10)}</span><ArrowRightIcon size={15} /><strong>You earn {formatMoney(10 * active.percent / 100)}</strong></div></article></div><p className="tsb-referral-fine"><CheckIcon size={15} /> Each percentage applies to its own generation. 24% is the combined five-level distribution, not your direct-referral rate.</p></div>
    </section>
  );
}
