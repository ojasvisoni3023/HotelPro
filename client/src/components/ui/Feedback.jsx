import { CircleAlert, Inbox, RefreshCw } from 'lucide-react';
import { errorMessage } from '../../api/client';

export function Spinner({ label = 'Loading' }) {
  return (
    <div className="d-flex align-items-center gap-2 text-muted py-4" role="status" aria-live="polite">
      <span className="spinner-border spinner-border-sm" aria-hidden="true" />
      <span>{label}…</span>
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="container py-5" aria-busy="true">
      <Skeleton height={36} width="40%" className="mb-3" />
      <Skeleton height={18} width="65%" className="mb-4" />
      <div className="row g-3">
        {[0, 1, 2].map((i) => (
          <div className="col-md-4" key={i}>
            <Skeleton height={180} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Skeleton({ height = 16, width = '100%', className = '' }) {
  return <div className={`skeleton ${className}`} style={{ height, width }} aria-hidden="true" />;
}

export function SkeletonRows({ rows = 5 }) {
  return (
    <div className="p-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={20} className="mb-3" width={`${90 - (i % 3) * 12}%`} />
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, children, action }) {
  return (
    <div className="text-center py-5 px-3">
      <Icon size={36} strokeWidth={1.4} className="text-brass mb-3" aria-hidden="true" />
      <h3 className="h4 mb-2">{title}</h3>
      {children && <p className="text-muted mx-auto mb-3" style={{ maxWidth: 440 }}>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'This could not be loaded' }) {
  return (
    <div className="text-center py-5 px-3" role="alert">
      <CircleAlert size={32} strokeWidth={1.5} className="mb-3" style={{ color: 'var(--hp-rust)' }} aria-hidden="true" />
      <h3 className="h4 mb-2">{title}</h3>
      <p className="text-muted mb-3">{errorMessage(error)}</p>
      {onRetry && (
        <button type="button" className="btn btn-quiet" onClick={onRetry}>
          <RefreshCw size={16} className="me-2" aria-hidden="true" />
          Try again
        </button>
      )}
    </div>
  );
}

export function InlineAlert({ tone = 'info', children, className = '' }) {
  const styles = {
    info: { background: '#e8eef7', color: 'var(--hp-navy)', borderColor: '#cfdaea' },
    warn: { background: 'var(--hp-amber-soft)', color: '#6b4e12', borderColor: '#ead6ae' },
    bad: { background: 'var(--hp-rust-soft)', color: 'var(--hp-rust)', borderColor: '#ecc8bf' },
    good: { background: 'var(--hp-lake-soft)', color: 'var(--hp-lake)', borderColor: '#c4ddd9' },
    test: { background: '#f3ecfa', color: '#5b3488', borderColor: '#e0d0f1' },
  }[tone];
  return (
    <div className={`border rounded-2 px-3 py-2 small ${className}`} style={styles} role={tone === 'bad' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
