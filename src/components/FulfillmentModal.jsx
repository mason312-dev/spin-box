import { useEffect, useRef, useState } from 'react';
import { ArrowRightIcon, PackageIcon, WalletIcon, XIcon } from '@phosphor-icons/react';
import { useCurrency } from '@/context/CurrencyContext';
import { supabase } from '@services/supabaseClient';
import '@styles/components/FulfillmentModal.css';

const deliveryMinimum = 33;
const productFields = [
  ['size', 'Size', '', true],
  ['color', 'Color or style', '', true],
  ['customNotes', 'Variant notes (optional)'],
];
const deliveryFields = [
  ['fullName', 'Recipient name', 'name', true],
  ['phone', 'Phone number', 'tel', true],
  ['streetAddress', 'Street address and unit', 'street-address', true],
  ['city', 'City', 'address-level2', true],
  ['stateProvince', 'State or province', 'address-level1', true],
  ['postalCode', 'Postal code', 'postal-code', true],
  ['country', 'Country', 'country-name', true],
];

export default function FulfillmentModal({ winRecord, ...props }) {
  return winRecord ? <ClaimDialog key={winRecord.id} winRecord={winRecord} {...props} /> : null;
}

function ClaimDialog({ winRecord, onClose, onFulfillmentSuccess }) {
  const { formatMoney } = useCurrency();
  const retail = Number(winRecord.retail_value_usd);
  const validRetail = winRecord.retail_value_usd != null && Number.isFinite(retail) && retail > 0;
  const canDeliver = validRetail && retail >= deliveryMinimum;
  const payout = Math.ceil(Math.round(retail * 100) / 2) / 100;
  const [choice, setChoice] = useState(canDeliver ? '' : 'wallet');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [brokenImage, setBrokenImage] = useState(false);
  const locked = useRef(false);
  const dialog = useRef(null);

  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  function close() {
    if (!locked.current) onClose(Boolean(feedback?.uncertain));
  }

  async function submit(event) {
    event.preventDefault();
    const shippingClaim = choice === 'delivery';
    if (locked.current || feedback?.uncertain || !validRetail || winRecord.fulfillment_choice
      || (shippingClaim ? !canDeliver : choice !== 'wallet')) return;

    const form = new FormData(event.currentTarget);
    const collect = (fields) => Object.fromEntries(fields.map(([key]) => [key, String(form.get(key) ?? '').trim()]));
    const attributes = shippingClaim ? collect(productFields) : null;
    const shipping = shippingClaim ? collect(deliveryFields) : null;
    if (shippingClaim && [...productFields, ...deliveryFields].some(([key, , , required]) => required && !(attributes[key] || shipping[key]))) {
      setFeedback({ text: 'Fill in the required item options and delivery details.' });
      return;
    }

    locked.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const params = { p_spin_id: winRecord.id };
      if (shippingClaim) Object.assign(params, { p_attributes: attributes, p_shipping: shipping });
      const { data, error, status } = await supabase.rpc(
        shippingClaim ? 'submit_spin_shipping' : 'claim_spin_liquidation', params,
      );
      if (error && status >= 400 && status < 500 && status !== 408 && !/already been/i.test(error.message)) {
        setFeedback({ text: error.code === 'P0001' ? error.message : 'The claim was declined. Check your details and try again.' });
        return;
      }
      if (error || (shippingClaim ? data !== true : data == null || !Number.isFinite(Number(data)))) {
        setFeedback({ uncertain: true, text: 'Check Orders before submitting another claim. We couldn’t confirm this request.' });
        return;
      }
      onFulfillmentSuccess(shippingClaim
        ? { type: 'SHIPPED', spinId: winRecord.id, attributes }
        : { type: 'LIQUIDATED', spinId: winRecord.id, payoutUsd: payout, newBalance: data });
    } catch {
      setFeedback({ uncertain: true, text: 'Check Orders before submitting another claim. We couldn’t confirm this request.' });
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <dialog className="tsb-claim" ref={dialog} aria-labelledby="claim-title" onCancel={(event) => { event.preventDefault(); close(); }}>
      <header className="claim-header">
        <div><p>TemuSpinBox / Prizes</p><h2 id="claim-title">Claim your win</h2></div>
        <button className="claim-control claim-close" type="button" aria-label="Close claim" disabled={busy} onClick={close}><XIcon size={20} /></button>
      </header>
      <div className="claim-body">
        <aside className="claim-item">
          <div className="claim-image">
            {winRecord.image_url && !brokenImage
              ? <img src={winRecord.image_url} alt="" onError={() => setBrokenImage(true)} />
              : <PackageIcon size={52} weight="light" />}
          </div>
          <p>Winning item</p>
          <h3>{winRecord.product_title || 'Temu item'}</h3>
          <strong>{validRetail ? formatMoney(retail) : 'Value unavailable'}</strong>
        </aside>
        <section className="claim-task" aria-labelledby="claim-options">
          <h3 id="claim-options">Choose how to claim it</h3>
          {!validRetail || winRecord.fulfillment_choice ? <p>Claim options are unavailable for this item. Check its status in Orders.</p> : (
            <>
              <div className="claim-options" role="group" aria-label="Claim options">
                <button type="button" className="claim-control" aria-pressed={choice === 'wallet'} disabled={busy || feedback?.uncertain} onClick={() => { setChoice('wallet'); setFeedback(null); }}>
                  <WalletIcon size={20} /><span><strong>Wallet payout</strong><small>{formatMoney(payout)} · 50% of item value</small></span>
                </button>
                <button type="button" className="claim-control" aria-pressed={choice === 'delivery'} disabled={!canDeliver || busy || feedback?.uncertain} onClick={() => { setChoice('delivery'); setFeedback(null); }}>
                  <PackageIcon size={20} /><span><strong>Delivery</strong><small>{canDeliver ? 'Receive the item' : `Available from ${formatMoney(deliveryMinimum)}`}</small></span>
                </button>
              </div>
              <form onSubmit={submit} className="claim-form">
                <fieldset disabled={busy || feedback?.uncertain}>
                  {choice === 'wallet' && <p className="claim-note">The payout goes to your TemuSpinBox wallet. You give up delivery of this item when you confirm.</p>}
                  <div hidden={choice !== 'delivery'}>
                    <div className="claim-fields">
                      <h4>Item options</h4>
                      <p className="claim-note">Enter N/A for size or style if it doesn’t apply.</p>
                      <ClaimFields fields={productFields} active={choice === 'delivery'} />
                      <h4>Delivery details</h4>
                      <ClaimFields fields={deliveryFields} active={choice === 'delivery'} />
                      <p className="claim-note">After submitting, you can check progress and tracking in Orders.</p>
                    </div>
                  </div>
                  {choice && <button className="claim-primary" type="submit">{busy ? 'Submitting…' : choice === 'wallet' ? 'Confirm wallet payout' : 'Submit delivery request'}<ArrowRightIcon size={18} /></button>}
                </fieldset>
              </form>
              {feedback && <p className="claim-feedback" role="alert">{feedback.text}</p>}
            </>
          )}
        </section>
      </div>
    </dialog>
  );
}

function ClaimFields({ fields, active }) {
  return fields.map(([key, label, autocomplete, required]) => (
    <label key={key} className={['streetAddress', 'customNotes'].includes(key) ? 'claim-field-wide' : undefined}>
      {label}
      <input name={key} type={key === 'phone' ? 'tel' : 'text'} autoComplete={autocomplete || 'off'} required={active && required} disabled={!active} />
    </label>
  ));
}
