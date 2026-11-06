import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeftIcon, ArrowUpIcon, FileTextIcon, LockSimpleIcon, ScalesIcon } from '@phosphor-icons/react';
import { useCurrency } from '@/context/CurrencyContext';
import '@styles/pages/Legal.css';

const documents = {
  terms: {
    number: '01',
    title: 'Terms of use',
    description: 'Who can use TemuSpinBox, how accounts work, and what to check before you play.',
    icon: FileTextIcon,
  },
  rules: {
    number: '02',
    title: 'Spin & payout rules',
    description: 'What each outcome means for your stake, and what happens after a win.',
    icon: ScalesIcon,
  },
  privacy: {
    number: '03',
    title: 'Privacy policy',
    description: 'The information involved when you sign in, play, request delivery, or submit proof.',
    icon: LockSimpleIcon,
  },
};

function getSections(tab, money) {
  if (tab === 'terms') return [
    ['eligibility', 'Eligibility', 'You must be at least 18 and eligible to participate in your location.'],
    ['independence', 'Independent service', 'TemuSpinBox is an independent service. It is not affiliated with, endorsed by, or sponsored by Temu or Whaleco Inc.'],
    ['account', 'Your account', 'Use an email address you control. The welcome offer is limited to eligible new players. Do not use duplicate accounts or automated tools to obtain extra rewards or manipulate referrals.'],
    ['paid-play', 'Before a paid round', <>Check the selected item, its price, and the amount at stake before playing. A loss can consume the full stake. Read the <Link to="/legal?tab=rules">spin and payout rules</Link> before you commit money.</>],
  ];

  if (tab === 'rules') return [
    ['welcome', 'The welcome spin', <>The free welcome wheel runs a scripted sequence. Eligible new players get two retries, then a welcome reward worth {money(1)}. Verify your email to claim the reward and use it to play for eligible items worth up to {money(2)}. Paid rounds follow separate rules.</>],
    ['stake', 'The amount at stake', 'Your wallet balance shows the money held in your account. Your stake is the amount committed to a specific round. Check the item and the stake shown before confirming.'],
    ['outcomes', 'The three outcomes', <dl className="tsb-legal-outcomes">
      <div><dt>Win item</dt><dd>You win the selected item. See the delivery and wallet options below.</dd></div>
      <div><dt>Lose</dt><dd>You lose the full amount committed to the round.</dd></div>
      <div><dt>Try again</dt><dd>You can retry that round with the same stake and no second payment.</dd></div>
    </dl>],
    ['claim', 'Delivery or wallet money', <>Delivery is available for eligible items worth {money(33)} or more. If you take the wallet option, you receive 50% of the item’s recorded value in your wallet. Moving wallet money out of TemuSpinBox requires a separate withdrawal request.</>],
    ['referrals', 'Referral commissions', 'A qualifying deposit can generate commissions across five referral levels. The rates from the first through fifth level are 10%, 5%, 4%, 3%, and 2%. The combined 24% is distributed across the five levels.'],
    ['proof', 'Proof rewards', 'After an eligible delivery or completed cash-out, you can submit a public post as proof. The submission is reviewed before any reward is approved.'],
  ];

  return [
    ['sign-in', 'Sign-in and account activity', 'We use your email address to send sign-in codes. Your account also holds information about your rounds, wallet activity and referrals.'],
    ['payments', 'Deposits and withdrawals', 'Deposits and withdrawals involve wallet addresses and transaction details. Blockchain transaction records are public.'],
    ['delivery', 'Delivery information', 'When you request delivery, your address, phone number and product options are used to fulfill the order. Merchants and delivery providers may receive the details they need to ship it.'],
    ['proof', 'Proof submissions', 'If you submit a public social post for a proof reward, we use the link to review your submission. Check what personal information is visible in the post before sharing it.'],
    ['preferences', 'Browser storage', 'TemuSpinBox uses browser storage to remember your display currency and your progress through the welcome wheel.'],
  ];
}

export default function Legal() {
  const [params] = useSearchParams();
  const requested = params.get('tab');
  const active = Object.hasOwn(documents, requested) ? requested : 'terms';
  const { title, description, number, icon: Icon } = documents[active];
  const { formatMoney } = useCurrency();
  const sections = getSections(active, formatMoney);
  const heading = useRef(null);

  useEffect(() => {
    const target = document.getElementById(window.location.hash.slice(1));
    if (target && heading.current?.closest('main')?.contains(target)) {
      target.scrollIntoView({ behavior: 'instant' });
      return;
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    heading.current?.focus({ preventScroll: true });
  }, [active]);

  return (
    <main id="main-content" className="tsb-legal" tabIndex={-1}>
      <header className="tsb-legal-header">
        <div className="tsb-legal-wrap">
          <Link className="tsb-legal-back" to="/"><ArrowLeftIcon size={18} /> Back to TemuSpinBox</Link>
          <div className="tsb-legal-heading">
            <div>
              <p className="tsb-legal-kicker">Legal center <span>/ {number}</span></p>
              <h1 ref={heading} tabIndex={-1}>{title}</h1>
              <p className="tsb-legal-intro">{description}</p>
            </div>
            <div className="tsb-legal-stamp" aria-hidden="true"><Icon size={54} weight="light" /><span>{number} / 03</span></div>
          </div>
        </div>
      </header>

      <div className="tsb-legal-wrap tsb-legal-layout">
        <aside className="tsb-legal-sidebar">
          <nav aria-label="Legal documents">
            <p className="tsb-legal-nav-label">Documents</p>
            {Object.entries(documents).map(([key, doc]) => (
              <Link key={key} to={`/legal?tab=${key}`} aria-current={active === key ? 'page' : undefined}>
                <span>{doc.number}</span>{doc.title}
              </Link>
            ))}
          </nav>
          <details className="tsb-legal-index" key={active} open>
            <summary>On this page</summary>
            <nav aria-label="On this page">
              {sections.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
            </nav>
          </details>
        </aside>

        <article className="tsb-legal-document" aria-label={title}>
          {active === 'rules' && <p className="tsb-legal-rules-note">The stake and retry sections describe the planned paid-round flow.</p>}
          {sections.map(([id, label, body], index) => (
            <section key={id} aria-labelledby={id}>
              <span className="tsb-legal-section-no" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h2 id={id}>{label}</h2>
                {id === 'outcomes' ? body : <p>{body}</p>}
              </div>
            </section>
          ))}
          {active === 'rules' && <p className="tsb-legal-currency-note">Converted amounts are approximate. Rules that specify amounts use USD as the base currency.</p>}
          <a className="tsb-legal-top" href="#main-content">Back to top <ArrowUpIcon size={16} /></a>
        </article>
      </div>
    </main>
  );
}
