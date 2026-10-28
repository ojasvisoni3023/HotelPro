import { CalendarDays, ConciergeBell, FileText, LogIn, LogOut, MapPin, Phone, UserX } from 'lucide-react';
import { useState } from 'react';
import { Modal } from 'react-bootstrap';
import { Link, useParams } from 'react-router';
import { toast } from 'react-toastify';
import api from '../../api/client';
import PriceBreakdown from '../../components/booking/PriceBreakdown';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { Img, KeyValue, PageHeader, Stars, StatusBadge, TestBadge } from '../../components/ui/Bits';
import { ErrorState, InlineAlert, PageLoader } from '../../components/ui/Feedback';
import { HOME_FOR_ROLE, useAuth } from '../../context/AuthContext';
import useApi from '../../hooks/useApi';
import { date, dateTime, dayDate, money, plural, relative, sentence } from '../../utils/format';
import { SERVICE_TYPES } from '../../utils/status';
import { ReviewForm } from '../guest/GuestPages';

function ServiceRequestForm({ bookingId, onDone }) {
  const [form, setForm] = useState({ type: 'housekeeping', description: '', priority: 'normal' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (form.description.trim().length < 5) return setError('Tell the hotel what you need');
    setBusy(true);
    setError('');
    try {
      await api.post('/service-requests', { bookingId, ...form, description: form.description.trim() });
      toast.success('Request sent to the hotel');
      setForm({ type: 'housekeeping', description: '', priority: 'normal' });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} noValidate className="mt-3">
      <div className="row g-2">
        <div className="col-sm-6">
          <label className="form-label" htmlFor="sr-type">What do you need?</label>
          <select id="sr-type" className="form-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {Object.entries(SERVICE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="col-sm-6">
          <label className="form-label" htmlFor="sr-priority">Urgency</label>
          <select id="sr-priority" className="form-select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            <option value="low">Whenever convenient</option>
            <option value="normal">Today</option>
            <option value="high">As soon as possible</option>
          </select>
        </div>
      </div>
      <label className="form-label mt-2" htmlFor="sr-desc">Details</label>
      <textarea id="sr-desc" className="form-control" rows={2} maxLength={1000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      {error && <div className="invalid-feedback d-block">{error}</div>}
      <button type="submit" className="btn btn-primary btn-sm mt-2" disabled={busy}>Send request</button>
    </form>
  );
}

function ReassignRoom({ booking, onDone }) {
  const [show, setShow] = useState(false);
  const [roomId, setRoomId] = useState('');
  const rooms = useApi(() => api.get('/rooms', { params: { hotel: booking.hotel._id, category: booking.category._id } }), [show], { skip: !show });
  const save = async () => {
    try {
      await api.patch(`/manage/reservations/${booking._id}/room`, { roomId });
      toast.success('Room changed');
      setShow(false);
      onDone();
    } catch (err) {
      toast.error(err.message);
    }
  };
  return (
    <>
      <button type="button" className="btn btn-quiet w-100" onClick={() => setShow(true)}>Change room</button>
      <Modal show={show} onHide={() => setShow(false)} centered>
        <Modal.Header closeButton><Modal.Title as="h2" className="h4">Change room</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="small text-muted">Only rooms of the same type that are free for the remaining nights can be assigned.</p>
          <label className="form-label" htmlFor="ra-room">Room</label>
          <select id="ra-room" className="form-select" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">Choose a room</option>
            {(rooms.data ?? []).filter((r) => r._id !== booking.room?._id).map((r) => (
              <option key={r._id} value={r._id}>Room {r.roomNumber} ({sentence(r.status)})</option>
            ))}
          </select>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-quiet" onClick={() => setShow(false)}>Close</button>
          <button type="button" className="btn btn-primary" disabled={!roomId} onClick={save}>Move booking</button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

export default function BookingDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi(() => api.get(`/bookings/${id}`), [id]);
  const [dialog, setDialog] = useState(null);
  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const { booking: b, payments, serviceRequests, review, actions, refundPreview } = data;
  const isOwner = String(b.guest?._id ?? b.guest) === String(user._id);
  const team = !isOwner;
  const base = HOME_FOR_ROLE[user.role];
  const canManage = team && ['manager', 'admin'].includes(user.role);

  const doAction = async (path, msg, body) => {
    try {
      await api.post(path, body ?? {});
      toast.success(msg);
      reload();
      window.dispatchEvent(new CustomEvent('hp:notifications'));
    } catch (err) {
      toast.error(err.message);
      throw err;
    }
  };

  return (
    <>
      <PageHeader
        crumbs={isOwner ? [{ label: 'My bookings', to: '/account/bookings' }, { label: b.confirmationCode }] : [{ label: 'Reservations', to: `${base}/${user.role === 'staff' ? 'front-desk' : user.role === 'admin' ? 'bookings' : 'reservations'}` }, { label: b.confirmationCode }]}
        title={`${b.hotel.name}`}
        description={`${b.category.name}, booking ${b.confirmationCode}`}
        actions={
          <div className="d-flex gap-2 align-items-center">
            <StatusBadge kind="booking" value={b.status} />
            <StatusBadge kind="payment" value={b.paymentStatus} />
          </div>
        }
      />
      <div className="row g-4">
        <div className="col-lg-8 d-grid gap-4 align-content-start">
          <section className="panel overflow-hidden">
            <div className="d-flex flex-column flex-md-row">
              <Img src={b.category.images?.[0]?.url ?? b.hotel.images?.[0]?.url} alt={b.category.name} style={{ width: '100%', maxWidth: 280, minHeight: 190 }} />
              <div className="panel-pad flex-grow-1">
                <div className="row g-3">
                  <div className="col-sm-6">
                    <div className="small text-muted">Check-in</div>
                    <div className="fw-semibold">{dayDate(b.checkIn)}</div>
                    <div className="small text-muted">from {b.hotel.checkInTime}</div>
                  </div>
                  <div className="col-sm-6">
                    <div className="small text-muted">Check-out</div>
                    <div className="fw-semibold">{dayDate(b.checkOut)}</div>
                    <div className="small text-muted">by {b.hotel.checkOutTime}</div>
                  </div>
                  <div className="col-sm-6">
                    <div className="small text-muted">Guests</div>
                    <div className="fw-semibold">{plural(b.guests, 'guest')}, {plural(b.nights, 'night')}</div>
                  </div>
                  <div className="col-sm-6">
                    <div className="small text-muted">Room</div>
                    <div className="fw-semibold">{b.room ? `Room ${b.room.roomNumber}` : 'Assigned at check-in'}</div>
                  </div>
                </div>
                <p className="small text-muted mt-3 mb-0">
                  <MapPin size={14} className="me-1" aria-hidden="true" />
                  {b.hotel.address.line1}, {b.hotel.address.city}
                  {b.hotel.contact?.phone && (
                    <>
                      {'  '}
                      <Phone size={14} className="ms-2 me-1" aria-hidden="true" />
                      <a href={`tel:${b.hotel.contact.phone.replace(/\s/g, '')}`}>{b.hotel.contact.phone}</a>
                    </>
                  )}
                </p>
              </div>
            </div>
          </section>

          {team && (
            <section className="panel panel-pad">
              <h2 className="h4">Guest</h2>
              <KeyValue label="Name">{b.guestDetails.name}</KeyValue>
              <KeyValue label="Email"><a href={`mailto:${b.guestDetails.email}`}>{b.guestDetails.email}</a></KeyValue>
              <KeyValue label="Phone">{b.guestDetails.phone || '—'}</KeyValue>
              {b.specialRequests && <InlineAlert className="mt-3">Requested at booking: {b.specialRequests}</InlineAlert>}
            </section>
          )}
          {isOwner && b.specialRequests && <InlineAlert>Your request to the hotel: {b.specialRequests}</InlineAlert>}
          {b.status === 'cancelled' && b.cancellation && (
            <InlineAlert tone="bad">
              Cancelled on {dateTime(b.cancellation.cancelledAt)}
              {b.cancellation.reason ? ` (${b.cancellation.reason})` : ''}. Refund under policy: {money(b.cancellation.refundAmount ?? 0)} ({b.cancellation.refundPercent ?? 0}%).
            </InlineAlert>
          )}

          <section className="panel panel-pad">
            <h2 className="h4 mb-3">Price</h2>
            <PriceBreakdown pricing={b.pricing} nights={b.nights} />
          </section>

          <section className="panel panel-pad">
            <h2 className="h4 mb-1">Requests to the hotel</h2>
            {serviceRequests.length === 0 && <p className="text-muted small mb-0">{actions.canRequestService ? 'Need towels, a late check-out or something fixed? Send a request and the team is notified at once.' : 'No requests for this stay.'}</p>}
            {serviceRequests.map((r) => (
              <div key={r._id} className="d-flex justify-content-between gap-3 py-2 border-bottom" style={{ borderColor: 'var(--hp-stone-soft)' }}>
                <div>
                  <div className="fw-semibold small">{SERVICE_TYPES[r.type]}</div>
                  <div className="small">{r.description}</div>
                  {r.staffNote && <div className="small text-muted">Hotel: {r.staffNote}</div>}
                </div>
                <div className="text-end">
                  <StatusBadge kind="request" value={r.status} />
                  <div className="small text-muted">{relative(r.createdAt)}</div>
                </div>
              </div>
            ))}
            {actions.canRequestService && <ServiceRequestForm bookingId={b._id} onDone={reload} />}
          </section>

          {(actions.canReview || review) && (
            <section className="panel panel-pad">
              <h2 className="h4 mb-2">{review ? 'Your review' : 'How was your stay?'}</h2>
              {review ? (
                <>
                  <Stars value={review.rating} />
                  {review.title && <h3 className="h5 mt-2 mb-1">{review.title}</h3>}
                  <p className="mb-0">{review.comment}</p>
                </>
              ) : (
                <ReviewForm bookingId={b._id} onDone={reload} />
              )}
            </section>
          )}

          <section className="panel panel-pad">
            <h2 className="h4 mb-2">History</h2>
            <ol className="list-unstyled mb-0">
              {[...(b.statusHistory ?? [])].reverse().map((h, i) => (
                <li key={i} className="d-flex gap-3 py-1 small">
                  <span className="text-muted num" style={{ minWidth: 150 }}>{dateTime(h.at)}</span>
                  <span><strong>{sentence(h.status)}</strong>{h.note ? `: ${h.note}` : ''}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="col-lg-4">
          <div className="sticky-aside d-grid gap-3">
            <div className="panel panel-pad d-grid gap-2">
              <h2 className="h4 mb-1">Actions</h2>
              {actions.canPay && <Link className="btn btn-primary" to={`/bookings/${b._id}/pay`}>Pay now</Link>}
              {actions.hasInvoice && (
                <Link className="btn btn-quiet" to={`/bookings/${b._id}/invoice`}>
                  <FileText size={16} className="me-2" aria-hidden="true" />View invoice
                </Link>
              )}
              {team && b.status === 'confirmed' && (
                <button type="button" className="btn btn-primary" onClick={() => setDialog('checkin')}>
                  <LogIn size={16} className="me-2" aria-hidden="true" />Check in
                </button>
              )}
              {team && b.status === 'checked_in' && (
                <button type="button" className="btn btn-primary" onClick={() => setDialog('checkout')}>
                  <LogOut size={16} className="me-2" aria-hidden="true" />Check out
                </button>
              )}
              {team && b.status === 'confirmed' && (
                <button type="button" className="btn btn-quiet" onClick={() => setDialog('noshow')}>
                  <UserX size={16} className="me-2" aria-hidden="true" />Mark as no-show
                </button>
              )}
              {canManage && ['pending', 'confirmed', 'checked_in'].includes(b.status) && <ReassignRoom booking={b} onDone={reload} />}
              {actions.canCancel && (isOwner || canManage) && (
                <button type="button" className="btn btn-outline-danger" onClick={() => setDialog('cancel')}>Cancel booking</button>
              )}
              {!actions.canPay && !actions.hasInvoice && !actions.canCancel && !team && <p className="small text-muted mb-0">No actions available for this booking.</p>}
              {isOwner && (
                <Link to={`/rooms/${b.category._id}`} className="small mt-1">
                  <CalendarDays size={14} className="me-1" aria-hidden="true" />Book this room again
                </Link>
              )}
            </div>
            <div className="panel panel-pad">
              <h2 className="h4 mb-2">Payments</h2>
              {payments.length === 0 && <p className="small text-muted mb-0">No payment yet.</p>}
              {payments.map((p) => (
                <div key={p._id} className="py-2 border-bottom small" style={{ borderColor: 'var(--hp-stone-soft)' }}>
                  <div className="d-flex justify-content-between">
                    <span className="num fw-semibold">{money(p.amount)}</span>
                    <StatusBadge kind="payment" value={p.status} />
                  </div>
                  <div className="text-muted">{dateTime(p.capturedAt ?? p.createdAt)} {p.isTest && <TestBadge />}</div>
                  {p.failureReason && <div className="text-muted">{p.failureReason}</div>}
                  {p.refunds.map((r) => (
                    <div key={r._id} className="d-flex justify-content-between mt-1">
                      <span>Refund {money(r.amount)}</span>
                      <StatusBadge kind="refund" value={r.status} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {team && (
              <div className="small text-muted px-1">
                <ConciergeBell size={14} className="me-1" aria-hidden="true" />Booked {date(b.createdAt)}
              </div>
            )}
          </div>
        </aside>
      </div>

      <ConfirmDialog
        show={dialog === 'cancel'}
        title="Cancel this booking?"
        tone="danger"
        confirmLabel="Cancel booking"
        reasonLabel="Reason (optional)"
        onClose={() => setDialog(null)}
        onConfirm={(reason) => doAction(`/bookings/${b._id}/cancel`, 'Booking cancelled', { reason: reason || undefined })}
      >
        {refundPreview && refundPreview.amount > 0 ? (
          <p>
            You will be refunded <strong className="num">{money(refundPreview.amount)}</strong> ({refundPreview.percent}% of the amount paid). Refunds are processed by the hotel and usually reach you within 5–7 working days.
          </p>
        ) : (
          <p>{b.paymentStatus === 'paid' ? 'Under the cancellation policy this booking is no longer refundable.' : 'Nothing has been paid, so no refund is due.'}</p>
        )}
        {refundPreview?.note && <p className="small text-muted mb-0">{refundPreview.note}</p>}
      </ConfirmDialog>
      <ConfirmDialog show={dialog === 'checkin'} title={`Check in ${b.guestDetails.name}?`} confirmLabel="Check in" onClose={() => setDialog(null)} onConfirm={() => doAction(`/operations/bookings/${b._id}/check-in`, 'Guest checked in')}>
        <p className="mb-0">Room {b.room?.roomNumber} will be marked occupied. Make sure the guest has shown photo ID.</p>
      </ConfirmDialog>
      <ConfirmDialog show={dialog === 'checkout'} title={`Check out ${b.guestDetails.name}?`} confirmLabel="Check out" onClose={() => setDialog(null)} onConfirm={() => doAction(`/operations/bookings/${b._id}/check-out`, 'Guest checked out')}>
        <p className="mb-0">The room goes to cleaning and a housekeeping task is created. The invoice is issued if not already.</p>
      </ConfirmDialog>
      <ConfirmDialog show={dialog === 'noshow'} title="Record a no-show?" tone="danger" confirmLabel="Mark no-show" onClose={() => setDialog(null)} onConfirm={() => doAction(`/operations/bookings/${b._id}/no-show`, 'Marked as no-show')}>
        <p className="mb-0">Use this only after the arrival date has passed. The room is released and no refund applies.</p>
      </ConfirmDialog>
    </>
  );
}
