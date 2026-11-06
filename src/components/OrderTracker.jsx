import { ArrowUpRightIcon, PackageIcon } from '@phosphor-icons/react';
import { useCurrency } from '@/context/CurrencyContext';
import '@styles/components/OrderTracker.css';

const stages = [
  ['PENDING', 'Requested'],
  ['PROCESSING', 'Preparing'],
  ['SHIPPED', 'Shipped'],
  ['DELIVERED', 'Delivered'],
];

export default function OrderTracker({ wins = [], onClaimUnclaimed }) {
  const { formatMoney } = useCurrency();
  return (
    <section className="tsb-orders" aria-labelledby="orders-title">
      <header><p>TemuSpinBox / Prizes</p><h2 id="orders-title">Orders</h2></header>
      {wins.length === 0 && <p className="orders-empty"><PackageIcon size={23} /> Wins and claim updates will appear here.</p>}
      <ul className="orders-list">
        {wins.map((win) => {
          const unclaimed = !win.fulfillment_choice;
          const wallet = win.fulfillment_choice === 'LIQUIDATED';
          const delivery = win.fulfillment_choice === 'SHIPPED';
          const stageIndex = stages.findIndex(([key]) => key === win.shipping_status);
          const status = unclaimed ? 'Ready to claim' : wallet ? 'Paid to wallet' : delivery ? stages[stageIndex]?.[1] ?? 'Status unavailable' : 'Status unavailable';
          const variants = [win.product_attributes?.size, win.product_attributes?.color].filter(Boolean).join(' / ');
          return (
            <li className="orders-item" key={win.id}>
              <div className="orders-item-heading">
                <div><h3>{win.product_title || 'Temu item'}</h3><p>Item value {formatMoney(win.retail_value_usd)}</p></div>
                <span className="orders-status">{status}</span>
              </div>
              {unclaimed && <button className="orders-claim" type="button" onClick={() => onClaimUnclaimed(win)}>Claim prize <ArrowUpRightIcon size={17} /></button>}
              {wallet && win.liquidation_cash_usd != null && <p className="orders-detail">{formatMoney(win.liquidation_cash_usd)} added to your wallet.</p>}
              {delivery && (
                <>
                  {stageIndex >= 0 && (
                    <ol className="orders-steps" aria-label="Delivery progress">
                      {stages.map(([key, label], index) => <li key={key} data-reached={index <= stageIndex} aria-current={index === stageIndex ? 'step' : undefined}>{label}</li>)}
                    </ol>
                  )}
                  <div className="orders-detail">
                    {variants && <p>Variant: {variants}</p>}
                    <p>{win.tracking_number ? <>Tracking number: <code>{win.tracking_number}</code></> : 'Tracking number pending.'}</p>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
