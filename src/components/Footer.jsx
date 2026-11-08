import { Link, useLocation } from 'react-router';
import { ArrowUpRightIcon } from '@phosphor-icons/react';
import Brand from '@components/Brand';
import '@styles/components/Footer.css';

export default function Footer() {
  const { pathname } = useLocation();
  const inApp = pathname === '/dashboard' || pathname === '/admin';
  return (
    <footer className={`tsb-public-footer${inApp ? ' tsb-app-footer' : ''}`}>
      <div className="tsb-footer-inner">
        <div className="tsb-footer-top">
          <Link to={inApp ? '/dashboard' : '/'} className="tsb-brand-link" aria-label="TemuSpinBox home"><Brand /></Link>
          <div className="tsb-footer-actions">
            <Link to="/support" className="tsb-back-top">Contact support</Link>
            <a href="#main-content" className="tsb-back-top" onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              if (!document.getElementById('main-content')) return;
              event.preventDefault();
              window.scrollTo(0, 0);
            }}>Back to top <ArrowUpRightIcon size={16} /></a>
          </div>
        </div>
        <div className="tsb-footer-bottom">
          <p>TemuSpinBox is independent and is not affiliated with Temu or Whaleco Inc. You must be 18+ and eligible in your location. Paid spins involve financial risk.</p>
          <nav aria-label="Legal">
            <Link to="/legal?tab=terms">Terms of service</Link>
            <Link to="/legal?tab=rules">Spin & payout rules</Link>
            <Link to="/legal?tab=privacy">Privacy policy</Link>
          </nav>
        </div>
        <div className="tsb-copyright"><span>© {new Date().getFullYear()} TemuSpinBox.</span><span>Only play with money you can afford to lose.</span></div>
      </div>
    </footer>
  );
}
