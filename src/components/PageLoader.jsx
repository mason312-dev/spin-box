export default function PageLoader() {
  return (
    <div className="tsb-page-loader" role="status" aria-label="Loading TemuSpinBox">
      <img src="/reveal-fold.svg" width="64" height="64" alt="" />
      <p className="tsb-loader-brand">Temu<span>Spin</span>Box</p>
      <div className="tsb-loader-progress" aria-hidden="true" />
      <p className="tsb-loader-caption">Getting things ready…</p>
    </div>
  );
}
