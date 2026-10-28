import { BedDouble, CalendarDays, Clock, IndianRupee, Undo2, Wallet } from 'lucide-react';
import { useState } from 'react';
import api, { cleanParams } from '../../api/client';
import { useConfig } from '../../context/ConfigContext';
import useApi from '../../hooks/useApi';
import { addDaysIso, date, money, plural } from '../../utils/format';
import { statusInfo } from '../../utils/status';
import { StatCard } from '../ui/Bits';
import { ErrorState, InlineAlert, SkeletonRows } from '../ui/Feedback';
import { BookingsChart, OccupancyChart, RevenueChart, StatusBreakdown } from './Charts';

const PRESETS = [
  [7, 'Last 7 days'],
  [30, 'Last 30 days'],
  [90, 'Last 90 days'],
];

/** Shared analytics: KPIs + charts for one hotel (hotelId) or the whole platform (hotelId null, admin). */
export default function AnalyticsView({ hotelId, endpoint = '/manage/analytics', showForward = true }) {
  const { config } = useConfig();
  const today = config?.today;
  const [range, setRange] = useState({ days: 30, from: '', to: '' });
  const to = range.to || today;
  const from = range.from || (today ? addDaysIso(today, -(range.days - 1)) : '');
  const { data, loading, error, reload } = useApi(() => api.get(endpoint, { params: cleanParams({ hotel: hotelId, from, to }) }), [hotelId, from, to, endpoint], { skip: !today });
  const forward = useApi(() => api.get(endpoint, { params: cleanParams({ hotel: hotelId, from: today, to: today && addDaysIso(today, 29) }) }), [hotelId, today, endpoint], { skip: !today || !showForward });

  return (
    <div className="d-grid gap-4">
      <div className="d-flex flex-wrap gap-2 align-items-end">
        <div className="d-flex flex-wrap gap-1" role="group" aria-label="Date range">
          {PRESETS.map(([d, label]) => (
            <button key={d} type="button" className={`btn btn-sm ${!range.from && range.days === d ? 'btn-primary' : 'btn-quiet'}`} onClick={() => setRange({ days: d, from: '', to: '' })}>
              {label}
            </button>
          ))}
        </div>
        <div className="d-flex gap-2 align-items-end">
          <div>
            <label className="form-label small mb-0" htmlFor="an-from">From</label>
            <input id="an-from" type="date" className="form-control form-control-sm" value={from} max={to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value, to: r.to || today }))} />
          </div>
          <div>
            <label className="form-label small mb-0" htmlFor="an-to">To</label>
            <input id="an-to" type="date" className="form-control form-control-sm" value={to} min={from} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value, from: r.from || from }))} />
          </div>
        </div>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading || !data ? (
        <SkeletonRows rows={6} />
      ) : (
        <>
          {data.revenue.testModeRevenue > 0 && (
            <InlineAlert tone="test">
              {data.revenue.testModeRevenue === data.revenue.paid ? 'All' : `${money(data.revenue.testModeRevenue)} of the`} revenue in this period comes from test-mode payments (seeded or simulated). It is shown so the dashboards can be evaluated; it is not real money.
            </InlineAlert>
          )}
          <div className="row g-3">
            <div className="col-6 col-xl-2"><StatCard label="Revenue received" value={money(data.revenue.paid)} icon={IndianRupee} hint={`${date(data.period.from, { year: undefined })} – ${date(data.period.to, { year: undefined })}`} /></div>
            <div className="col-6 col-xl-2"><StatCard label="Refunded" value={money(data.revenue.refunded)} icon={Undo2} hint="Refunds processed" /></div>
            <div className="col-6 col-xl-2"><StatCard label="Net revenue" value={money(data.revenue.net)} icon={Wallet} hint="Received minus refunds" /></div>
            <div className="col-6 col-xl-2"><StatCard label="Occupancy" value={`${data.occupancy.rate}%`} icon={BedDouble} hint={`${data.occupancy.soldRoomNights} of ${data.occupancy.capacityRoomNights} room-nights`} /></div>
            <div className="col-6 col-xl-2"><StatCard label="Booking value" value={money(data.revenue.bookingValue)} icon={CalendarDays} hint="Sold stays arriving in period" /></div>
            <div className="col-6 col-xl-2"><StatCard label="Awaiting payment" value={money(data.revenue.pendingValue)} icon={Clock} hint={plural(data.revenue.pendingCount, 'unpaid hold')} /></div>
          </div>
          <div className="row g-4">
            <div className="col-lg-8"><RevenueChart series={data.series} /></div>
            <div className="col-lg-4">
              <StatusBreakdown title="Bookings made, by status" counts={data.bookings.byStatus} labels={(k) => statusInfo('booking', k).label} />
            </div>
            <div className="col-lg-6"><OccupancyChart series={data.series} /></div>
            <div className="col-lg-6"><BookingsChart series={data.series} /></div>
            {showForward && forward.data && (
              <div className="col-12"><OccupancyChart series={forward.data.series} height={200} /></div>
            )}
          </div>
          {showForward && forward.data && <p className="small text-muted mt-n3 mb-0">The last chart shows occupancy already on the books for the next 30 nights ({forward.data.occupancy.rate}% overall).</p>}
          <details className="small text-muted">
            <summary>How these numbers are calculated</summary>
            <ul className="mt-2 mb-0">
              <li>Revenue received: payments captured in the period, by capture date (Indian Standard Time).</li>
              <li>Net revenue: revenue received minus refunds processed in the same period.</li>
              <li>Occupancy: sold room-nights (confirmed, in-house or completed stays) divided by sellable rooms × nights. Rooms under maintenance or out of service are excluded.</li>
              <li>Booking value: total price of sold stays whose check-in falls in the period — an estimate of business on the books, not cash received.</li>
              <li>Awaiting payment: bookings created in the period that are still holding a room without payment.</li>
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
