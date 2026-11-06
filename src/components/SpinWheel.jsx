import { useEffect, useRef, useState } from 'react';
import { ArrowClockwiseIcon } from '@phosphor-icons/react';
import '@styles/components/SpinWheel.css';

const outcomes = [
  { id: 'WIN', label: 'Win item' },
  { id: 'TRY_AGAIN', label: 'Try again' },
  { id: 'LOSE', label: 'Lose' },
];

export default function SpinWheel({ onRequestServerSpin, onSpinResult, onBusyChange, buttonText, disabled }) {
  const disc = useRef(null);
  const animation = useRef(null);
  const rotation = useRef(0);
  const locked = useRef(false);
  const mounted = useRef(false);
  const [phase, setPhase] = useState('');

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      animation.current?.cancel();
    };
  }, []);

  async function spin() {
    if (locked.current || disabled) return;
    locked.current = true;
    onBusyChange(true);
    setPhase('Checking your round…');

    try {
      const result = await onRequestServerSpin();
      if (!result || !mounted.current) return;
      const index = outcomes.findIndex(({ id }) => id === result.outcome);
      if (index !== -1 && disc.current) {
        const start = rotation.current;
        const offset = ((-index * 120 - start) % 360 + 360) % 360;
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const end = start + offset + (reducedMotion ? 0 : 1440);
        if (!reducedMotion && typeof disc.current.animate === 'function') {
          setPhase('Revealing your result…');
          animation.current = disc.current.animate(
            [{ transform: `rotate(${start}deg)` }, { transform: `rotate(${end}deg)` }],
            { duration: 2400, easing: 'cubic-bezier(.15,.68,.15,1)', fill: 'forwards' },
          );
          try { await animation.current.finished; } catch { /* Reveal the recorded result if motion was interrupted. */ }
        }
        if (!mounted.current || !disc.current) return;
        rotation.current = end % 360;
        disc.current.style.transform = `rotate(${rotation.current}deg)`;
        animation.current?.cancel();
        animation.current = null;
      }
      onSpinResult(result);
    } finally {
      locked.current = false;
      if (mounted.current) {
        setPhase('');
        onBusyChange(false);
      }
    }
  }

  return (
    <div className="play-wheel">
      <div className="play-wheel-frame" aria-hidden="true">
        <span className="play-wheel-pointer" />
        <div className="play-wheel-disc" ref={disc}>
          {outcomes.map(({ id, label }, index) => (
            <span className={`play-wheel-label play-wheel-label-${index}`} key={id}>{label}</span>
          ))}
        </div>
        <div className="play-wheel-hub"><img src="/reveal-fold.svg" width="40" height="40" alt="" /></div>
      </div>
      <p className="play-wheel-caption">Wheel segments illustrate outcomes. They don’t show the odds.</p>
      <button type="button" onClick={spin} disabled={disabled || Boolean(phase)} className="play-primary">
        {phase || buttonText}<ArrowClockwiseIcon size={18} />
      </button>
      <span className="play-sr-only" role="status">{phase}</span>
    </div>
  );
}
