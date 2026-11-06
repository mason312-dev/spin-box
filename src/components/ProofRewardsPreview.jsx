import { useState } from 'react';
import { PackageIcon, WalletIcon, VideoCameraIcon, ArrowRightIcon } from '@phosphor-icons/react';

export default function ProofRewardsPreview({ onOpenAccount }) {
  const [proof, setProof] = useState('delivery');
  return (
    <section id="proof-rewards" className="tsb-proof tsb-wrap" aria-labelledby="proof-title"><div className="tsb-proof-heading"><p className="tsb-kicker">After you claim a win</p><h2 id="proof-title">Got it?<br /><span>Show it.</span></h2><p>Share an eligible delivery or cash-out post and submit it for review. Approved proof can earn a reward to play again.</p></div><div className="tsb-proof-interaction"><div className="tsb-proof-switch" aria-label="Choose a proof example"><button type="button" onClick={() => setProof('delivery')} aria-pressed={proof === 'delivery'}><PackageIcon size={19} /> Product delivery</button><button type="button" onClick={() => setProof('cash')} aria-pressed={proof === 'cash'}><WalletIcon size={19} /> Cash-out proof</button></div><div className="tsb-proof-detail" aria-live="polite"><VideoCameraIcon size={37} weight="light" /><div><h3>{proof === 'delivery' ? 'Show the item you received.' : 'Share your completed cash-out.'}</h3><p>{proof === 'delivery' ? 'An unboxing video can be faced or faceless. Submit your public post through your account.' : 'Use an eligible completed cash-out post. Hide wallet details and other personal information before sharing.'}</p></div></div><button type="button" className="tsb-text-link" onClick={onOpenAccount}>View rewards in your account <ArrowRightIcon size={17} /></button><p className="tsb-proof-fine">Reward amounts and eligibility apply to the qualifying win. Posts are reviewed before approval.</p></div></section>
  );
}
