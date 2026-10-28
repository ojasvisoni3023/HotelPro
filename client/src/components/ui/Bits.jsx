import { ChevronLeft, ChevronRight, ImageOff, Star } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { statusInfo } from '../../utils/status';

export function StatusBadge({ kind, value, children }) {
  const { label, tone } = statusInfo(kind, value);
  return <span className={`status status-${tone}`}>{children ?? label}</span>;
}

export function TestBadge() {
  return (
    <span className="status status-test" title="Test mode: no real money was moved">
      Test payment
    </span>
  );
}

/** Image with a graceful fallback when the source is missing or fails to load. */
export function Img({ src, alt = '', className = '', style, ratio }) {
  const [failed, setFailed] = useState(false);
  const box = ratio ? { aspectRatio: ratio, ...style } : style;
  if (!src || failed) {
    return (
      <div className={`d-flex flex-column align-items-center justify-content-center text-muted ${className}`} style={{ background: 'var(--hp-stone-soft)', ...box }} role="img" aria-label={alt || 'Image unavailable'}>
        <ImageOff size={28} strokeWidth={1.3} aria-hidden="true" />
        <span className="small mt-1">Photo unavailable</span>
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} style={{ objectFit: 'cover', ...box }} loading="lazy" onError={() => setFailed(true)} />;
}

export function Stars({ value = 0, count, size = 15 }) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <span className="d-inline-flex align-items-center gap-1" aria-label={`Rated ${value || 0} out of 5`}>
      <span className="d-inline-flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} size={size} strokeWidth={1.5} style={{ color: 'var(--hp-brass)', fill: i <= rounded ? 'var(--hp-brass)' : 'transparent' }} />
        ))}
      </span>
      {count !== undefined && <span className="small text-muted num">{value ? value.toFixed(1) : 'New'}{count ? ` (${count})` : ''}</span>}
    </span>
  );
}

export function StarInput({ value, onChange, id }) {
  return (
    <div className="d-flex gap-1" role="radiogroup" aria-labelledby={id}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${i} star${i > 1 ? 's' : ''}`}
          className="btn btn-link p-1"
          onClick={() => onChange(i)}
        >
          <Star size={26} strokeWidth={1.4} style={{ color: 'var(--hp-brass)', fill: i <= value ? 'var(--hp-brass)' : 'transparent' }} />
        </button>
      ))}
    </div>
  );
}

export function Pagination({ meta, onPage }) {
  if (!meta || meta.pages <= 1) return null;
  const { page, pages, total } = meta;
  return (
    <nav className="d-flex align-items-center justify-content-between gap-3 px-3 py-3" aria-label="Pagination">
      <span className="small text-muted num">
        Page {page} of {pages} ({total} total)
      </span>
      <div className="d-flex gap-2">
        <button type="button" className="btn btn-quiet btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft size={16} aria-hidden="true" /> Previous
        </button>
        <button type="button" className="btn btn-quiet btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

export function PageHeader({ title, description, actions, crumbs }) {
  return (
    <header className="mb-4">
      {crumbs?.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="breadcrumb small mb-0">
            {crumbs.map((c, i) => (
              <li key={c.label} className={`breadcrumb-item ${i === crumbs.length - 1 ? 'active' : ''}`} aria-current={i === crumbs.length - 1 ? 'page' : undefined}>
                {c.to && i < crumbs.length - 1 ? <Link to={c.to}>{c.label}</Link> : c.label}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3">
        <div>
          <h1 className="mb-1" style={{ fontSize: 'clamp(1.7rem, 1.4rem + 1vw, 2.2rem)' }}>{title}</h1>
          {description && <p className="text-muted mb-0 measure">{description}</p>}
        </div>
        {actions && <div className="d-flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function StatCard({ label, value, hint, icon: Icon, tone }) {
  return (
    <div className="panel panel-pad h-100">
      <div className="d-flex justify-content-between align-items-start">
        <span className="small text-muted fw-semibold">{label}</span>
        {Icon && <Icon size={18} strokeWidth={1.6} className={tone === 'bad' ? '' : 'text-brass'} style={tone === 'bad' ? { color: 'var(--hp-rust)' } : undefined} aria-hidden="true" />}
      </div>
      <div className="figure num mt-2">
        {value}
      </div>
      {hint && <div className="small text-muted mt-1">{hint}</div>}
    </div>
  );
}

export function Field({ id, label, error, hint, children, className = 'mb-3' }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="form-label">
          {label}
        </label>
      )}
      {children}
      {hint && !error && (
        <div className="form-text" id={`${id}-hint`}>
          {hint}
        </div>
      )}
      {error && (
        <div className="invalid-feedback d-block" id={`${id}-error`}>
          {error}
        </div>
      )}
    </div>
  );
}

export function KeyValue({ label, children }) {
  return (
    <div className="d-flex justify-content-between gap-3 py-2 border-bottom" style={{ borderColor: 'var(--hp-stone-soft)' }}>
      <span className="text-muted">{label}</span>
      <span className="text-end fw-semibold">{children}</span>
    </div>
  );
}
