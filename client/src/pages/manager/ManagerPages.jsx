import { BedDouble, Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Modal } from 'react-bootstrap';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'react-toastify';
import api, { ApiError } from '../../api/client';
import AnalyticsView from '../../components/charts/AnalyticsView';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { Field, Img, PageHeader, StatusBadge } from '../../components/ui/Bits';
import { EmptyState, ErrorState, SkeletonRows } from '../../components/ui/Feedback';
import { useHotelScope } from '../../context/HotelScopeContext';
import useApi from '../../hooks/useApi';
import { date, isoDate, money, plural, sentence } from '../../utils/format';
import { NoHotel } from '../staff/StaffPages';
import { AssignmentsPanel, HotelForm, ImageManager, RefundQueue, ReservationsTable } from './ManageComponents';

function useScoped() {
  const scope = useHotelScope();
  return { ...scope, none: !scope.loading && !scope.hotels.length };
}

export function ManagerDashboard() {
  const { hotelId, hotel, none } = useScoped();
  const moves = useApi(() => api.get('/operations/movements', { params: { hotel: hotelId } }), [hotelId], { skip: !hotelId });
  if (none) return <NoHotel />;
  return (
    <>
      <PageHeader title={hotel?.name ?? 'Overview'} description="Performance for the selected period, plus who is arriving and leaving this week." actions={<Link to="/manager/reservations" className="btn btn-primary">Reservations</Link>} />
      {hotelId && <AnalyticsView hotelId={hotelId} />}
      <div className="row g-4 mt-1">
        {['arrivals', 'departures'].map((k) => (
          <div className="col-lg-6" key={k}>
            <section className="panel h-100">
              <div className="panel-header"><h2>{k === 'arrivals' ? 'Arriving in the next 7 days' : 'Departing in the next 7 days'}</h2></div>
              {moves.loading ? <SkeletonRows rows={3} /> : moves.data?.[k]?.length ? (
                <ul className="list-unstyled mb-0">
                  {moves.data[k].slice(0, 8).map((b) => (
                    <li key={b._id} className="px-3 py-2 border-bottom d-flex justify-content-between" style={{ borderColor: 'var(--hp-stone-soft)' }}>
                      <span className="small"><Link to={`/manager/bookings/${b._id}`} className="fw-semibold">{b.guestDetails.name}</Link><br /><span className="text-muted">{b.category?.name}, {plural(b.nights, 'night')}</span></span>
                      <span className="small num text-end">{date(k === 'arrivals' ? b.checkIn : b.checkOut, { year: undefined, weekday: 'short' })}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="p-3 text-muted mb-0">None scheduled.</p>}
            </section>
          </div>
        ))}
        <div className="col-12"><RefundQueue hotelId={hotelId} /></div>
      </div>
    </>
  );
}

export function Reservations() {
  const { hotelId, none } = useScoped();
  const [sp, setSp] = useSearchParams();
  const view = sp.get('view') === 'refunds' ? 'refunds' : 'list';
  if (none) return <NoHotel />;
  return (
    <>
      <PageHeader title="Reservations" description="Every booking for this hotel. Open one to change rooms, cancel, check in or check out." />
      <ul className="nav nav-tabs mb-3" role="tablist">
        <li className="nav-item" role="presentation"><button type="button" role="tab" aria-selected={view === 'list'} className={`nav-link ${view === 'list' ? 'active' : ''}`} onClick={() => setSp({})}>Bookings</button></li>
        <li className="nav-item" role="presentation"><button type="button" role="tab" aria-selected={view === 'refunds'} className={`nav-link ${view === 'refunds' ? 'active' : ''}`} onClick={() => setSp({ view: 'refunds' })}>Refunds</button></li>
      </ul>
      {hotelId && (view === 'list' ? <ReservationsTable hotelId={hotelId} key={hotelId} /> : <RefundQueue hotelId={hotelId} />)}
    </>
  );
}

/* ───────── room types & pricing ───────── */

const emptyType = { name: '', description: '', maxGuests: 2, bedType: '', sizeSqm: '', amenitiesText: '', basePrice: '', status: 'active', seasonalRates: [] };

function RoomTypeModal({ show, onClose, hotelId, editing, onSaved }) {
  const [f, setF] = useState(emptyType);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [lastShown, setLastShown] = useState(null);
  const key = show ? editing?._id ?? 'new' : null;
  if (key !== lastShown) {
    setLastShown(key);
    if (show) {
      setErrors({});
      setF(
        editing
          ? {
              ...emptyType,
              ...editing,
              sizeSqm: editing.sizeSqm ?? '',
              bedType: editing.bedType ?? '',
              amenitiesText: (editing.amenities ?? []).join(', '),
              seasonalRates: (editing.seasonalRates ?? []).map((s) => ({ name: s.name, startDate: isoDate(s.startDate), endDate: isoDate(s.endDate), price: s.price })),
            }
          : emptyType
      );
    }
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setSeason = (i, k) => (e) => setF({ ...f, seasonalRates: f.seasonalRates.map((s, j) => (j === i ? { ...s, [k]: e.target.value } : s)) });

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (f.name.trim().length < 2) errs.name = 'Enter a name';
    if (!(Number(f.basePrice) >= 0) || f.basePrice === '') errs.basePrice = 'Enter the nightly price';
    f.seasonalRates.forEach((s, i) => {
      if (!s.name || !s.startDate || !s.endDate || s.price === '') errs[`season${i}`] = 'Complete every field of this season';
      else if (s.endDate < s.startDate) errs[`season${i}`] = 'The season ends before it starts';
    });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body = {
      name: f.name.trim(),
      description: f.description?.trim() || '',
      maxGuests: Number(f.maxGuests),
      bedType: f.bedType?.trim() || undefined,
      sizeSqm: f.sizeSqm === '' ? undefined : Number(f.sizeSqm),
      amenities: f.amenitiesText.split(',').map((s) => s.trim()).filter(Boolean),
      basePrice: Number(f.basePrice),
      status: f.status,
      seasonalRates: f.seasonalRates.map((s) => ({ name: s.name.trim(), startDate: s.startDate, endDate: s.endDate, price: Number(s.price) })),
    };
    setBusy(true);
    try {
      if (editing) await api.patch(`/room-types/${editing._id}`, body);
      else await api.post('/room-types', { ...body, hotel: hotelId });
      toast.success(editing ? 'Room type saved' : 'Room type created');
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal show={show} onHide={onClose} size="lg" centered>
      <form onSubmit={submit} noValidate>
        <Modal.Header closeButton><Modal.Title as="h2" className="h4">{editing ? `Edit ${editing.name}` : 'New room type'}</Modal.Title></Modal.Header>
        <Modal.Body>
          <div className="row">
            <div className="col-md-6"><Field id="rt-name" label="Name" error={errors.name}><input id="rt-name" className={`form-control ${errors.name ? 'is-invalid' : ''}`} value={f.name} onChange={set('name')} /></Field></div>
            <div className="col-md-3"><Field id="rt-price" label="Base price per night (₹)" error={errors.basePrice}><input id="rt-price" type="number" min="0" step="100" className={`form-control ${errors.basePrice ? 'is-invalid' : ''}`} value={f.basePrice} onChange={set('basePrice')} /></Field></div>
            <div className="col-md-3"><Field id="rt-status" label="Status"><select id="rt-status" className="form-select" value={f.status} onChange={set('status')}><option value="active">On sale</option><option value="inactive">Not on sale</option></select></Field></div>
            <div className="col-4"><Field id="rt-guests" label="Sleeps"><select id="rt-guests" className="form-select" value={f.maxGuests} onChange={set('maxGuests')}>{Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}</select></Field></div>
            <div className="col-4"><Field id="rt-bed" label="Bed type"><input id="rt-bed" className="form-control" value={f.bedType} onChange={set('bedType')} /></Field></div>
            <div className="col-4"><Field id="rt-size" label="Size (m²)"><input id="rt-size" type="number" min="0" className="form-control" value={f.sizeSqm} onChange={set('sizeSqm')} /></Field></div>
          </div>
          <Field id="rt-desc" label="Description"><textarea id="rt-desc" rows={3} className="form-control" value={f.description} onChange={set('description')} maxLength={2000} /></Field>
          <Field id="rt-amen" label="Amenities" hint="Separate with commas"><input id="rt-amen" className="form-control" value={f.amenitiesText} onChange={set('amenitiesText')} /></Field>
          <h3 className="h5 mt-2">Seasonal pricing</h3>
          <p className="small text-muted">A season replaces the base price on every night from its start to its end date (inclusive). If seasons overlap, the one that starts later wins.</p>
          {f.seasonalRates.map((s, i) => (
            <div key={i} className="row g-2 align-items-end mb-2">
              <div className="col-md-4"><label className="form-label small" htmlFor={`s-name-${i}`}>Season</label><input id={`s-name-${i}`} className="form-control" value={s.name} onChange={setSeason(i, 'name')} /></div>
              <div className="col-6 col-md-3"><label className="form-label small" htmlFor={`s-start-${i}`}>First night</label><input id={`s-start-${i}`} type="date" className="form-control" value={s.startDate} onChange={setSeason(i, 'startDate')} /></div>
              <div className="col-6 col-md-3"><label className="form-label small" htmlFor={`s-end-${i}`}>Last night</label><input id={`s-end-${i}`} type="date" className="form-control" value={s.endDate} onChange={setSeason(i, 'endDate')} /></div>
              <div className="col-8 col-md-1"><label className="form-label small" htmlFor={`s-price-${i}`}>₹/night</label><input id={`s-price-${i}`} type="number" min="0" className="form-control" value={s.price} onChange={setSeason(i, 'price')} /></div>
              <div className="col-4 col-md-1"><button type="button" className="btn btn-quiet w-100" aria-label={`Remove season ${s.name || i + 1}`} onClick={() => setF({ ...f, seasonalRates: f.seasonalRates.filter((_, j) => j !== i) })}><Trash2 size={16} /></button></div>
              {errors[`season${i}`] && <div className="col-12 invalid-feedback d-block">{errors[`season${i}`]}</div>}
            </div>
          ))}
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setF({ ...f, seasonalRates: [...f.seasonalRates, { name: '', startDate: '', endDate: '', price: f.basePrice }] })}><Plus size={14} className="me-1" aria-hidden="true" />Add season</button>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-quiet" onClick={onClose}>Close</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{editing ? 'Save room type' : 'Create room type'}</button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

export function RoomTypes() {
  const { hotelId, none } = useScoped();
  const { data, loading, error, reload } = useApi(() => api.get('/room-types', { params: { hotel: hotelId } }), [hotelId], { skip: !hotelId });
  const [modal, setModal] = useState(null);
  const [photos, setPhotos] = useState(null);
  const [removing, setRemoving] = useState(null);
  if (none) return <NoHotel />;
  const current = photos && data?.find((d) => d._id === photos);
  return (
    <>
      <PageHeader title="Room types & pricing" description="What guests book. Prices are per night before tax; changes apply to new bookings only." actions={<button type="button" className="btn btn-primary" onClick={() => setModal({ editing: null })}><Plus size={16} className="me-1" aria-hidden="true" />New room type</button>} />
      {error ? <ErrorState error={error} onRetry={reload} /> : loading || !data ? <SkeletonRows /> : data.length === 0 ? (
        <div className="panel"><EmptyState icon={Tag} title="No room types yet" action={<button className="btn btn-primary" onClick={() => setModal({ editing: null })}>Create the first one</button>}>Create a room type, then add physical rooms to it under Rooms.</EmptyState></div>
      ) : (
        <div className="d-grid gap-3">
          {data.map((rt) => (
            <article key={rt._id} className="panel d-flex flex-column flex-md-row overflow-hidden">
              <Img src={rt.images?.[0]?.url} alt={rt.name} style={{ width: '100%', maxWidth: 240, minHeight: 160 }} />
              <div className="p-3 flex-grow-1">
                <div className="d-flex justify-content-between flex-wrap gap-2">
                  <div>
                    <h2 className="h4 mb-1">{rt.name}</h2>
                    <div className="small text-muted">Sleeps {rt.maxGuests}{rt.bedType ? `, ${rt.bedType}` : ''}, {plural(rt.roomCount, 'room')}</div>
                  </div>
                  <div className="text-end">
                    <div className="price-figure num">{money(rt.basePrice)}</div>
                    <span className={`status ${rt.status === 'active' ? 'status-good' : 'status-neutral'}`}>{rt.status === 'active' ? 'On sale' : 'Not on sale'}</span>
                  </div>
                </div>
                {rt.seasonalRates?.length > 0 && (
                  <ul className="small list-unstyled mt-2 mb-0">
                    {rt.seasonalRates.map((s) => <li key={s._id}>{s.name}: <span className="num">{money(s.price)}</span> from {date(s.startDate)} to {date(s.endDate)}</li>)}
                  </ul>
                )}
                <div className="d-flex gap-2 mt-3 flex-wrap">
                  <button type="button" className="btn btn-sm btn-quiet" onClick={() => setModal({ editing: rt })}><Pencil size={14} className="me-1" aria-hidden="true" />Edit details & pricing</button>
                  <button type="button" className="btn btn-sm btn-quiet" onClick={() => setPhotos(rt._id)}>Photos ({rt.images.length})</button>
                  <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setRemoving(rt)}>Delete</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <RoomTypeModal show={Boolean(modal)} editing={modal?.editing} hotelId={hotelId} onClose={() => setModal(null)} onSaved={reload} />
      <Modal show={Boolean(current)} onHide={() => setPhotos(null)} size="lg" centered>
        <Modal.Header closeButton><Modal.Title as="h2" className="h4">Photos: {current?.name}</Modal.Title></Modal.Header>
        <Modal.Body>
          {current && (
            <ImageManager
              path={`/room-types/${current._id}`}
              images={current.images}
              onChange={reload}
              saveImages={async (images) => {
                try {
                  await api.patch(`/room-types/${current._id}`, { images });
                  reload();
                } catch (err) {
                  toast.error(err.message);
                }
              }}
            />
          )}
        </Modal.Body>
      </Modal>
      <ConfirmDialog show={Boolean(removing)} title={`Delete ${removing?.name}?`} tone="danger" confirmLabel="Delete" onClose={() => setRemoving(null)} onConfirm={async () => {
        try {
          const res = await api.delete(`/room-types/${removing._id}`);
          toast.info(res.data.deleted ? 'Room type deleted' : res.data.reason);
          reload();
        } catch (err) {
          toast.error(err.message);
          throw err;
        }
      }}>
        <p className="mb-0">Room types that have rooms or bookings are taken off sale instead of being deleted, so booking history stays intact.</p>
      </ConfirmDialog>
    </>
  );
}

/* ───────── physical rooms ───────── */

export function RoomsInventory() {
  const { hotelId, none } = useScoped();
  const rooms = useApi(() => api.get('/rooms', { params: { hotel: hotelId } }), [hotelId], { skip: !hotelId });
  const types = useApi(() => api.get('/room-types', { params: { hotel: hotelId } }), [hotelId], { skip: !hotelId });
  const [edit, setEdit] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [errors, setErrors] = useState({});
  if (none) return <NoHotel />;
  const save = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!edit.roomNumber?.trim()) errs.roomNumber = 'Enter a room number';
    if (!edit.category) errs.category = 'Choose a room type';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body = { roomNumber: edit.roomNumber.trim(), category: edit.category, floor: edit.floor === '' || edit.floor === undefined ? undefined : Number(edit.floor), status: edit.status, notes: edit.notes?.trim() || undefined };
    try {
      if (edit._id) await api.patch(`/rooms/${edit._id}`, body);
      else await api.post('/rooms', { ...body, hotel: hotelId });
      toast.success(edit._id ? 'Room saved' : 'Room added');
      setEdit(null);
      rooms.reload();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      toast.error(err.message);
    }
  };
  return (
    <>
      <PageHeader title="Rooms" description="Physical rooms that can be assigned to bookings. Set a room to maintenance or out of service to stop selling it." actions={<button type="button" className="btn btn-primary" onClick={() => { setErrors({}); setEdit({ roomNumber: '', category: types.data?.[0]?._id ?? '', floor: '', status: 'available', notes: '' }); }} disabled={!types.data?.length}><Plus size={16} className="me-1" aria-hidden="true" />Add room</button>} />
      <div className="panel">
        {rooms.error ? <ErrorState error={rooms.error} onRetry={rooms.reload} /> : rooms.loading || !rooms.data ? <SkeletonRows /> : rooms.data.length === 0 ? (
          <EmptyState icon={BedDouble} title="No rooms yet">{types.data?.length ? 'Add rooms so they can be sold.' : 'Create a room type first, then add its rooms.'}</EmptyState>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover">
              <thead><tr><th scope="col">Room</th><th scope="col">Type</th><th scope="col">Floor</th><th scope="col">Status</th><th scope="col">Tonight</th><th scope="col" className="text-end">Actions</th></tr></thead>
              <tbody>
                {rooms.data.map((r) => (
                  <tr key={r._id}>
                    <td className="fw-semibold">{r.roomNumber}{r.notes && <div className="small text-muted fw-normal">{r.notes}</div>}</td>
                    <td>{r.category?.name}</td>
                    <td className="num">{r.floor ?? '—'}</td>
                    <td><StatusBadge kind="room" value={r.status} /></td>
                    <td className="small">{r.currentGuest ? r.currentGuest.name : r.soldTonight ? 'Sold' : 'Free'}</td>
                    <td className="text-end text-nowrap">
                      <button type="button" className="btn btn-sm btn-quiet me-1" onClick={() => { setErrors({}); setEdit({ ...r, category: r.category?._id, floor: r.floor ?? '', notes: r.notes ?? '' }); }}>Edit</button>
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setRemoving(r)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal show={Boolean(edit)} onHide={() => setEdit(null)} centered>
        {edit && (
          <form onSubmit={save} noValidate>
            <Modal.Header closeButton><Modal.Title as="h2" className="h4">{edit._id ? `Edit room ${edit.roomNumber}` : 'Add a room'}</Modal.Title></Modal.Header>
            <Modal.Body>
              <div className="row">
                <div className="col-6"><Field id="rm-num" label="Room number" error={errors.roomNumber}><input id="rm-num" className={`form-control ${errors.roomNumber ? 'is-invalid' : ''}`} value={edit.roomNumber} onChange={(e) => setEdit({ ...edit, roomNumber: e.target.value })} maxLength={10} /></Field></div>
                <div className="col-6"><Field id="rm-floor" label="Floor"><input id="rm-floor" type="number" className="form-control" value={edit.floor} onChange={(e) => setEdit({ ...edit, floor: e.target.value })} /></Field></div>
              </div>
              <Field id="rm-type" label="Room type" error={errors.category}>
                <select id="rm-type" className="form-select" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
                  {(types.data ?? []).map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
                </select>
              </Field>
              <Field id="rm-status" label="Status">
                <select id="rm-status" className="form-select" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })} disabled={edit.status === 'occupied'}>
                  {['available', 'cleaning', 'maintenance', 'out_of_service', ...(edit.status === 'occupied' ? ['occupied'] : [])].map((s) => <option key={s} value={s}>{sentence(s)}</option>)}
                </select>
              </Field>
              <Field id="rm-notes" label="Notes"><input id="rm-notes" className="form-control" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} maxLength={500} /></Field>
            </Modal.Body>
            <Modal.Footer>
              <button type="button" className="btn btn-quiet" onClick={() => setEdit(null)}>Close</button>
              <button type="submit" className="btn btn-primary">{edit._id ? 'Save room' : 'Add room'}</button>
            </Modal.Footer>
          </form>
        )}
      </Modal>
      <ConfirmDialog show={Boolean(removing)} title={`Delete room ${removing?.roomNumber}?`} tone="danger" confirmLabel="Delete room" onClose={() => setRemoving(null)} onConfirm={async () => {
        try {
          await api.delete(`/rooms/${removing._id}`);
          toast.success('Room deleted');
          rooms.reload();
        } catch (err) {
          toast.error(err.message);
          throw err;
        }
      }}>
        <p className="mb-0">Rooms with booking history cannot be deleted; set them to out of service instead.</p>
      </ConfirmDialog>
    </>
  );
}

export function HotelSettings() {
  const { hotelId, none, reload: reloadHotels } = useScoped();
  const { data, loading, error, reload } = useApi(() => api.get(`/hotels/${hotelId}`), [hotelId], { skip: !hotelId });
  if (none) return <NoHotel />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !data) return <SkeletonRows rows={8} />;
  const hotel = data.hotel;
  return (
    <>
      <PageHeader title="Hotel settings" description="What guests see on the hotel page." actions={<Link to={`/hotels/${hotel.slug}`} className="btn btn-quiet">View public page</Link>} />
      <div className="row g-4">
        <div className="col-xl-7"><div className="panel panel-pad"><HotelForm key={hotel._id + hotel.updatedAt} hotel={hotel} onSaved={() => { reload(); reloadHotels(); }} /></div></div>
        <div className="col-xl-5">
          <div className="panel panel-pad">
            <h2 className="h4">Photos</h2>
            <ImageManager path={`/hotels/${hotel._id}`} images={hotel.images} onChange={reload} saveImages={async (images) => {
              try {
                await api.patch(`/hotels/${hotel._id}`, { images });
                reload();
              } catch (err) {
                toast.error(err.message);
              }
            }} />
          </div>
        </div>
      </div>
    </>
  );
}

export function ManagerStaff() {
  const { hotelId, none } = useScoped();
  if (none) return <NoHotel />;
  return (
    <>
      <PageHeader title="Staff" description="Who can run front desk, housekeeping and requests at this hotel." />
      {hotelId && <AssignmentsPanel hotelId={hotelId} key={hotelId} />}
    </>
  );
}

export function ManagerReports() {
  const { hotelId, hotel, none } = useScoped();
  if (none) return <NoHotel />;
  return (
    <>
      <PageHeader title="Reports" description={`Revenue, occupancy and booking trends${hotel ? ` for ${hotel.name}` : ''}.`} />
      {hotelId && <AnalyticsView hotelId={hotelId} />}
    </>
  );
}
