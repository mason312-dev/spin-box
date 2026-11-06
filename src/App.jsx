import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { supabase } from '@services/supabaseClient';
import Navbar from '@components/Navbar';
import PageLoader from '@components/PageLoader';
import AuthModal from '@components/AuthModal';
import CryptoWalletModal from '@components/CryptoWalletModal';
import Footer from '@components/Footer';
import Landing from '@pages/Landing';
import Dashboard from '@pages/Dashboard';
import Legal from '@pages/Legal';
import AdminDashboard from '@pages/AdminDashboard';

const INITIAL_PROFILE = { account_credits: 0.00, referral_balance: 0.00, isAdmin: false };

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(INITIAL_PROFILE);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isWalletOpen, setIsWalletOpen] = useState(false);

  const fetchUserProfile = useCallback(async (userId) => {
    const { data, error } = await supabase
      .from('users')
      .select('account_credits, referral_balance, is_admin')
      .eq('id', userId)
      .maybeSingle();

    if (!error && data) {
      setProfile({
        account_credits: Number(data.account_credits),
        referral_balance: Number(data.referral_balance),
        isAdmin: Boolean(data.is_admin)
      });
    }
  }, []);

  // 1. Auth Session Bootstrap & State Listener
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!isMounted) return;

      setSession(currentSession);
      if (currentSession?.user) {
        await fetchUserProfile(currentSession.user.id);
      }
      if (isMounted) setLoading(false);
    }

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!isMounted) return;
        setSession(newSession);

        if (newSession?.user) {
          setIsAuthOpen(false);
          await fetchUserProfile(newSession.user.id);
        } else if (event === 'SIGNED_OUT') {
          setProfile(INITIAL_PROFILE);
          setIsWalletOpen(false);
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUserProfile]);

  // 2. Live Realtime Balance & Admin Status Sync
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return undefined;

    const channel = supabase
      .channel(`user-ledger-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${userId}`
        },
        (payload) => {
          if (payload.new) {
            setProfile((prev) => ({
              ...prev,
              account_credits: Number(payload.new.account_credits),
              referral_balance: Number(payload.new.referral_balance),
              isAdmin: Boolean(payload.new.is_admin)
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(INITIAL_PROFILE);
    setIsWalletOpen(false);
  }

  if (loading) return <PageLoader />;

  return (
    <BrowserRouter>
      <Navbar
        balance={session ? profile.account_credits : 0}
        currency={profile?.currency || 'NGN'}
        isAuthenticated={Boolean(session)}
        isAdmin={profile.isAdmin}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenWallet={() => setIsWalletOpen(true)}
        onSignOut={handleSignOut}
      />

      <Routes>
        <Route
          path="/"
          element={
            session ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <Landing onUnlockWelcomeCredit={() => setIsAuthOpen(true)} />
            )
          }
        />
        <Route
          path="/dashboard"
          element={
            session ? (
              <Dashboard
                user={session.user}
                profile={profile}
                onBalanceChange={(newBal) =>
                  setProfile((prev) => ({ ...prev, account_credits: Number(newBal) }))
                }
                onReferralChange={(newRef) =>
                  setProfile((prev) => ({ ...prev, referral_balance: Number(newRef) }))
                }
                onOpenDeposit={() => setIsWalletOpen(true)}
              />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/admin"
          element={
            session && profile.isAdmin ? (
              <AdminDashboard />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route path="/legal" element={<Legal />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <Footer />

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />

      <CryptoWalletModal
        isOpen={isWalletOpen}
        onClose={() => setIsWalletOpen(false)}
        user={session?.user}
        profile={profile}
        onBalancesUpdated={(updated) =>
          setProfile((prev) => ({
            ...prev,
            account_credits: Number(updated.account_credits),
            referral_balance: Number(updated.referral_balance)
          }))
        }
      />
    </BrowserRouter>
  );
}