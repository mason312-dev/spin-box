import { Link, useLocation } from 'react-router';
import { ArrowUpRightIcon } from '@phosphor-icons/react';
import Brand from '@components/Brand';
import '@styles/components/Footer.css';

export default function Footer() {
  const { pathname } = useLocation();
  if (pathname === '/' || pathname === '/legal') return (
    <footer className="tsb-public-footer"><div className="tsb-footer-inner">
      <div className="tsb-footer-top"><Link to="/" className="tsb-brand-link" aria-label="TemuSpinBox home"><Brand /></Link><p>Choose an item. Understand the stake.</p><a href="#main-content" className="tsb-back-top">Back to top <ArrowUpRightIcon size={16} /></a></div>
      <div className="tsb-footer-bottom"><p>TemuSpinBox is independent and is not affiliated with, endorsed by, or sponsored by Temu or Whaleco Inc. You must be 18+ and eligible in your location. Paid participation involves financial risk.</p><nav aria-label="Legal"><Link to="/legal?tab=terms">Terms of service</Link><Link to="/legal?tab=rules">Spin & payout rules</Link><Link to="/legal?tab=privacy">Privacy policy</Link></nav></div>
      <div className="tsb-copyright"><span>© {new Date().getFullYear()} TemuSpinBox.</span><span>Only play with money you can afford to lose.</span></div>
    </div></footer>
  );
  return (
    <footer className="site-footer"><nav className="footer-links" aria-label="Legal"><Link to="/legal?tab=terms" className="footer-link">Terms of service</Link><Link to="/legal?tab=rules" className="footer-link">Spin & payout rules</Link><Link to="/legal?tab=privacy" className="footer-link">Privacy policy</Link></nav><p className="footer-disclaimer">TemuSpinBox is independent and is not affiliated with, endorsed by, or sponsored by Temu or Whaleco Inc. Must be 18+ to participate. Paid participation involves financial risk.</p><p className="footer-disclaimer">© {new Date().getFullYear()} TemuSpinBox. All rights reserved.</p></footer>
  );
}
