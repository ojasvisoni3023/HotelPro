import { useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { money } from '../../utils/format';

/* Validated chart hues (dataviz validator, white surface): both pass band, chroma, CVD and 3:1 contrast. */
export const CHART = { blue: '#3b6fb0', brass: '#b07d27', grid: '#ece6da', axis: '#6b7280' };

const shortDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const compactInr = (v) => (v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : v >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`);

function TipBox({ active, payload, label, format }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="panel px-3 py-2 small" style={{ boxShadow: 'var(--hp-shadow-float)' }}>
      <div className="text-muted">{shortDate(label)}</div>
      <div className="fw-semibold num">{format(payload[0].value)}</div>
    </div>
  );
}

/**
 * A chart panel with a title and a "table" toggle so every figure also has a
 * non-visual, screen-reader friendly view.
 */
export function ChartCard({ title, subtitle, data, columns, children, height = 240 }) {
  const [table, setTable] = useState(false);
  return (
    <section className="panel h-100">
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          {subtitle && <div className="small text-muted">{subtitle}</div>}
        </div>
        <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setTable((t) => !t)} aria-pressed={table}>
          {table ? 'Show chart' : 'Show table'}
        </button>
      </div>
      <div className="p-3">
        {table ? (
          <div className="table-responsive" style={{ maxHeight: height + 20 }}>
            <table className="table table-sm num">
              <thead>
                <tr>{columns.map((c) => <th key={c.key} scope="col">{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i}>{columns.map((c) => <td key={c.key}>{c.format ? c.format(row[c.key]) : row[c.key]}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ height }} role="img" aria-label={`${title} chart. Use "Show table" for the values.`}>
            {children}
          </div>
        )}
      </div>
    </section>
  );
}

const axisProps = { tick: { fill: CHART.axis, fontSize: 12 }, tickLine: false, axisLine: false };

export function RevenueChart({ series, height }) {
  return (
    <ChartCard
      title="Revenue received"
      subtitle="Captured payments per day, by payment date"
      data={series}
      height={height}
      columns={[{ key: 'date', label: 'Date', format: shortDate }, { key: 'revenue', label: 'Revenue', format: (v) => money(v) }]}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={24} {...axisProps} />
          <YAxis tickFormatter={compactInr} width={52} {...axisProps} />
          <Tooltip cursor={{ fill: 'rgba(59,111,176,0.08)' }} content={<TipBox format={(v) => money(v)} />} />
          <Bar dataKey="revenue" fill={CHART.blue} radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function OccupancyChart({ series, height }) {
  return (
    <ChartCard
      title="Occupancy"
      subtitle="Sold room-nights as a share of sellable rooms"
      data={series}
      height={height}
      columns={[{ key: 'date', label: 'Night', format: shortDate }, { key: 'occupancy', label: 'Occupancy', format: (v) => `${v}%` }]}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="occFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.brass} stopOpacity={0.22} />
              <stop offset="100%" stopColor={CHART.brass} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={24} {...axisProps} />
          <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={44} {...axisProps} />
          <Tooltip cursor={{ stroke: CHART.axis, strokeDasharray: '3 3' }} content={<TipBox format={(v) => `${v}% occupied`} />} />
          <Area type="monotone" dataKey="occupancy" stroke={CHART.brass} strokeWidth={2} fill="url(#occFill)" activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function BookingsChart({ series, height }) {
  return (
    <ChartCard
      title="New bookings"
      subtitle="Reservations created per day"
      data={series}
      height={height}
      columns={[{ key: 'date', label: 'Date', format: shortDate }, { key: 'bookings', label: 'Bookings' }]}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={24} {...axisProps} />
          <YAxis allowDecimals={false} width={32} {...axisProps} />
          <Tooltip cursor={{ fill: 'rgba(59,111,176,0.08)' }} content={<TipBox format={(v) => `${v} booking${v === 1 ? '' : 's'}`} />} />
          <Bar dataKey="bookings" fill={CHART.blue} radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Horizontal labelled bars for a status breakdown (one hue; labels carry identity). */
export function StatusBreakdown({ title = 'Bookings by status', counts, labels }) {
  const rows = Object.entries(counts ?? {}).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <section className="panel h-100">
      <div className="panel-header"><h2>{title}</h2></div>
      <div className="p-3">
        {rows.length === 0 ? (
          <p className="text-muted small mb-0">No bookings in this period.</p>
        ) : (
          <ul className="list-unstyled mb-0">
            {rows.map(([k, v]) => (
              <li key={k} className="mb-2">
                <div className="d-flex justify-content-between small mb-1">
                  <span>{labels?.(k) ?? k}</span>
                  <span className="num fw-semibold">{v}</span>
                </div>
                <div style={{ background: 'var(--hp-stone-soft)', borderRadius: 4, height: 8 }} aria-hidden="true">
                  <div style={{ width: `${(v / max) * 100}%`, background: CHART.blue, height: 8, borderRadius: 4 }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
