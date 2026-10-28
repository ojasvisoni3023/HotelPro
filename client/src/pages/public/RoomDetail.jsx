import { BedDouble, Clock, Ruler, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import api from '../../api/client';
import Amenities from '../../components/booking/Amenities';
import Gallery from '../../components/booking/Gallery';
import PriceBreakdown from '../../components/booking/PriceBreakdown';
import ReviewList from '../../components/booking/ReviewList';
import { Img, PageHeader, Stars } from '../../components/ui/Bits';
import { ErrorState, InlineAlert, PageLoader } from '../../components/ui/Feedback';
import { useAuth } from '../../context/AuthContext';
import { useConfig } from '../../context/ConfigContext';
import useApi from '../../hooks/useApi';
import { addDaysIso, money, plural } from '../../utils/format';
import { validateStay } from '../../utils/validation';
import NotFound from './NotFound';

function BookingBox({ roomType, initial }) {
  const { config } = useConfig();
  const { user } = useAuth();
  const navigate = useNavigate();
  const today = config?.today;
  const [form, setForm] = useState({ checkIn: initial.checkIn ?? '', checkOut: initial.checkOut ?? '', guests: Number(initial.guests ?? Math.min(2, roomType.maxGuests)) });
  const [quote, setQuote] = useState({ loading: false, data: null, error: null });
  const errors = validateStay(form, today);
  const ready = form.checkIn && form.checkOut && !Object.keys(errors).length;

  useEffect(() => {
    if (!ready) {
      setQuote({ loading: false, data: null, error: null });
      return undefined;
    }
    let alive = true;
    setQuote((q) => ({ ...q, loading: true, error: null }));
    api
      .get(`/room-types/${roomType._id}/availability`, { params: form })
      .then((r) => alive && setQuote({ loading: false, data: r.data, error: null }))
      .catch((e) => alive && setQuote({ loading: false, data: null, error: e }));
    return () => {
      alive = false;
    };
  }, [ready, form, roomType._id]);

  const reserve = () => {
    const qs = new URLSearchParams({ categoryId: roomType._id, checkIn: form.checkIn, checkOut: form.checkOut, guests: String(form.guests) });
    const target = `/checkout?${qs}`;
    navigate(user ? target : `/login?next=${encodeURIComponent(target)}`);
  };

  const set = (k) => (e) =>
    setForm((f) => {
      const v = k === 'guests' ? Number(e.target.value) : e.target.value;
      const next = { ...f, [k]: v };
      if (k === 'checkIn' && v && (!f.checkOut || f.checkOut <= v)) next.checkOut = addDaysIso(v, 1);
      return next;
    });

  const q = quote.data;
  return (
    <div className="panel panel-pad">
      <div className="d-flex align-items-baseline gap-2 mb-3">
        <span className="price-figure num">{money(q?.quote?.averageNightly ?? roomType.basePrice)}</span>
        <span className="text-muted small">{q ? 'per night for your dates' : 'per night from'}</span>
      </div>
      <div className="row g-2">
        <div className="col-6">
          <label className="form-label" htmlFor="bk-in">
            Check-in
          </label>
          <input id="bk-in" type="date" className={`form-control ${errors.checkIn ? 'is-invalid' : ''}`} min={today} value={form.checkIn} onChange={set('checkIn')} />
        </div>
        <div className="col-6">
          <label className="form-label" htmlFor="bk-out">
            Check-out
          </label>
          <input id="bk-out" type="date" className={`form-control ${errors.checkOut ? 'is-invalid' : ''}`} min={form.checkIn ? addDaysIso(form.checkIn, 1) : today} value={form.checkOut} onChange={set('checkOut')} />
        </div>
        {(errors.checkIn || errors.checkOut) && <div className="col-12 invalid-feedback d-block">{errors.checkIn || errors.checkOut}</div>}
        <div className="col-12">
          <label className="form-label" htmlFor="bk-guests">
            Guests
          </label>
          <select id="bk-guests" className="form-select" value={form.guests} onChange={set('guests')}>
            {Array.from({ length: roomType.maxGuests }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {plural(n, 'guest')}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3" aria-live="polite">
        {!ready && <p className="small text-muted mb-0">Choose dates to see availability and your total price.</p>}
        {quote.loading && <p className="small text-muted mb-0">Checking availability…</p>}
        {quote.error && <InlineAlert tone="bad">{quote.error.message}</InlineAlert>}
        {q && !quote.loading && (
          <>
            {q.available ? (
              <InlineAlert tone="good" className="mb-3">
                Available: {plural(q.availableRooms, 'room')} of this type free for {plural(q.quote.nights, 'night')}.
              </InlineAlert>
            ) : (
              <InlineAlert tone="bad" className="mb-3">
                {q.fitsGuests ? 'Fully booked for these dates. Try different dates.' : `This room sleeps up to ${q.maxGuests}.`}
              </InlineAlert>
            )}
            <PriceBreakdown pricing={q.quote} />
          </>
        )}
      </div>
      <button type="button" className="btn btn-primary w-100 mt-3" disabled={!q?.available || quote.loading} onClick={reserve}>
        {user ? 'Reserve this room' : 'Sign in to reserve'}
      </button>
      <p className="small text-muted mt-2 mb-0">You will not be charged until you confirm payment on the next step.</p>
    </div>
  );
}

export default function RoomDetail() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const { data, loading, error, reload } = useApi(() => api.get(`/room-types/${id}`), [id]);
  if (loading) return <PageLoader />;
  if (error?.status === 404 || error?.code === 'INVALID_ID') return <NotFound />;
  if (error) return <div className="container py-5"><ErrorState error={error} onRetry={reload} /></div>;
  const { roomType: rt, hotel, hotelDetails, otherRoomTypes, reviews, cancellationPolicy } = data;

  return (
    <div className="container py-4">
      <PageHeader
        crumbs={[{ label: 'Hotels', to: '/hotels' }, { label: hotel.name, to: `/hotels/${hotel.slug}` }, { label: rt.name }]}
        title={rt.name}
        description={
          <>
            <Link to={`/hotels/${hotel.slug}`}>{hotel.name}</Link>, {hotel.address.city}
          </>
        }
        actions={<Stars value={hotel.ratingAvg} count={hotel.ratingCount} size={18} />}
      />
      <Gallery images={[...rt.images, ...(hotel.images ?? []).slice(0, 2)]} title={rt.name} />
      <div className="row g-4 gx-lg-5 mt-1">
        <div className="col-lg-7">
          <ul className="list-unstyled d-flex flex-wrap gap-4 text-muted">
            <li>
              <Users size={18} className="me-2 text-brass" aria-hidden="true" />
              Sleeps {rt.maxGuests}
            </li>
            {rt.bedType && (
              <li>
                <BedDouble size={18} className="me-2 text-brass" aria-hidden="true" />
                {rt.bedType}
              </li>
            )}
            {rt.sizeSqm ? (
              <li>
                <Ruler size={18} className="me-2 text-brass" aria-hidden="true" />
                {rt.sizeSqm} m²
              </li>
            ) : null}
            <li>
              <Clock size={18} className="me-2 text-brass" aria-hidden="true" />
              In {hotelDetails.checkInTime}, out {hotelDetails.checkOutTime}
            </li>
          </ul>
          {rt.description && <p className="lead measure">{rt.description}</p>}
          <h2 className="h3 mt-4">In the room</h2>
          <Amenities items={rt.amenities} />
          <h2 className="h3 mt-5">Cancellation</h2>
          <p className="measure text-muted">{cancellationPolicy}</p>
          {hotelDetails.policies && <p className="measure text-muted">{hotelDetails.policies}</p>}
          {rt.seasonalRates?.length > 0 && (
            <p className="small text-muted measure">Seasonal rates apply on some dates; your exact nightly prices are shown once you pick dates.</p>
          )}
          <h2 className="h3 mt-5 mb-3">Recent reviews of {hotel.name}</h2>
          <ReviewList reviews={reviews} />
          {otherRoomTypes.length > 0 && (
            <>
              <h2 className="h3 mt-5 mb-3">Other rooms at this hotel</h2>
              <div className="row g-3">
                {otherRoomTypes.map((o) => (
                  <div className="col-sm-6" key={o._id}>
                    <Link to={`/rooms/${o._id}?${sp}`} className="panel hotel-card">
                      <Img src={o.images?.[0]?.url} alt={o.name} className="hotel-card-img" />
                      <div className="p-3">
                        <h3 className="h5 mb-1">{o.name}</h3>
                        <span className="small text-muted">
                          Sleeps {o.maxGuests}, from <span className="num fw-semibold">{money(o.basePrice)}</span>
                        </span>
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <aside className="col-lg-5">
          <div className="sticky-aside">
            <BookingBox roomType={rt} initial={Object.fromEntries(sp)} />
          </div>
        </aside>
      </div>
    </div>
  );
}
