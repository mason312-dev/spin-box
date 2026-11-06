import { useEffect, useRef, useState } from 'react';
import { ArrowLeftIcon, ArrowRightIcon, EnvelopeSimpleIcon, KeyholeIcon, XIcon } from '@phosphor-icons/react';
import Brand from '@components/Brand';
import { supabase } from '@services/supabaseClient';
import '@styles/components/AuthModal.css';

const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export default function AuthModal({ isOpen, onClose }) {
  return isOpen ? <AuthDialog onClose={onClose} /> : null;
}

function AuthDialog({ onClose }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeStep, setCodeStep] = useState(false);
  const [pending, setPending] = useState('');
  const [feedback, setFeedback] = useState(null);
  const dialogRef = useRef(null);
  const fieldRef = useRef(null);
  const requestRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      requestRef.current?.abort();
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    fieldRef.current?.focus({ preventScroll: true });
  }, [codeStep]);

  async function submit(action) {
    if (requestRef.current) return;
    const verify = action === 'verify';
    const controller = new AbortController();
    requestRef.current = controller;
    setPending(action);
    setFeedback(null);
    try {
      const body = {
        email: email.trim(),
        referrerId: localStorage.getItem('spinbox_referrer') || null,
      };
      if (verify) body.token = code;

      const response = await fetch(`${apiBase}/api/auth/${verify ? 'verify-otp' : 'send-otp'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        const message = response.status === 429
          ? result.error || 'Wait a moment before requesting another code.'
          : verify && response.status === 401
            ? 'That code is invalid or expired. Check it or request a new one.'
            : 'Something went wrong. Try again in a moment.';
        setFeedback({ error: true, message });
        return;
      }

      if (verify) {
        if (controller.signal.aborted) return;
        const { error } = await supabase.auth.verifyOtp({
          token_hash: result.data.tokenHash,
          type: 'magiclink',
        });
        if (error) {
          setFeedback({ error: true, message: 'We couldn’t finish signing you in. Request a new code and try again.' });
          return;
        }
        if (!controller.signal.aborted) onClose();
        return;
      }

      setEmail(body.email);
      setCode('');
      setCodeStep(true);
      if (action === 'resend') {
        setFeedback({ error: false, message: 'New code sent. Use the most recent email.' });
        fieldRef.current?.focus({ preventScroll: true });
      }
    } catch {
      if (!controller.signal.aborted) {
        setFeedback({ error: true, message: 'We couldn’t complete that request. Try again in a moment.' });
      }
    } finally {
      requestRef.current = null;
      if (!controller.signal.aborted) setPending('');
    }
  }

  function changeEmail() {
    setCode('');
    setFeedback(null);
    setCodeStep(false);
  }

  const title = codeStep ? 'Check your inbox.' : 'Sign in with email.';
  const Illustration = codeStep ? KeyholeIcon : EnvelopeSimpleIcon;

  return (
    <dialog
      className="tsb-auth-dialog"
      ref={dialogRef}
      aria-labelledby="auth-dialog-title"
      aria-describedby="auth-dialog-description"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="tsb-auth-layout">
        <aside className="tsb-auth-ticket" aria-hidden="true">
          <Brand />
          <div className="tsb-auth-art"><Illustration size={78} weight="light" /></div>
          <div className="tsb-auth-ticket-footer"><span>Email sign-in</span><span>0{codeStep ? 2 : 1} / 02</span></div>
        </aside>

        <div className="tsb-auth-content">
          <div className="tsb-auth-top">
            <p>Step {codeStep ? 2 : 1} of 2</p>
            <button type="button" className="tsb-auth-close" onClick={onClose} aria-label="Close sign-in">
              <XIcon size={20} />
            </button>
          </div>
          <h2 id="auth-dialog-title">{title}</h2>
          <p id="auth-dialog-description" className="tsb-auth-description">
            {codeStep
              ? <>Enter the six-digit code we sent to <strong>{email}</strong>.</>
              : 'We’ll send you a one-time code to continue.'}
          </p>

          <form onSubmit={(event) => {
            event.preventDefault();
            void submit(codeStep ? 'verify' : 'send');
          }}>
            <label htmlFor="auth-field">{codeStep ? 'Verification code' : 'Email address'}</label>
            {codeStep ? (
              <input
                key="code"
                ref={fieldRef}
                id="auth-field"
                className="tsb-auth-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                placeholder="000000"
                value={code}
                readOnly={Boolean(pending)}
                onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              />
            ) : (
              <input
                key="email"
                ref={fieldRef}
                id="auth-field"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                value={email}
                readOnly={Boolean(pending)}
                onChange={(event) => setEmail(event.target.value)}
              />
            )}

            {feedback && (
              <p className={feedback.error ? 'tsb-auth-feedback is-error' : 'tsb-auth-feedback'} role={feedback.error ? 'alert' : 'status'}>
                {feedback.message}
              </p>
            )}

            <button className="tsb-auth-submit" type="submit" disabled={Boolean(pending) || (codeStep && code.length !== 6)}>
              {codeStep ? (pending === 'verify' ? 'Verifying…' : 'Verify and continue') : (pending === 'send' ? 'Sending…' : 'Send sign-in code')}
              <ArrowRightIcon size={18} />
            </button>
          </form>

          {codeStep && (
            <div className="tsb-auth-recovery">
              <button type="button" disabled={Boolean(pending)} onClick={changeEmail}><ArrowLeftIcon size={15} /> Change email</button>
              <button type="button" disabled={Boolean(pending)} onClick={() => void submit('resend')}>
                {pending === 'resend' ? 'Sending…' : 'Resend code'}
              </button>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
