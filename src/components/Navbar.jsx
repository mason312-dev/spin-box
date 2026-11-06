import { Link, useLocation, useNavigate } from 'react-router';
import { WalletIcon, SignOutIcon, ShieldCheckIcon, ArrowUpRightIcon } from '@phosphor-icons/react';
import Brand from '@components/Brand';
import CurrencySelector from '@components/CurrencySelector';
import { useCurrency } from '@/context/CurrencyContext';
import '@styles/components/Navbar.css';



export default function Navbar({ balance = 0, isAuthenticated = false, isAdmin = false, onOpenAuth, onOpenWallet, onSignOut }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isLanding = pathname === '/' && !isAuthenticated;
  const isLegal = pathname === '/legal';
  const { formatMoney } = useCurrency();
  const numericBalance = Number(balance) || 0;
  const formattedBalance = formatMoney(numericBalance);

  if (isLanding || isLegal) return (
    <>
      <a className="tsb-skip" href="#main-content">Skip to content</a>
      <header className={isLegal ? "tsb-public-header tsb-legal-navbar" : "tsb-public-header"}><div className="tsb-public-nav">
        <Link to="/" className="tsb-brand-link" aria-label="TemuSpinBox home"><Brand /></Link>
        {isLanding && <nav className="tsb-public-links" aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#your-win">Your win</a><a href="#referrals">Referrals</a><a href="#questions">FAQs</a></nav>}
        <div className="tsb-public-actions"><CurrencySelector />{isAuthenticated ? <Link className="tsb-nav-dashboard" to="/dashboard">Dashboard</Link> : <button className="tsb-nav-signin" onClick={onOpenAuth}>Sign in</button>}{isLanding && <a className="tsb-nav-start" href="#welcome-game">Free spin <ArrowUpRightIcon size={16} /></a>}</div>
      </div></header>
    </>
  );

  return (
    <header className="navbar">
      <Link to="/" className="tsb-brand-link" aria-label="TemuSpinBox home"><Brand /></Link>
      <div className="nav-actions"><CurrencySelector />
        {isAdmin && <button onClick={() => navigate('/admin')} className="btn-secondary" aria-label="Admin control center"><ShieldCheckIcon size={18} weight="bold" /></button>}
        <button type="button" onClick={isAuthenticated ? onOpenWallet : onOpenAuth} className="balance-pill" aria-label={`Open wallet, balance ${formattedBalance}`}><WalletIcon size={16} weight="bold" /><span>{formattedBalance}</span></button>
        {isAuthenticated ? <button onClick={onSignOut} className="btn-secondary" aria-label="Sign out"><SignOutIcon size={16} weight="bold" /></button> : <button onClick={onOpenAuth} className="btn-secondary">Sign in</button>}
      </div>
    </header>
  );
}
