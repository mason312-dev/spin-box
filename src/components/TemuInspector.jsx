import { useRef, useState } from 'react';
import { LinkSimpleIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import '@styles/components/TemuInspector.css';

function isProductInput(value) {
  if (/^[A-Z0-9_-]{5,20}$/i.test(value)) return true;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname === 'temu.com' || url.hostname.endsWith('.temu.com');
  } catch {
    return false;
  }
}

export default function TemuInspector({ userDepositBalance, onSelectProduct, onLoadingChange, disabled }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);

  async function handleInspect(event) {
    event.preventDefault();
    if (pending.current || disabled) return;
    const input = url.trim();
    if (!isProductInput(input)) {
      setError('Enter a Temu product link, share link, or item ID.');
      return;
    }

    pending.current = true;
    setLoading(true);
    onLoadingChange(true);
    setError('');
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${apiBase}/api/temu/check-price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: input, userDepositBalance }),
      });
      const result = await response.json();
      const price = Number(result.data?.priceUsd);
      if (!response.ok || !result.success || !result.data?.id || !result.data?.title || !Number.isFinite(price) || price <= 0) {
        setError('We couldn’t check that item. Check the link or try again.');
        return;
      }
      onSelectProduct(result.data);
    } catch {
      setError('We couldn’t reach the item checker. Try again in a moment.');
    } finally {
      pending.current = false;
      setLoading(false);
      onLoadingChange(false);
    }
  }

  return (
    <div className="play-inspector">
      <form onSubmit={handleInspect}>
        <label htmlFor="play-item-link"><LinkSimpleIcon size={17} /> Temu product link or item ID</label>
        <div className="play-inspector-input">
          <input
            id="play-item-link"
            required
            autoComplete="off"
            placeholder="Paste a Temu link"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            readOnly={disabled || loading}
            aria-describedby={error ? 'play-inspector-error' : undefined}
          />
          <button type="submit" className="play-secondary" disabled={disabled || loading}>
            <MagnifyingGlassIcon size={17} /> {loading ? 'Checking…' : 'Check item'}
          </button>
        </div>
      </form>
      {error && <p className="play-inspector-error" id="play-inspector-error" role="alert">{error}</p>}
    </div>
  );
}
