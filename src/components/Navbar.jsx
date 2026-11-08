import { useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import {
  ArrowUpRightIcon, GameControllerIcon, GiftIcon, PackageIcon,
  ShieldCheckIcon, SignOutIcon, UsersThreeIcon, WalletIcon,
} from '@phosphor-icons/react';
import Brand from '@components/Brand';
import CurrencySelector from '@components/CurrencySelector';
import { useCurrency } from '@/context/CurrencyContext';
import '@styles/components/Navbar.css';

const dashboardLinks = [
  ['Play', '', GameControllerIcon],
  ['Orders', '#orders-title', PackageIcon],
  ['Rewards', '#rewards-title', GiftIcon],
  ['Referrals', '#referrals-title', UsersThreeIcon],
];

export default function Navbar({ balance = 0, isAuthenticated = false, isAdmin = false, onOpenAuth, onOpenWallet, onSignOut }) {
  const { pathname, hash, key } = useLocation();
  const isLanding = pathname === '/' && !isAuthenticated;
  const { formatMoney } = useCurrency();
  const formattedBalance = formatMoney(Number(balance) || 0);

  useEffect(() => {
    if (!isAuthenticated || pathname !== '/dashboard') return;
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    const target = document.getElementById(hash.slice(1));
    if (target && dashboardLinks.some(([, anchor]) => anchor === hash)) {
      target.scrollIntoView();
    }
  }, [isAuthenticated, pathname, hash, key]);

  return (
    <>
      <a className="tsb-skip" href="#main-content">Skip to content</a>
      {isAuthenticated ? (
        <header className="tsb-app-header">
          <div className="tsb-app-nav">
            <Link to="/dashboard" className="tsb-brand-link" aria-label="TemuSpinBox dashboard"><Brand /></Link>
            <nav className="tsb-app-links" aria-label="Player navigation">
              {dashboardLinks.map(([label, anchor, Icon]) => (
                <Link key={label} to={`/dashboard${anchor}`}
                  aria-current={pathname === '/dashboard' && hash === anchor ? (anchor ? 'location' : 'page') : undefined}>
                  <Icon className="tsb-app-tab-icon" size={22} aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
            <div className="tsb-app-actions">
              <CurrencySelector />
              <button type="button" className="tsb-app-wallet" onClick={onOpenWallet} aria-label={`Open wallet, balance ${formattedBalance}`}>
                <WalletIcon size={17} aria-hidden="true" /><span>{formattedBalance}</span>
              </button>
              {isAdmin && <Link to="/admin" className="tsb-app-icon" aria-label="Admin control center" title="Admin control center"><ShieldCheckIcon size={19} /></Link>}
              <button type="button" className="tsb-app-icon" onClick={onSignOut} aria-label="Sign out" title="Sign out"><SignOutIcon size={19} /></button>
            </div>
          </div>
        </header>
      ) : (
        <header className="tsb-public-header">
          <div className="tsb-public-nav">
            <Link to="/" className="tsb-brand-link" aria-label="TemuSpinBox home"><Brand /></Link>
            {isLanding && <nav className="tsb-public-links" aria-label="Main navigation">
              <a href="#how-it-works">How it works</a><a href="#your-win">Your win</a><Link to="/support">Support</Link><a href="#questions">FAQs</a>
            </nav>}
            <div className="tsb-public-actions">
              <CurrencySelector />
              <button type="button" className="tsb-nav-signin" onClick={onOpenAuth}>Sign in</button>
              {isLanding && <a className="tsb-nav-start" href="#welcome-game">Free spin <ArrowUpRightIcon size={16} /></a>}
            </div>
          </div>
        </header>
      )}
    </>
  );
}
