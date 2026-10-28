import { Link } from 'react-router';

export function Monogram({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="14" fill="#14294a" stroke="#a47a36" strokeWidth="2" />
      <path d="M18 46V18h6v11h16V18h6v28h-6V34H24v12z" fill="#d9bc86" />
      <path d="M14 51h36" stroke="#a47a36" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export default function Brand({ to = '/', light = true }) {
  return (
    <Link to={to} className="d-inline-flex align-items-center gap-2 text-decoration-none" aria-label="HotelPro home">
      <Monogram />
      <span style={{ fontFamily: 'var(--hp-font-display)', fontSize: '1.45rem', letterSpacing: '0.04em', color: light ? '#f3ead8' : 'var(--hp-navy)' }}>
        HotelPro
      </span>
    </Link>
  );
}
