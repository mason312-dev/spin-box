import { useEffect, useRef, useState } from 'react';
import { SpeakerHighIcon, SpeakerSlashIcon, ArrowUpRightIcon, GiftIcon, ArrowClockwiseIcon } from '@phosphor-icons/react';
import confetti from 'canvas-confetti';
import { useCurrency } from '@/context/CurrencyContext';
import '@styles/components/WelcomeWheel.css';

const SEQUENCE = [0, 3, 1];
const FILLS = ['#302b25', '#ff7057', '#ded1b9', '#302b25', '#d0ddb0', '#ded1b9'];
const INKS = ['#f1eee7', '#28140e', '#302b25', '#f1eee7', '#273121', '#302b25'];
const PROGRESS_KEY = 'spinbox_welcome_step_v1';
function initialStep() {
  try { const value = Number(localStorage.getItem(PROGRESS_KEY)); return Number.isInteger(value) && value >= 0 && value <= 3 ? value : 0; } catch { return 0; }
}
function point(angle, radius) { const radians = angle * Math.PI / 180; return [250 + Math.cos(radians) * radius, 250 + Math.sin(radians) * radius]; }

export default function WelcomeWheel({ onClaim }) {
  const { formatMoney } = useCurrency();
  const [step, setStep] = useState(initialStep);
  const [spinning, setSpinning] = useState(false);
  const [sound, setSound] = useState(false);
  const [message, setMessage] = useState('No deposit needed for this welcome spin.');
  const disc = useRef(null);
  const angle = useRef(0);
  const frame = useRef(null);
  const locked = useRef(false);
  const audio = useRef(null);
  const soundEnabled = useRef(false);
  const mounted = useRef(true);
  const ready = step === 3;
  const reward = formatMoney(1);
  const shortReward = reward.replace(/\s[A-Z]{3}$/, '');

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (frame.current) cancelAnimationFrame(frame.current);
      audio.current?.close().catch(() => {});
    };
  }, []);

  function tick() {
    if (!soundEnabled.current || !audio.current || audio.current.state !== 'running') return;
    const ctx = audio.current;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 680;
    gain.gain.setValueAtTime(0.025, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    oscillator.connect(gain); gain.connect(ctx.destination);
    oscillator.start(); oscillator.stop(ctx.currentTime + 0.04);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  function toggleSound() {
    const enabled = !sound;
    setSound(enabled); soundEnabled.current = enabled;
    if (enabled) {
      try {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        if (!audio.current || audio.current.state === 'closed') audio.current = new Audio();
        audio.current.resume().catch(() => {});
      } catch { /* Sound is optional. */ }
    }
  }
  function spin() {
    if (locked.current || ready) return;
    locked.current = true; setSpinning(true); setMessage('Spinning your free welcome wheel…');
    const index = SEQUENCE[step];
    const current = angle.current;
    const base = -30 - index * 60;
    const difference = ((base - current) % 360 + 360) % 360;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const target = current + (reduced ? 0 : 1440) + difference;
    const duration = reduced ? 100 : 2900;
    let started;
    let lastTick = current;
    function animate(time) {
      if (!mounted.current) return;
      started ??= time;
      const progress = Math.min((time - started) / duration, 1);
      angle.current = reduced ? (progress === 1 ? target : current) : current + (target - current) * (1 - (1 - progress) ** 3);
      if (disc.current) disc.current.style.transform = `rotate(${angle.current}deg)`;
      if (!reduced && Math.abs(angle.current - lastTick) >= 60) { tick(); lastTick = angle.current; }
      if (progress < 1) { frame.current = requestAnimationFrame(animate); return; }
      const next = step + 1;
      try {
        localStorage.setItem(PROGRESS_KEY, String(next));
        if (next === 3) localStorage.setItem('spinbox_pending_welcome_bonus', '1.00');
      } catch { /* Progress still works in memory. */ }
      setStep(next); setSpinning(false); locked.current = false;
      setMessage(next === 3 ? 'Welcome reward ready. Verify your email to claim it.' : 'Try again. Your next welcome spin is free.');
      if (next === 3 && !reduced) confetti({ particleCount: 45, spread: 55, origin: { y: 0.55 }, colors: ['#ff7057', '#f1eee7', '#d0ddb0'], disableForReducedMotion: true });
    }
    frame.current = requestAnimationFrame(animate);
  }
  return (
    <section className={`welcome-game${ready ? ' welcome-game-ready' : ''}`} id="welcome-game" aria-labelledby="welcome-game-title">
      <div className="welcome-game-top"><span><GiftIcon size={17} /> New player welcome</span><button type="button" className="welcome-sound" onClick={toggleSound} aria-pressed={sound} aria-label={sound ? 'Mute wheel sound' : 'Enable wheel sound'}>{sound ? <SpeakerHighIcon size={19} /> : <SpeakerSlashIcon size={19} />}</button></div>
      <h2 id="welcome-game-title">{ready ? 'Your welcome reward' : 'Free welcome wheel'}</h2>
      <div className="welcome-wheel-shell">
        <div className="welcome-wheel-pointer" aria-hidden="true" />
        <svg className="welcome-wheel-disc" ref={disc} viewBox="0 0 500 500" aria-hidden="true">
          <circle cx="250" cy="250" r="245" fill="#74634d" />
          {FILLS.map((fill, index) => {
            const start = -90 + index * 60; const end = start + 60;
            const a = point(start, 232); const b = point(end, 232); const mid = start + 30; const center = point(mid, 162);
            const label = index === 0 || index === 3 ? 'TRY AGAIN' : index === 1 || index === 4 ? 'WELCOME' : 'FREE SPIN';
            return <g key={index}><path d={`M250 250 L${a.join(' ')} A232 232 0 0 1 ${b.join(' ')} Z`} fill={fill} stroke="#1b1918" strokeWidth="2" /><g transform={`translate(${center.join(' ')}) rotate(${mid + 90})`} fill={INKS[index]} textAnchor="middle" fontFamily="Outfit Variable, sans-serif" fontWeight="600"><text y={label === 'WELCOME' ? -8 : 5} fontSize="18">{label}</text>{label === 'WELCOME' && <text y="18" fontSize={shortReward.length > 14 ? 15 : 20}>{shortReward}</text>}</g></g>;
          })}
          <circle cx="250" cy="250" r="56" fill="#1b1918" stroke="#74634d" strokeWidth="3" />
        </svg>
        <div className="welcome-wheel-hub" aria-hidden="true"><img src="/reveal-fold.svg" alt="" width="42" height="42" /></div>
      </div>
      <div className="welcome-reward-line"><span>{ready ? 'Ready to claim' : 'Welcome reward'}</span><strong>{reward}</strong></div>
      <p className="welcome-feedback" role="status" aria-live="polite">{ready ? 'Verify your email to claim your welcome reward.' : message}</p>
      {ready ? <button type="button" className="tsb-button welcome-spin-button" onClick={onClaim}>Claim {reward} <ArrowUpRightIcon size={19} /></button> : <button type="button" className="tsb-button welcome-spin-button" onClick={spin} disabled={spinning}>{spinning ? 'Spinning…' : step ? 'Try again for free' : 'Spin for free'}<ArrowClockwiseIcon size={20} /></button>}
      {ready && <p className="welcome-game-disclosure">For eligible new accounts. Use it on items worth up to {formatMoney(2)}.</p>}
    </section>
  );
}
