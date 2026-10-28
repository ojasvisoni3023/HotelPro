import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'react-toastify';
import api, { ApiError } from '../../api/client';
import PriceBreakdown from '../../components/booking/PriceBreakdown';
import { Field, Img, PageHeader } from '../../components/ui/Bits';
import { ErrorState, InlineAlert, PageLoader } from '../../components/ui/Feedback';
import { useAuth } from '../../context/AuthContext';
import useApi from '../../hooks/useApi';
import { dayDate, plural } from '../../utils/format';
import { emailError, nameError, phoneError } from '../../utils/validation';
import VerifyEmailNotice from './VerifyEmailNotice';

/** Step 2 of booking: confirm details. Price and availability come from the server. */
export default function Checkout() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const categoryId = sp.get('categoryId');
  const checkIn = sp.get('checkIn');
  const checkOut = sp.get('checkOut');
  const guests = Number(sp.get('guests') ?? 1);
  const valid = categoryId && checkIn && checkOut;

  const room = useApi(() => api.get(`/room-types/${categoryId}`), [categoryId], { skip: !valid });
  const avail = useApi(() => api.get(`/room-types/${categoryId}/availability`, { params: { checkIn, checkOut, guests } }), [categoryId, checkIn, checkOut, guests], { skip: !valid });
  const [form, setForm] = useState({ name: user.name, email: user.email, phone: user.phone ?? '', specialRequests: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [agree, setAgree] = useState(false);

  if (!valid) return <Navigate to="/rooms" replace />;
  if (room.loading || avail.loading) return <PageLoader />;
  if (room.error || avail.error) return <div className="container py-5"><ErrorState error={room.error ?? avail.error} onRetry={() => { room.reload(); avail.reload(); }} /></div>;

  const { roomType, hotel } = room.data;
  const q = avail.data;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const errs = { name: nameError(form.name), email: emailError(form.email), phone: phoneError(form.phone), agree: agree ? undefined : 'Please accept the cancellation policy' };
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    try {
      const res = await api.post('/bookings', {
        categoryId,
        checkIn,
        checkOut,
        guests,
        guestDetails: { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() || undefined },
        specialRequests: form.specialRequests.trim() || undefined,
      });
      navigate(`/bookings/${res.data._id}/pay`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      toast.error(err.message);
      if (err.code === 'NO_AVAILABILITY') avail.reload();
      setBusy(false);
    }
  };

  return (
    <div className="container py-4" style={{ maxWidth: 1100 }}>
      <PageHeader crumbs={[{ label: hotel.name, to: `/hotels/${hotel.slug}` }, { label: roomType.name, to: `/rooms/${roomType._id}?${sp}` }, { label: 'Your details' }]} title="Confirm your stay" description="Check the details below. Your room is held for you as soon as you continue to payment." />
      {!user.emailVerified && <VerifyEmailNotice className="mb-4" />}
      <div className="row g-4">
        <div className="col-lg-7">
          <form className="panel panel-pad" onSubmit={submit} noValidate>
            <h2 className="h4 mb-3">Who is staying</h2>
            <div className="row">
              <div className="col-md-6">
                <Field id="co-name" label="Lead guest name" error={errors.name}>
                  <input id="co-name" className={`form-control ${errors.name ? 'is-invalid' : ''}`} value={form.name} onChange={set('name')} autoComplete="name" />
                </Field>
              </div>
              <div className="col-md-6">
                <Field id="co-phone" label="Phone" error={errors.phone} hint="The hotel may call about your arrival.">
                  <input id="co-phone" type="tel" className={`form-control ${errors.phone ? 'is-invalid' : ''}`} value={form.phone} onChange={set('phone')} autoComplete="tel" />
                </Field>
              </div>
            </div>
            <Field id="co-email" label="Email for confirmation" error={errors.email}>
              <input id="co-email" type="email" className={`form-control ${errors.email ? 'is-invalid' : ''}`} value={form.email} onChange={set('email')} autoComplete="email" />
            </Field>
            <Field id="co-req" label="Requests for the hotel (optional)" hint="Arrival time, bed preference, celebrations. Requests are not guaranteed.">
              <textarea id="co-req" rows={3} className="form-control" maxLength={500} value={form.specialRequests} onChange={set('specialRequests')} />
            </Field>
            <h2 className="h4 mt-4">Cancellation policy</h2>
            <p className="small text-muted">{q.cancellationPolicy}</p>
            <div className="form-check mb-3">
              <input id="co-agree" type="checkbox" className={`form-check-input ${errors.agree ? 'is-invalid' : ''}`} checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <label htmlFor="co-agree" className="form-check-label">
                I have read and accept the cancellation policy
              </label>
              {errors.agree && <div className="invalid-feedback d-block">{errors.agree}</div>}
            </div>
            {!q.available && (
              <InlineAlert tone="bad" className="mb-3">
                This room is no longer available for these dates. <Link to={`/rooms?checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}`}>Search again</Link>
              </InlineAlert>
            )}
            <button type="submit" className="btn btn-primary btn-lg w-100" disabled={busy || !q.available || !user.emailVerified}>
              {busy && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
              Continue to payment
            </button>
          </form>
        </div>
        <aside className="col-lg-5">
          <div className="panel overflow-hidden sticky-aside">
            <Img src={roomType.images?.[0]?.url} alt={roomType.name} style={{ width: '100%', height: 180 }} />
            <div className="panel-pad">
              <div className="small text-brass fw-semibold">{hotel.name}</div>
              <h2 className="h4 mb-2">{roomType.name}</h2>
              <p className="small mb-3">
                {dayDate(checkIn)} to {dayDate(checkOut)}
                <br />
                {plural(q.quote.nights, 'night')}, {plural(guests, 'guest')}
              </p>
              <PriceBreakdown pricing={q.quote} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
