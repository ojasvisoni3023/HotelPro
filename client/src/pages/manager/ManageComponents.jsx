import { CalendarDays, ImagePlus, Trash2, Undo2, Upload, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'react-toastify';
import api, { ApiError, cleanParams } from '../../api/client';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { Field, Img, Pagination, StatusBadge, TestBadge } from '../../components/ui/Bits';
import { EmptyState, ErrorState, InlineAlert, SkeletonRows } from '../../components/ui/Feedback';
import { HOME_FOR_ROLE, useAuth } from '../../context/AuthContext';
import { useConfig } from '../../context/ConfigContext';
import useApi from '../../hooks/useApi';
import { date, dateTime, money, relative, sentence } from '../../utils/format';
import { STATUS } from '../../utils/status';

/* ───────────────── reservations ───────────────── */

export function ReservationsTable({ hotelId, hotels }) {
  const { user } = useAuth();
  const base = HOME_FOR_ROLE[user.role];
  const [f, setF] = useState({ q: '', status: '', paymentStatus: '', from: '', to: '', sort: '-createdAt', hotel: '' });
  const [applied, setApplied] = useState(f);
  const [page, setPage] = useState(1);
  const hotel = hotelId ?? applied.hotel;
  const { data, meta, loading, error, reload } = useApi(
    () => api.get('/manage/reservations', { params: cleanParams({ ...applied, hotel, page }) }),
    [JSON.stringify(applied), hotel, page]
  );
  const apply = (e) => {
    e?.preventDefault();
    setPage(1);
    setApplied(f);
  };
  return (
    <>
      <form className="panel panel-pad mb-3" onSubmit={apply}>
        <div className="row g-2 align-items-end">
          <div className="col-md-3">
            <label className="form-label" htmlFor="rs-q">Search</label>
            <input id="rs-q" className="form-control" placeholder="Code, guest name or email" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          </div>
          {hotels && (
            <div className="col-md-2">
              <label className="form-label" htmlFor="rs-hotel">Hotel</label>
              <select id="rs-hotel" className="form-select" value={f.hotel} onChange={(e) => setF({ ...f, hotel: e.target.value })}>
                <option value="">All hotels</option>
                {hotels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
              </select>
            </div>
          )}
          <div className="col-6 col-md-2">
            <label className="form-label" htmlFor="rs-status">Status</label>
            <select id="rs-status" className="form-select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="">Any</option>
              {Object.entries(STATUS.booking).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label" htmlFor="rs-pay">Payment</label>
            <select id="rs-pay" className="form-select" value={f.paymentStatus} onChange={(e) => setF({ ...f, paymentStatus: e.target.value })}>
              <option value="">Any</option>
              {['unpaid', 'failed', 'paid', 'refund_pending', 'refunded', 'partially_refunded'].map((k) => <option key={k} value={k}>{STATUS.payment[k][0]}</option>)}
            </select>
          </div>
          <div className="col-6 col-md-auto">
            <label className="form-label" htmlFor="rs-from">Check-in from</label>
            <input id="rs-from" type="date" className="form-control" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
          </div>
          <div className="col-6 col-md-auto">
            <label className="form-label" htmlFor="rs-to">to</label>
            <input id="rs-to" type="date" className="form-control" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
          </div>
          <div className="col-6 col-md-auto">
            <label className="form-label" htmlFor="rs-sort">Sort</label>
            <select id="rs-sort" className="form-select" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })}>
              <option value="-createdAt">Newest booked</option>
              <option value="checkIn">Arrival, soonest</option>
              <option value="-checkIn">Arrival, latest</option>
            </select>
          </div>
          <div className="col-6 col-md-auto d-flex gap-2">
            <button type="submit" className="btn btn-primary">Apply</button>
            <button type="button" className="btn btn-quiet" onClick={() => { const empty = { q: '', status: '', paymentStatus: '', from: '', to: '', sort: '-createdAt', hotel: '' }; setF(empty); setApplied(empty); setPage(1); }}>Reset</button>
          </div>
        </div>
      </form>
      <div className="panel">
        {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <SkeletonRows /> : data.length === 0 ? (
          <EmptyState icon={CalendarDays} title="No reservations match these filters" />
        ) : (
          <div className="table-responsive">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th scope="col">Booking</th>
                  <th scope="col">Guest</th>
                  {!hotelId && <th scope="col">Hotel</th>}
                  <th scope="col">Room</th>
                  <th scope="col">Stay</th>
                  <th scope="col" className="text-end">Total</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((b) => (
                  <tr key={b._id}>
                    <td><Link to={`${base}/bookings/${b._id}`} className="num fw-semibold">{b.confirmationCode}</Link><div className="small text-muted">{date(b.createdAt)}</div></td>
                    <td>{b.guestDetails.name}<div className="small text-muted">{b.guestDetails.email}</div></td>
                    {!hotelId && <td className="small">{b.hotel?.name}</td>}
                    <td className="small">{b.category?.name}<div className="text-muted">{b.room ? `Room ${b.room.roomNumber}` : ''}</div></td>
                    <td className="small text-nowrap">{date(b.checkIn, { year: undefined })} – {date(b.checkOut)}</td>
                    <td className="text-end num">{money(b.pricing?.total)}</td>
                    <td><StatusBadge kind="booking" value={b.status} /><div className="mt-1"><StatusBadge kind="payment" value={b.paymentStatus} /></div></td>
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

/* ───────────────── refunds ───────────────── */

export function RefundQueue({ hotelId }) {
  const { user } = useAuth();
  const base = HOME_FOR_ROLE[user.role];
  const [status, setStatus] = useState('requested');
  const [action, setAction] = useState(null);
  const { data, loading, error, reload } = useApi(() => api.get('/manage/refunds', { params: cleanParams({ hotel: hotelId, status }) }), [hotelId, status]);
  const run = async (note) => {
    const { kind, row } = action;
    try {
      await api.post(`/manage/payments/${row.payment._id}/refunds/${row.refund._id}/${kind}`, kind === 'reject' ? { note } : {});
      toast.success(kind === 'process' ? 'Refund processed' : 'Refund declined');
      reload();
    } catch (err) {
      toast.error(err.message);
      throw err;
    }
  };
  return (
    <section className="panel">
      <div className="panel-header flex-wrap">
        <h2>Refunds</h2>
        <div className="d-flex flex-wrap gap-1" role="group" aria-label="Refund status">
          {[['requested', 'Awaiting action'], ['processing', 'Processing'], ['processed', 'Refunded'], ['rejected', 'Declined']].map(([k, l]) => (
            <button key={k} type="button" className={`btn btn-sm ${status === k ? "btn-primary" : "btn-quiet"}`} onClick={() => setStatus(k)}>{l}</button>
          ))}
        </div>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <SkeletonRows rows={3} /> : data.length === 0 ? (
        <EmptyState icon={Undo2} title={status === 'requested' ? 'No refunds waiting' : 'Nothing in this list'}>Refunds are queued here automatically when a paid booking is cancelled.</EmptyState>
      ) : (
        <div className="table-responsive">
          <table className="table">
            <thead><tr><th scope="col">Booking</th><th scope="col">Guest</th><th scope="col" className="text-end">Paid</th><th scope="col" className="text-end">Refund</th><th scope="col">Reason</th><th scope="col">Status</th>{status === 'requested' && <th scope="col" className="text-end">Action</th>}</tr></thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.refund._id}>
                  <td><Link to={`${base}/bookings/${row.payment.booking?._id}`} className="num">{row.payment.booking?.confirmationCode}</Link><div className="small text-muted">{row.payment.hotel?.name}</div></td>
                  <td className="small">{row.payment.booking?.guestDetails?.name}</td>
                  <td className="text-end num">{money(row.payment.amount)} {row.payment.isTest && <TestBadge />}</td>
                  <td className="text-end num fw-semibold">{money(row.refund.amount)}</td>
                  <td className="small">{row.refund.reason}<div className="text-muted">{relative(row.refund.requestedAt)}</div></td>
                  <td><StatusBadge kind="refund" value={row.refund.status} />{row.refund.note && <div className="small text-muted">{row.refund.note}</div>}</td>
                  {status === 'requested' && (
                    <td className="text-end text-nowrap">
                      <button type="button" className="btn btn-sm btn-primary me-1" onClick={() => setAction({ kind: 'process', row })}>Refund</button>
                      <button type="button" className="btn btn-sm btn-quiet" onClick={() => setAction({ kind: 'reject', row })}>Decline</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        show={action?.kind === 'process'}
        title={`Refund ${money(action?.row.refund.amount)}?`}
        confirmLabel="Process refund"
        onClose={() => setAction(null)}
        onConfirm={() => run()}
      >
        <p className="mb-0">
          {action?.row.payment.provider === 'razorpay'
            ? 'The refund is sent to Razorpay. It is marked refunded only when Razorpay confirms it.'
            : 'This is a test-mode payment: the refund is recorded but no real money moves.'}
        </p>
      </ConfirmDialog>
      <ConfirmDialog show={action?.kind === 'reject'} title="Decline this refund?" tone="danger" confirmLabel="Decline refund" reasonLabel="Reason shown to the guest" reasonRequired onClose={() => setAction(null)} onConfirm={(note) => run(note)}>
        <p className="mb-0">Use this only when the refund is not owed. The guest is notified with your reason.</p>
      </ConfirmDialog>
    </section>
  );
}

/* ───────────────── images ───────────────── */

export function ImageManager({ path, images, onChange, saveImages }) {
  const { config } = useConfig();
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return toast.error('Choose a JPEG, PNG or WebP image');
    if (file.size > 5 * 1024 * 1024) return toast.error('Images must be 5 MB or smaller');
    const body = new FormData();
    body.append('image', file);
    setBusy(true);
    try {
      await api.post(`${path}/images`, body, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Image uploaded');
      onChange();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (img) => {
    try {
      await api.delete(`${path}/images/${img._id}`);
      onChange();
    } catch (err) {
      toast.error(err.message);
    }
  };
  const addUrl = async (e) => {
    e.preventDefault();
    try {
      new URL(url);
    } catch {
      return toast.error('Enter a full image URL starting with https://');
    }
    await saveImages([...images.map(({ url: u, alt, credit }) => ({ url: u, alt, credit })), { url: url.trim(), alt: '' }]);
    setUrl('');
  };
  const storage = config?.imageStorage;
  return (
    <div>
      <div className="row g-2 mb-3">
        {images.map((img) => (
          <div className="col-6 col-md-4 col-lg-3" key={img._id}>
            <div className="position-relative">
              <Img src={img.url} alt={img.alt} ratio="4 / 3" className="w-100 rounded-2" />
              <button type="button" className="btn btn-sm btn-light position-absolute top-0 end-0 m-1" onClick={() => remove(img)} aria-label="Remove image">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        {!images.length && <p className="text-muted small">No images yet. Guests see a placeholder until you add one.</p>}
      </div>
      <div className="d-flex flex-wrap gap-2 align-items-start">
        <label className={`btn btn-quiet ${storage === 'none' || busy ? 'disabled' : ''}`}>
          <Upload size={16} className="me-2" aria-hidden="true" />
          {busy ? 'Uploading…' : 'Upload image'}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="d-none" onChange={upload} disabled={storage === 'none' || busy} />
        </label>
        <form className="d-flex gap-2 flex-grow-1" onSubmit={addUrl}>
          <input className="form-control" placeholder="Or paste an image URL" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Image URL" />
          <button className="btn btn-quiet" type="submit"><ImagePlus size={16} aria-hidden="true" /><span className="visually-hidden">Add image by URL</span></button>
        </form>
      </div>
      <p className="form-text">
        JPEG, PNG or WebP up to 5 MB.{' '}
        {storage === 'local' && 'Development mode: uploads are stored on this server only.'}
        {storage === 'none' && 'Upload storage is not configured on this server; add images by URL instead.'}
      </p>
    </div>
  );
}

/* ───────────────── hotel profile form ───────────────── */

const emptyHotel = { name: '', tagline: '', description: '', address: { line1: '', city: '', state: '', country: 'India', postalCode: '' }, contact: { phone: '', email: '', website: '' }, starRating: 4, amenities: [], checkInTime: '14:00', checkOutTime: '11:00', policies: '', status: 'active' };

export function HotelForm({ hotel, onSaved, isAdmin, onCancel }) {
  const creating = !hotel;
  const [f, setF] = useState(() => ({ ...emptyHotel, ...(hotel ?? {}), address: { ...emptyHotel.address, ...(hotel?.address ?? {}) }, contact: { ...emptyHotel.contact, ...(hotel?.contact ?? {}) }, amenitiesText: (hotel?.amenities ?? []).join(', ') }));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setIn = (group, k) => (e) => setF({ ...f, [group]: { ...f[group], [k]: e.target.value } });
  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (f.name.trim().length < 2) errs.name = 'Enter the hotel name';
    if (f.description.trim().length < 20) errs.description = 'Write at least 20 characters';
    if (f.address.line1.trim().length < 3) errs['address.line1'] = 'Enter the street address';
    if (f.address.city.trim().length < 2) errs['address.city'] = 'Enter the city';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body = {
      name: f.name.trim(),
      tagline: f.tagline?.trim() || undefined,
      description: f.description.trim(),
      address: Object.fromEntries(Object.entries(f.address).map(([k, v]) => [k, v?.trim?.() ?? v]).filter(([, v]) => v)),
      contact: { phone: f.contact.phone?.trim() || undefined, email: f.contact.email?.trim() || '', website: f.contact.website?.trim() || '' },
      starRating: Number(f.starRating),
      amenities: f.amenitiesText.split(',').map((s) => s.trim()).filter(Boolean),
      checkInTime: f.checkInTime,
      checkOutTime: f.checkOutTime,
      policies: f.policies?.trim() || undefined,
      ...(isAdmin ? { status: f.status } : {}),
    };
    setBusy(true);
    try {
      const res = creating ? await api.post('/hotels', body) : await api.patch(`/hotels/${hotel._id}`, body);
      toast.success(creating ? 'Hotel created' : 'Hotel saved');
      onSaved?.(res.data);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} noValidate>
      <div className="row">
        <div className="col-md-8"><Field id="h-name" label="Hotel name" error={errors.name}><input id="h-name" className={`form-control ${errors.name ? 'is-invalid' : ''}`} value={f.name} onChange={set('name')} /></Field></div>
        <div className="col-md-4"><Field id="h-stars" label="Star rating"><select id="h-stars" className="form-select" value={f.starRating} onChange={set('starRating')}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} star</option>)}</select></Field></div>
      </div>
      <Field id="h-tag" label="Tagline"><input id="h-tag" className="form-control" maxLength={140} value={f.tagline ?? ''} onChange={set('tagline')} /></Field>
      <Field id="h-desc" label="Description" error={errors.description}><textarea id="h-desc" rows={4} className={`form-control ${errors.description ? 'is-invalid' : ''}`} value={f.description} onChange={set('description')} maxLength={4000} /></Field>
      <div className="row">
        <div className="col-md-8"><Field id="h-line1" label="Street address" error={errors['address.line1']}><input id="h-line1" className={`form-control ${errors['address.line1'] ? 'is-invalid' : ''}`} value={f.address.line1} onChange={setIn('address', 'line1')} /></Field></div>
        <div className="col-md-4"><Field id="h-pin" label="Postal code"><input id="h-pin" className="form-control" value={f.address.postalCode ?? ''} onChange={setIn('address', 'postalCode')} /></Field></div>
        <div className="col-md-4"><Field id="h-city" label="City" error={errors['address.city']}><input id="h-city" className={`form-control ${errors['address.city'] ? 'is-invalid' : ''}`} value={f.address.city} onChange={setIn('address', 'city')} /></Field></div>
        <div className="col-md-4"><Field id="h-state" label="State"><input id="h-state" className="form-control" value={f.address.state ?? ''} onChange={setIn('address', 'state')} /></Field></div>
        <div className="col-md-4"><Field id="h-country" label="Country"><input id="h-country" className="form-control" value={f.address.country ?? ''} onChange={setIn('address', 'country')} /></Field></div>
        <div className="col-md-4"><Field id="h-phone" label="Phone"><input id="h-phone" className="form-control" value={f.contact.phone ?? ''} onChange={setIn('contact', 'phone')} /></Field></div>
        <div className="col-md-4"><Field id="h-email" label="Email" error={errors['contact.email']}><input id="h-email" type="email" className="form-control" value={f.contact.email ?? ''} onChange={setIn('contact', 'email')} /></Field></div>
        <div className="col-md-4"><Field id="h-web" label="Website" error={errors['contact.website']}><input id="h-web" type="url" className="form-control" value={f.contact.website ?? ''} onChange={setIn('contact', 'website')} placeholder="https://" /></Field></div>
        <div className="col-6 col-md-3"><Field id="h-in" label="Check-in from"><input id="h-in" type="time" className="form-control" value={f.checkInTime} onChange={set('checkInTime')} /></Field></div>
        <div className="col-6 col-md-3"><Field id="h-out" label="Check-out by"><input id="h-out" type="time" className="form-control" value={f.checkOutTime} onChange={set('checkOutTime')} /></Field></div>
        {isAdmin && <div className="col-md-3"><Field id="h-status" label="Status"><select id="h-status" className="form-select" value={f.status} onChange={set('status')}><option value="active">Active (bookable)</option><option value="inactive">Inactive (hidden)</option></select></Field></div>}
      </div>
      <Field id="h-amen" label="Amenities" hint="Separate with commas, e.g. Pool, Spa, Free Wi-Fi"><input id="h-amen" className="form-control" value={f.amenitiesText} onChange={set('amenitiesText')} /></Field>
      <Field id="h-pol" label="House policies"><textarea id="h-pol" rows={2} className="form-control" maxLength={2000} value={f.policies ?? ''} onChange={set('policies')} /></Field>
      <div className="d-flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>{creating ? 'Create hotel' : 'Save changes'}</button>
        {onCancel && <button type="button" className="btn btn-quiet" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

/* ───────────────── staff assignments ───────────────── */

export function AssignmentsPanel({ hotelId, hotels, allowManagers = false }) {
  const { user } = useAuth();
  const [form, setForm] = useState({ email: '', role: 'staff', position: '', hotel: hotelId ?? '' });
  const [removing, setRemoving] = useState(null);
  const hotel = hotelId ?? undefined;
  const { data, loading, error, reload } = useApi(() => api.get('/manage/assignments', { params: cleanParams({ hotel }) }), [hotel]);
  const add = async (e) => {
    e.preventDefault();
    try {
      await api.post('/manage/assignments', { hotel: hotelId ?? form.hotel, email: form.email.trim().toLowerCase(), role: form.role, position: form.position.trim() || undefined });
      toast.success('Team member assigned');
      setForm({ ...form, email: '', position: '' });
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  };
  const toggle = async (row) => {
    try {
      await api.patch(`/manage/assignments/${row._id}`, { active: !row.active });
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  };
  return (
    <>
      <form className="panel panel-pad mb-4" onSubmit={add}>
        <h2 className="h4">Add a team member</h2>
        <p className="small text-muted">The person must already have a HotelPro account with the matching role. {allowManagers ? 'Change roles from Users & roles.' : 'Ask an administrator to give new colleagues the staff role.'}</p>
        <div className="row g-2 align-items-end">
          {!hotelId && (
            <div className="col-md-3">
              <label className="form-label" htmlFor="as-hotel">Hotel</label>
              <select id="as-hotel" className="form-select" value={form.hotel} onChange={(e) => setForm({ ...form, hotel: e.target.value })} required>
                <option value="">Choose hotel</option>
                {hotels?.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
              </select>
            </div>
          )}
          <div className="col-md-3">
            <label className="form-label" htmlFor="as-email">Email</label>
            <input id="as-email" type="email" className="form-control" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          {allowManagers && (
            <div className="col-md-2">
              <label className="form-label" htmlFor="as-role">Role</label>
              <select id="as-role" className="form-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="staff">Staff</option>
                <option value="manager">Manager</option>
              </select>
            </div>
          )}
          <div className="col-md-2">
            <label className="form-label" htmlFor="as-pos">Position</label>
            <input id="as-pos" className="form-control" placeholder="Front desk" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
          </div>
          <div className="col-md-auto"><button type="submit" className="btn btn-primary">Assign</button></div>
        </div>
      </form>
      <div className="panel">
        {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <SkeletonRows /> : data.length === 0 ? (
          <EmptyState icon={Users} title="No one assigned yet" />
        ) : (
          <div className="table-responsive">
            <table className="table table-hover">
              <thead><tr><th scope="col">Person</th>{!hotelId && <th scope="col">Hotel</th>}<th scope="col">Role</th><th scope="col">Position</th><th scope="col">Status</th><th scope="col" className="text-end">Actions</th></tr></thead>
              <tbody>
                {data.map((row) => {
                  const mine = String(row.user._id) === String(user._id);
                  const editable = allowManagers || row.role === 'staff';
                  return (
                    <tr key={row._id}>
                      <td>{row.user.name}<div className="small text-muted">{row.user.email}</div></td>
                      {!hotelId && <td className="small">{row.hotel?.name}</td>}
                      <td>{sentence(row.role)}{row.user.role !== row.role && <div className="small" style={{ color: 'var(--hp-rust)' }}>Account role is now {row.user.role}</div>}</td>
                      <td className="small">{row.position || '—'}</td>
                      <td><span className={`status ${row.active ? 'status-good' : 'status-neutral'}`}>{row.active ? 'Active' : 'Paused'}</span></td>
                      <td className="text-end text-nowrap">
                        {editable && !mine && (
                          <>
                            <button type="button" className="btn btn-sm btn-quiet me-1" onClick={() => toggle(row)}>{row.active ? 'Pause' : 'Reactivate'}</button>
                            <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setRemoving(row)}>Remove</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ConfirmDialog show={Boolean(removing)} title={`Remove ${removing?.user.name}?`} tone="danger" confirmLabel="Remove" onClose={() => setRemoving(null)} onConfirm={async () => {
        try {
          await api.delete(`/manage/assignments/${removing._id}`);
          toast.success('Assignment removed');
          reload();
        } catch (err) {
          toast.error(err.message);
          throw err;
        }
      }}>
        <p className="mb-0">They will immediately lose access to this hotel’s operations.</p>
      </ConfirmDialog>
    </>
  );
}

export function LastUpdated({ at }) {
  return <span className="small text-muted">Updated {dateTime(at)}</span>;
}

export function NoAccess({ message }) {
  return <InlineAlert tone="warn">{message}</InlineAlert>;
}
