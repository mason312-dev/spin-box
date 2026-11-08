import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ArrowUpRightIcon, ArrowRightIcon, PackageIcon, WalletIcon, LinkSimpleIcon, ArrowClockwiseIcon, MinusIcon, PlusIcon, CheckIcon, GiftIcon, HeadphonesIcon, SneakerIcon, LampIcon } from '@phosphor-icons/react';
import '@styles/pages/Landing.css';
import WelcomeWheel from '@components/WelcomeWheel';
import RevealIllustration from '@components/RevealIllustration';
import { useCurrency } from '@/context/CurrencyContext';

const OUTCOMES = [
  { id: 'win', label: 'Win the item', title: 'You win the item.', text: 'Your stake is spent and you win the item. Request delivery if eligible, or choose a wallet payout worth half its value.', detail: 'Delivery eligibility and withdrawal conditions apply.', icon: PackageIcon },
  { id: 'lose', label: 'Lose', title: 'You lose your stake.', text: 'The full stake is spent and the round ends.', detail: 'Only play with an amount you can afford to lose.', icon: MinusIcon },
  { id: 'retry', label: 'Try again', title: 'Spin again at no extra cost.', text: 'Your stake stays with the same item. You can pick up the round later.', detail: 'A retry is not a win or a promise of a later win.', icon: ArrowClockwiseIcon },
];
const FAQS = [
  ['Do I need to deposit to try it?', 'No. The welcome wheel is free to try.'],
  ['What is TemuSpinBox?', 'An independent platform where you select a Temu product and spin for a chance to win it. A paid spin can cost money even if you don’t win. TemuSpinBox is not owned by or affiliated with Temu.'],
  ['Can I choose the product?', 'You can paste a Temu product link in the app. Product verification and eligibility determine which items are available for your account. The products on this page are illustrations, not live listings.'],
  ['What happens if I win?', 'You can request physical delivery for eligible items or choose 50% of the recorded product value as wallet money. The current physical-delivery threshold is $33 USD. Review the app’s rules for eligibility before participating.'],
  ['Can I withdraw a wallet payout?', 'Open Wallet to request a transfer to an external crypto wallet. The minimum amount is shown there.'],
  ['Who can participate?', 'You must be at least 18 and eligible to participate in your location. Read the rules before depositing or playing. Participation involves financial risk.'],
];

export default function Landing({ onUnlockWelcomeCredit }) {
  const { formatMoney, currency, hasRate, rateData, rateError } = useCurrency();
  const shippingMinimum = formatMoney(33);
  const [pick, setPick] = useState('tech');
  const picks = { tech: { icon: HeadphonesIcon, label: 'Tech', title: 'Headphones? A new gadget?', text: 'Bring the link to the actual item you want. No random mystery product.' }, style: { icon: SneakerIcon, label: 'Style', title: 'That pair you saved?', text: 'Choose the fashion item you want and check its available options in the app.' }, home: { icon: LampIcon, label: 'Home', title: 'Something for your space?', text: 'Paste your own Temu link. Product and delivery eligibility still apply.' } };
  const PickIcon = picks[pick].icon;
  const [outcome, setOutcome] = useState('win');
  const active = OUTCOMES.find((item) => item.id === outcome);
  const ActiveIcon = active.icon;
  const faqs = FAQS.map(([question, answer]) => [question, answer.replace('$33 USD', shippingMinimum).replace('$1 USD', formatMoney(1)).replace('$2 USD', formatMoney(2))]);

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) {
      try { localStorage.setItem('spinbox_referrer', ref); } catch { /* Browsing remains available when storage is blocked. */ }
    }
  }, []);

  return (
    <main id="main-content" className="tsb-landing">
      <section className="tsb-hero tsb-game-hero tsb-wrap" aria-labelledby="landing-title">
        <div className="tsb-hero-copy">
          <p className="tsb-kicker"><GiftIcon size={18} /> New player offer</p>
          <h1 id="landing-title">Pick a Temu item.<br /><span>Spin for it.</span></h1>
          <p className="tsb-lead">Try the welcome wheel for free. Eligible new accounts get {formatMoney(1)} in welcome credit to play for items worth up to {formatMoney(2)}.</p>
          <a className="tsb-text-link" href="#how-it-works">How it works <ArrowRightIcon size={17} /></a>
          <p className="tsb-risk">18+ only. You can lose money on paid spins.</p>
        </div>
        <WelcomeWheel onClaim={onUnlockWelcomeCredit} />
      </section>

      <section className="tsb-pick-playground tsb-wrap" aria-labelledby="pick-title"><div className="tsb-pick-intro"><p className="tsb-kicker">What would you spin for?</p><h2 id="pick-title">Play for something<br /><span>you actually want.</span></h2><div className="tsb-pick-buttons">{Object.entries(picks).map(([id, item]) => { const Icon = item.icon; return <button type="button" key={id} onClick={() => setPick(id)} aria-pressed={pick === id}><Icon size={21} />{item.label}</button>; })}</div><div className="tsb-pick-detail" aria-live="polite"><PickIcon size={28} /><h3>{picks[pick].title}</h3><p>{picks[pick].text}</p></div><button className="tsb-text-link" type="button" onClick={onUnlockWelcomeCredit}>Choose a product in the app <ArrowUpRightIcon size={17} /></button></div><figure className={`tsb-pick-art tsb-pick-art-${pick}`}><img src="/images/wishlist-editorial.png" width="1122" height="1402" alt="Illustrative collection of headphones, fashion and home items" loading="lazy" /><figcaption>Examples of items you might choose.</figcaption></figure></section>

      <section id="how-it-works" className="tsb-section tsb-wrap" aria-labelledby="how-title">
        <div className="tsb-section-heading"><p className="tsb-kicker">How it works</p><h2 id="how-title">Choose an item.<br /><span>Then spin for it.</span></h2><p>Use your welcome credit to play for eligible items worth up to {formatMoney(2)}.</p></div>
        <div className="tsb-steps"><div className="tsb-step-thread" aria-hidden="true" />
          <article><div className="tsb-step-top"><span>01</span><LinkSimpleIcon size={27} /></div><h3>Paste the link.</h3><p>Paste a Temu product link. The app checks the item’s details and price.</p></article>
          <article><div className="tsb-step-top"><span>02</span><WalletIcon size={27} /></div><h3>Review your stake.</h3><p>Check the item value and how much you’re putting into the round.</p></article>
          <article><div className="tsb-step-top"><span>03</span><ArrowClockwiseIcon size={27} /></div><h3>Spin the wheel.</h3><p>Win the item, lose your stake, or spin again using the same stake.</p></article>
        </div>
      </section>

      <section id="the-outcomes" className="tsb-outcomes" aria-labelledby="outcomes-title"><div className="tsb-wrap tsb-outcomes-grid">
        <div className="tsb-outcomes-intro"><p className="tsb-kicker">The three outcomes</p><h2 id="outcomes-title">Know what<br /><span>each result means.</span></h2><p>Three outcomes. Understand every one before you put money into a round.</p><Link to="/legal?tab=rules" className="tsb-text-link">Read the full rules <ArrowUpRightIcon size={18} /></Link><RevealIllustration outcome={outcome} /></div>
        <div className="tsb-outcome-panel">
          <div className="tsb-outcome-tabs" role="tablist" aria-label="Round outcomes">{OUTCOMES.map((item) => <button key={item.id} id={`outcome-tab-${item.id}`} role="tab" aria-selected={outcome === item.id} aria-controls="outcome-panel" tabIndex={outcome === item.id ? 0 : -1} onClick={() => setOutcome(item.id)} onKeyDown={(event) => { const index = OUTCOMES.findIndex((entry) => entry.id === item.id); const next = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : null; if (next !== null) { event.preventDefault(); setOutcome(OUTCOMES[next].id); document.getElementById(`outcome-tab-${OUTCOMES[next].id}`)?.focus(); } }}>{item.label}</button>)}</div>
          <div className={`tsb-outcome-content tsb-outcome-${active.id}`} id="outcome-panel" role="tabpanel" aria-labelledby={`outcome-tab-${active.id}`} tabIndex="0"><div className="tsb-outcome-symbol"><ActiveIcon size={33} weight="light" /><span>{active.id === 'win' ? 'THE FIND' : active.id === 'lose' ? 'THE RISK' : 'THE RETRY'}</span></div><h3>{active.title}</h3><p>{active.text}</p><div className="tsb-outcome-detail"><CheckIcon size={17} /><span>{active.detail}</span></div></div>
        </div>
      </div></section>

      <section id="your-win" className="tsb-section tsb-wrap" aria-labelledby="win-title"><div className="tsb-section-heading"><p className="tsb-kicker">After a win</p><h2 id="win-title">Get the item.<br /><span>Or take a wallet payout.</span></h2><p>Choose delivery where eligible, or take<br className="tsb-desktop-break" /> 50% of the item’s value into your wallet.</p></div>
        <div className="tsb-win-options"><article className="tsb-delivery"><div className="tsb-option-heading"><span>Product delivery</span><PackageIcon size={26} /></div><div className="tsb-box-art" aria-hidden="true"><img src="/reveal-fold.svg" width="160" height="160" alt="" /><span className="tsb-parcel-label">THE WISHLIST<br /><strong>Your selected item.</strong></span><span className="tsb-parcel-postmark">YOUR<br />FIND ↗</span></div><div><h3>Have it delivered.</h3><p>Choose delivery for an eligible win. Add your product options and delivery details, then follow its shipping status in the app.</p><span className="tsb-option-note">Physical delivery currently applies to items worth {shippingMinimum} or more.</span></div></article>
        <article className="tsb-cash"><div className="tsb-option-heading"><span>Wallet payout</span><WalletIcon size={26} /></div><div className="tsb-cash-art" aria-hidden="true"><span>50<span>%</span></span><small>of the product value</small><div className="tsb-cash-example"><span>Example item {formatMoney(80)}</span><strong>Wallet payout {formatMoney(40)}</strong></div></div><div><h3>Take half the item’s value.</h3><p>Half the item’s value goes into your TemuSpinBox wallet. To send funds to an external wallet, request a withdrawal.</p><span className="tsb-option-note">Withdrawal minimums and processing conditions apply.</span></div></article></div>
      </section>


      <section className="tsb-faq-section tsb-wrap" id="questions" aria-labelledby="faq-title"><div><p className="tsb-kicker">Before you start</p><h2 id="faq-title">Your questions,<br />answered.</h2><Link to="/legal?tab=terms" className="tsb-text-link">Terms & conditions <ArrowUpRightIcon size={18} /></Link></div><div className="tsb-faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}<span className="tsb-faq-plus"><PlusIcon size={18} /></span></summary><p>{answer}</p></details>)}</div></section>

      <section className="tsb-final tsb-wrap" aria-labelledby="final-title"><div className="tsb-final-inner"><h2 id="final-title">Ready to try the<br /><span>welcome wheel?</span></h2><a className="tsb-button tsb-button-dark" href="#welcome-game">Try the free wheel <ArrowUpRightIcon size={20} /></a><p>18+ only. Welcome reward for eligible new accounts.</p><img className="tsb-final-mark" src="/reveal-fold.svg" alt="" width="280" height="280" aria-hidden="true" /></div></section>
      <div className="tsb-currency-note tsb-wrap" role="status">{currency !== 'USD' ? hasRate ? `Converted amounts are approximate. Reference rates updated ${new Date(rateData.updatedAt).toLocaleDateString('en-GB')}. ` : (rateError || rateData) ? 'Exchange rates are unavailable. Amounts are shown in USD. ' : 'Loading exchange rates. Amounts are shown in USD. ' : 'Amounts are shown in USD. '}Display conversions are not payment quotes. <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">Rates By Exchange Rate API</a></div>
    </main>
  );
}
