export default function Brand({ className = '' }) {
  return (
    <span className={`tsb-brand ${className}`}>
      <img src="/reveal-fold.svg" width="36" height="36" alt="" />
      <span>Temu<span className="tsb-brand-accent">Spin</span>Box</span>
    </span>
  );
}
