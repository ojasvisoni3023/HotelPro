import { CalendarDays, CreditCard, MessageSquare, Search, Star } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'react-toastify';
import api from '../../api/client';
import { Img, PageHeader, Pagination, StatCard, Stars, StarInput, StatusBadge, TestBadge } from '../../components/ui/Bits';
import { EmptyState, ErrorState, InlineAlert, SkeletonRows } from '../../components/ui/Feedback';
import { useAuth } from '../../context/AuthContext';
import useApi from '../../hooks/useApi';
import { date, dateTime, money, stayRange } from '../../utils/format';
import VerifyEmailNotice from './VerifyEmailNotice';

export function BookingRow({ b }) {
  return (
    <Link to={`/account/bookings/${b._id}`} className="d-flex gap-3 align-items-center p-3 text-decoration-none border-bottom" style={{ color: 'inherit', borderColor: 'var(--hp-stone-soft)' }}>
      <Img src={b.category?.images?.[0]?.url ?? b.hotel?.images?.[0]?.url} alt="" style={{ width: 88, height: 66, borderRadius: 6, flexShrink: 0 }} />
      <div className="flex-grow-1 min-w-0">
        <div className="fw-semibold" style={{ color: 'var(--hp-navy)' }}>{b.hotel?.name}</div>
        <div className="small text-muted text-truncate">
          {b.category?.name}, {stayRange(b.checkIn, b.checkOut)}
        </div>
        <div className="small text-muted num">{b.confirmationCode}</div>
      </div>
      <div className="text-end d-none d-sm-block">
        <StatusBadge kind="booking" value={b.status} />
        <div className="small fw-semibold num mt-1">{money(b.pricing?.total)}</div>
      </div>
    </Link>
  );
}

export function GuestDashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi(() => api.get('/dashboard/guest'), []);
  return (
    <>
      <PageHeader title={`Hello, ${user.name.split(' ')[0]}`} description="Your upcoming trips, recent payments and messages from the hotels." actions={<Link to="/rooms" className="btn btn-primary"><Search size={16} className="me-2" aria-hidden="true" />Find a stay</Link>} />
      {!user.emailVerified && <VerifyEmailNotice className="mb-4" />}
      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading ? (
        <SkeletonRows rows={6} />
      ) : (
        <>
          <div className="row g-3 mb-4">
            <div className="col-6 col-md-3"><StatCard label="Upcoming stays" value={data.upcoming.length} icon={CalendarDays} /></div>
            <div className="col-6 col-md-3"><StatCard label="Completed stays" value={data.statusCounts.checked_out ?? 0} icon={Star} /></div>
            <div className="col-6 col-md-3"><StatCard label="Cancelled" value={data.statusCounts.cancelled ?? 0} icon={CalendarDays} /></div>
            <div className="col-6 col-md-3"><StatCard label="Unread messages" value={data.notifications.length} icon={MessageSquare} /></div>
          </div>
          <div className="row g-4">
            <div className="col-lg-7">
              <section className="panel">
                <div className="panel-header">
                  <h2>Upcoming and current stays</h2>
                  <Link to="/account/bookings" className="small">All bookings</Link>
                </div>
                {data.upcoming.length ? data.upcoming.map((b) => <BookingRow key={b._id} b={b} />) : <EmptyState icon={CalendarDays} title="No trips planned yet" action={<Link to="/rooms" className="btn btn-quiet">Browse rooms</Link>}>When you book a room it will appear here.</EmptyState>}
              </section>
              <section className="panel mt-4">
                <div className="panel-header">
                  <h2>Past stays</h2>
                </div>
                {data.past.length ? data.past.map((b) => <BookingRow key={b._id} b={b} />) : <p className="p-3 mb-0 text-muted">Completed stays will show here, ready for a review.</p>}
              </section>
            </div>
            <div className="col-lg-5">
              <section className="panel">
                <div className="panel-header">
                  <h2>Messages</h2>
                  <Link to="/account/notifications" className="small">See all</Link>
                </div>
                {data.notifications.length ? (
                  <ul className="list-unstyled mb-0">
                    {data.notifications.map((n) => (
                      <li key={n._id} className="p-3 border-bottom" style={{ borderColor: 'var(--hp-stone-soft)' }}>
                        <div className="fw-semibold small">{n.title}</div>
                        <div className="small text-muted">{n.message}</div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="p-3 mb-0 text-muted">You are all caught up.</p>
                )}
              </section>
              <section className="panel mt-4">
                <div className="panel-header">
                  <h2>Recent payments</h2>
                  <Link to="/account/payments" className="small">History</Link>
                </div>
                {data.payments.length ? (
                  <ul className="list-unstyled mb-0">
                    {data.payments.map((p) => (
                      <li key={p._id} className="p-3 d-flex justify-content-between border-bottom" style={{ borderColor: 'var(--hp-stone-soft)' }}>
                        <span className="small">
                          <span className="num">{p.booking?.confirmationCode}</span>
                          <br />
                          <span className="text-muted">{date(p.createdAt)}</span>
                        </span>
                        <span className="text-end">
                          <span className="fw-semibold num">{money(p.amount)}</span>
                          <br />
                          <StatusBadge kind="payment" value={p.status} />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="p-3 mb-0 text-muted">No payments yet.</p>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export function MyBookings() {
  const [sp, setSp] = useSearchParams();
  const scope = sp.get('scope') ?? 'upcoming';
  const page = Number(sp.get('page') ?? 1);
  const { data, meta, loading, error, reload } = useApi(() => api.get('/bookings/mine', { params: { scope, page } }), [scope, page]);
  const tabs = [
    ['upcoming', 'Upcoming'],
    ['past', 'Past'],
    ['cancelled', 'Cancelled'],
    ['all', 'All'],
  ];
  return (
    <>
      <PageHeader title="My bookings" description="Open a booking to pay, cancel, request service, review or download your invoice." />
      <ul className="nav nav-tabs mb-3" role="tablist">
        {tabs.map(([k, label]) => (
          <li className="nav-item" key={k} role="presentation">
            <button type="button" role="tab" aria-selected={scope === k} className={`nav-link ${scope === k ? 'active' : ''}`} onClick={() => setSp({ scope: k })}>
              {label}
            </button>
          </li>
        ))}
      </ul>
      <div className="panel">
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading ? (
          <SkeletonRows />
        ) : data.length === 0 ? (
          <EmptyState icon={CalendarDays} title="Nothing here yet" action={<Link className="btn btn-quiet" to="/rooms">Find a stay</Link>}>
            {scope === 'upcoming' ? 'Book a room and your trip will appear here.' : 'No bookings in this list.'}
          </EmptyState>
        ) : (
          <>
            {data.map((b) => (
              <BookingRow key={b._id} b={b} />
            ))}
            <Pagination meta={meta} onPage={(p) => setSp({ scope, page: String(p) })} />
          </>
        )}
      </div>
    </>
  );
}

export function MyPayments() {
  const [page, setPage] = useState(1);
  const { data, meta, loading, error, reload } = useApi(() => api.get('/payments/mine', { params: { page } }), [page]);
  return (
    <>
      <PageHeader title="Payments" description="Every payment attempt and refund on your account." />
      <div className="panel">
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading ? (
          <SkeletonRows />
        ) : data.length === 0 ? (
          <EmptyState icon={CreditCard} title="No payments yet">Payments appear here once you pay for a booking.</EmptyState>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Booking</th>
                  <th scope="col">Method</th>
                  <th scope="col" className="text-end">Amount</th>
                  <th scope="col">Status</th>
                  <th scope="col">Refunds</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p._id}>
                    <td className="small">{dateTime(p.capturedAt ?? p.createdAt)}</td>
                    <td>
                      <Link to={`/account/bookings/${p.booking?._id}`} className="num">{p.booking?.confirmationCode}</Link>
                      <div className="small text-muted">{p.booking?.hotel?.name}</div>
                    </td>
                    <td className="small">
                      {p.provider === 'mock' ? <TestBadge /> : `Razorpay${p.method ? `, ${p.method}` : ''}`}
                    </td>
                    <td className="text-end num fw-semibold">{money(p.amount)}</td>
                    <td><StatusBadge kind="payment" value={p.status} /></td>
                    <td className="small">
                      {p.refunds.length ? p.refunds.map((r) => <div key={r._id}><span className="num">{money(r.amount)}</span> <StatusBadge kind="refund" value={r.status} /></div>) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination meta={meta} onPage={setPage} />
          </div>
        )}
      </div>
    </>
  );
}

export function ReviewForm({ bookingId, onDone }) {
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!rating) return setError('Choose a star rating');
    if (comment.trim().length < 10) return setError('Write at least 10 characters about your stay');
    setError('');
    setBusy(true);
    try {
      await api.post('/reviews', { bookingId, rating, title: title.trim() || undefined, comment: comment.trim() });
      toast.success('Thanks for your review');
      onDone?.();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} noValidate>
      <div className="form-label" id="rating-label">Your rating</div>
      <StarInput id="rating-label" value={rating} onChange={setRating} />
      <label htmlFor="rv-title" className="form-label mt-3">Headline (optional)</label>
      <input id="rv-title" className="form-control" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} />
      <label htmlFor="rv-comment" className="form-label mt-3">Your review</label>
      <textarea id="rv-comment" className="form-control" rows={4} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} />
      {error && <div className="invalid-feedback d-block">{error}</div>}
      <button className="btn btn-primary mt-3" type="submit" disabled={busy}>
        Publish review
      </button>
    </form>
  );
}

export function MyReviews() {
  const reviews = useApi(() => api.get('/reviews/mine'), []);
  const pending = useApi(() => api.get('/bookings/mine', { params: { scope: 'past', limit: 50 } }), []);
  const toReview = (pending.data ?? []).filter((b) => b.status === 'checked_out' && !b.reviewed);
  return (
    <>
      <PageHeader title="My reviews" description="Reviews can be written once a stay is complete. They are published to other guests." />
      {toReview.length > 0 && (
        <section className="panel mb-4">
          <div className="panel-header"><h2>Waiting for your review</h2></div>
          {toReview.map((b) => <BookingRow key={b._id} b={b} />)}
        </section>
      )}
      <section className="panel">
        <div className="panel-header"><h2>Published</h2></div>
        {reviews.error ? (
          <ErrorState error={reviews.error} onRetry={reviews.reload} />
        ) : reviews.loading ? (
          <SkeletonRows />
        ) : reviews.data.length === 0 ? (
          <EmptyState icon={Star} title="No reviews yet">After you check out, you can review your stay from the booking page.</EmptyState>
        ) : (
          reviews.data.map((r) => (
            <article key={r._id} className="p-3 border-bottom" style={{ borderColor: 'var(--hp-stone-soft)' }}>
              <div className="d-flex justify-content-between flex-wrap gap-2">
                <Link to={`/hotels/${r.hotel?.slug}`} className="fw-semibold">{r.hotel?.name}</Link>
                <span className="small text-muted">{date(r.createdAt)}</span>
              </div>
              <Stars value={r.rating} />
              {r.title && <h3 className="h5 mt-2 mb-1">{r.title}</h3>}
              <p className="mb-1">{r.comment}</p>
              {r.status === 'hidden' && <InlineAlert tone="warn">This review was hidden by a moderator{r.moderationNote ? `: ${r.moderationNote}` : '.'}</InlineAlert>}
            </article>
          ))
        )}
      </section>
      {pending.error && <p className="small text-muted mt-2">Stays waiting for a review could not be loaded.</p>}
    </>
  );
}
