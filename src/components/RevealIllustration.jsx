import { useId } from 'react';

export default function RevealIllustration({ outcome = 'win' }) {
  const titleId = useId();
  return (
    <svg className={`tsb-reveal-art tsb-reveal-art-${outcome}`} viewBox="0 0 500 360" role="img" aria-labelledby={titleId}>
      <title id={titleId}>Open-box illustration showing {outcome === 'win' ? 'a product win' : outcome === 'lose' ? 'a stake being used' : 'a retry with the same stake'}. Decorative paths do not represent probabilities.</title>
      <defs><pattern id={`${titleId}-dots`} width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="currentColor" opacity=".15" /></pattern></defs>
      <rect x="28" y="35" width="444" height="290" fill={`url(#${titleId}-dots)`} />
      <ellipse className="tsb-art-orbit" cx="248" cy="194" rx="205" ry="112" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 8" opacity=".35" transform="rotate(-16 248 194)" />
      <path d="M65 250C44 173 124 80 210 64M297 66c76 13 142 75 148 130" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".6" />
      <path d="m202 58 12 6-7 12m230 109 10 13 8-13" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <ellipse cx="255" cy="296" rx="98" ry="10" fill="currentColor" opacity=".07" />
      <g className="tsb-art-lid"><path d="m153 163 45-61 111-23 25 22-73 76Z" fill="#ff7057"/><path d="m153 163 108 14 73-76" fill="none" stroke="#ffad99" strokeWidth="1.5"/></g>
      <g><path d="m160 188 76 34v67l-76-39Z" fill="#f1eee7"/><path d="m247 222 73-38v67l-73 40Z" fill="#bcb5a9"/><path d="m160 188 73-35 87 31-73 38Z" fill="#50433a"/><path d="m236 164 65 24-65 33Z" fill="#ff7057"/><path d="m174 222 44 20m-44-9 29 13" stroke="#84796c" strokeWidth="2"/></g>
      <g className="tsb-art-prize"><path d="m263 55 17-13 14 4 10 22 32 12-7 14-53-13-23-14Z" fill="#d8e3bc" stroke="#1b1918" strokeWidth="2"/><path d="m274 64 17 5m-14-12 13 5m-30 12 68 17" stroke="#7c8b65" strokeWidth="2"/><path d="M171 84v-9a24 24 0 0 1 48 0v10" fill="none" stroke="#f1eee7" strokeWidth="8"/><rect x="166" y="77" width="13" height="25" rx="5" fill="#d5bd8a"/><rect x="211" y="77" width="13" height="25" rx="5" fill="#d5bd8a"/></g>
      <g className="tsb-art-retry"><path d="M211 112a40 40 0 1 1-3 49" fill="none" stroke="#e3c279" strokeWidth="8"/><path d="m209 112 1 23 22-7" fill="none" stroke="#e3c279" strokeWidth="8"/></g>
      <g className="tsb-art-loss"><path d="m220 97 44 44m0-44-44 44" stroke="#edaaa6" strokeWidth="8" strokeLinecap="round"/></g>
      <path className="tsb-art-rays" d="m338 122 10-21m4 36 22-10m-20 29 21 4" stroke="#ff7057" strokeWidth="5" strokeLinecap="round"/>
      <g transform="translate(43 252) rotate(-8)"><rect width="113" height="38" rx="3" fill="#d8e3bc"/><text x="15" y="24" fill="#243321" fontSize="11" fontFamily="sans-serif" fontWeight="700">YOUR PICK.</text></g>
      <g transform="translate(350 65) rotate(7)"><rect width="108" height="38" rx="3" fill="#e6cfab"/><text x="14" y="24" fill="#382b1d" fontSize="11" fontFamily="sans-serif" fontWeight="700">YOUR ROUND.</text></g>
    </svg>
  );
}
