import { ClipboardList, ConciergeBell, DoorOpen, LogIn, LogOut, Plus, Search, SprayCan, Users } from 'lucide-react';
import { useState } from 'react';
import { Modal } from 'react-bootstrap';
import { Link } from 'react-router';
import { toast } from 'react-toastify';
import api, { cleanParams } from '../../api/client';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { PageHeader, Pagination, StatCard, StatusBadge } from '../../components/ui/Bits';
import { EmptyState, ErrorState, SkeletonRows } from '../../components/ui/Feedback';
import { HOME_FOR_ROLE, useAuth } from '../../context/AuthContext';
import { useHotelScope } from '../../context/HotelScopeContext';
import useApi from '../../hooks/useApi';
import { date, dayDate, plural, relative, sentence } from '../../utils/format';
import { SERVICE_TYPES, TASK_TYPES } from '../../utils/status';

export function NoHotel() {
  return (
    <div className="panel">
      <EmptyState icon={ConciergeBell} title="You are not assigned to a hotel yet">
        Ask your hotel manager or an administrator to assign you. Once assigned, today’s arrivals and tasks will appear here.
      </EmptyState>
    </div>
  );
}

function useBase() {
  const { user } = useAuth();
  return HOME_FOR_ROLE[user.role];
}

/* ───────────────────────── Today ───────────────────────── */

export function StaffDashboard() {
  const { hotelId, hotel, hotels, loading: hl } = useHotelScope();
  const base = useBase();
  const { data, loading, error, reload } = useApi(() => api.get('/operations/dashboard', { params: { hotel: hotelId } }), [hotelId], { skip: !hotelId });
  if (!hl && !hotels.length) return <NoHotel />;
  return (
    <>
      <PageHeader title="Today" description={hotel ? `${hotel.name}, ${data ? dayDate(data.today) : ''}` : ''} actions={<Link to={`${base}/front-desk`} className="btn btn-primary"><ConciergeBell size={16} className="me-2" aria-hidden="true" />Open front desk</Link>} />
      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading || !data ? (
        <SkeletonRows rows={6} />
      ) : (
        <>
          <div className="row g-3 mb-4">
            <div className="col-6 col-lg"><StatCard label="Arrivals to check in" value={data.counts.arrivalsPending} icon={LogIn} /></div>
            <div className="col-6 col-lg"><StatCard label="Departures to check out" value={data.counts.departuresPending} icon={LogOut} /></div>
            <div className="col-6 col-lg"><StatCard label="Guests in house" value={data.counts.inHouse} icon={Users} /></div>
            <div className="col-6 col-lg"><StatCard label="Open housekeeping" value={data.counts.housekeepingOpen} icon={SprayCan} /></div>
            <div className="col-6 col-lg"><StatCard label="Open guest requests" value={data.counts.requestsOpen} icon={ClipboardList} /></div>
          </div>
          <div className="row g-4">
            <div className="col-lg-4">
              <section className="panel h-100">
                <div className="panel-header"><h2>Rooms right now</h2><Link to={`${base}/rooms`} className="small">Room board</Link></div>
                <ul className="list-unstyled p-3 mb-0">
                  {['available', 'occupied', 'cleaning', 'maintenance', 'out_of_service'].map((s) => (
                    <li key={s} className="d-flex justify-content-between py-1">
                      <StatusBadge kind="room" value={s} />
                      <span className="num fw-semibold">{data.roomStatus[s] ?? 0}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
            <div className="col-lg-4">
              <section className="panel h-100">
                <div className="panel-header"><h2>Housekeeping queue</h2><Link to={`${base}/housekeeping`} className="small">All tasks</Link></div>
                {data.housekeeping.length ? (
                  <ul className="list-unstyled mb-0">
                    {data.housekeeping.map((t) => (
                      <li key={t._id} className="px-3 py-2 border-bottom d-flex justify-content-between" style={{ borderColor: 'var(--hp-stone-soft)' }}>
                        <span className="small"><strong>Room {t.room?.roomNumber}</strong> {TASK_TYPES[t.type]}<br /><span className="text-muted">{t.assignedTo?.name ?? 'Unassigned'}</span></span>
                        <StatusBadge kind="task" value={t.status} />
                      </li>
                    ))}
                  </ul>
                ) : <p className="p-3 text-muted mb-0">Nothing waiting. Nice work.</p>}
              </section>
            </div>
            <div className="col-lg-4">
              <section className="panel h-100">
                <div className="panel-header"><h2>Guest requests</h2><Link to={`${base}/requests`} className="small">All requests</Link></div>
                {data.requests.length ? (
                  <ul className="list-unstyled mb-0">
                    {data.requests.map((r) => (
                      <li key={r._id} className="px-3 py-2 border-bottom" style={{ borderColor: 'var(--hp-stone-soft)' }}>
                        <div className="d-flex justify-content-between small"><strong>{SERVICE_TYPES[r.type]}{r.room ? `, room ${r.room.roomNumber}` : ''}</strong><StatusBadge kind="request" value={r.status} /></div>
                        <div className="small text-muted text-truncate">{r.description}</div>
                      </li>
                    ))}
                  </ul>
                ) : <p className="p-3 text-muted mb-0">No open requests.</p>}
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* ───────────────────────── Front desk ───────────────────────── */

function MovementTable({ rows, kind, onAction, base, empty }) {
  if (!rows.length) return <p className="p-3 text-muted mb-0">{empty}</p>;
  return (
    <div className="table-responsive">
      <table className="table table-hover">
        <thead>
          <tr>
            <th scope="col">Guest</th>
            <th scope="col">Room</th>
            <th scope="col">Stay</th>
            <th scope="col">Status</th>
            <th scope="col" className="text-end">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b._id}>
              <td>
                <Link to={`${base}/bookings/${b._id}`} className="fw-semibold">{b.guestDetails.name}</Link>
                <div className="small text-muted num">{b.confirmationCode}{b.guests ? `, ${plural(b.guests, 'guest')}` : ''}</div>
              </td>
              <td>{b.room ? `Room ${b.room.roomNumber}` : '—'}<div className="small text-muted">{b.category?.name}</div></td>
              <td className="small">{date(b.checkIn, { year: undefined })} – {date(b.checkOut, { year: undefined })}</td>
              <td><StatusBadge kind="booking" value={b.status} />{b.status === 'confirmed' && b.paymentStatus !== 'paid' && <div><StatusBadge kind="payment" value={b.paymentStatus} /></div>}</td>
              <td className="text-end">
                {kind !== 'inhouse' && b.status === 'confirmed' && <button type="button" className="btn btn-primary btn-sm" onClick={() => onAction('check-in', b)}>Check in</button>}
                {b.status === 'checked_in' && <button type="button" className="btn btn-primary btn-sm" onClick={() => onAction('check-out', b)}>Check out</button>}
                {b.status === 'checked_out' && <span className="small text-muted">Departed</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FrontDesk() {
  const { hotelId, hotels, loading: hl } = useHotelScope();
  const base = useBase();
  const [tab, setTab] = useState('arrivals');
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [pending, setPending] = useState(null);
  const { data, loading, error, reload } = useApi(() => api.get('/operations/front-desk', { params: { hotel: hotelId } }), [hotelId], { skip: !hotelId });
  if (!hl && !hotels.length) return <NoHotel />;

  const search = async (e) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    try {
      const res = await api.get('/operations/lookup', { params: { hotel: hotelId, q: q.trim() } });
      setResults(res.data);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const run = async () => {
    const { action, booking } = pending;
    try {
      await api.post(`/operations/bookings/${booking._id}/${action}`, {});
      toast.success(action === 'check-in' ? `${booking.guestDetails.name} checked in` : `${booking.guestDetails.name} checked out`);
      reload();
      if (results) setResults(null);
    } catch (err) {
      toast.error(err.message);
      throw err;
    }
  };

  const tabs = data
    ? [
        ['arrivals', `Arrivals (${data.arrivals.length})`, data.arrivals, 'No arrivals today.'],
        ['departures', `Departures (${data.departures.length})`, data.departures, 'No departures today.'],
        ['inhouse', `In house (${data.inHouse.length})`, data.inHouse, 'No guests in house.'],
        ...(data.overdueDepartures.length ? [['overdue', `Overdue (${data.overdueDepartures.length})`, data.overdueDepartures, '']] : []),
      ]
    : [];
  const current = tabs.find((t) => t[0] === tab) ?? tabs[0];

  return (
    <>
      <PageHeader title="Front desk" description={data ? `Arrivals and departures for ${dayDate(data.today)}` : 'Arrivals and departures'} />
      <form className="panel panel-pad mb-4 d-flex flex-wrap gap-2 align-items-end" onSubmit={search} role="search">
        <div className="flex-grow-1" style={{ minWidth: 220 }}>
          <label className="form-label" htmlFor="fd-q">Find a reservation</label>
          <input id="fd-q" className="form-control" placeholder="Confirmation code, guest name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary"><Search size={16} className="me-1" aria-hidden="true" />Search</button>
        {results && <button type="button" className="btn btn-quiet" onClick={() => { setResults(null); setQ(''); }}>Clear</button>}
      </form>
      {results && (
        <section className="panel mb-4">
          <div className="panel-header"><h2>Search results</h2><span className="small text-muted">{plural(results.length, 'match', 'matches')}</span></div>
          <MovementTable rows={results} kind="search" onAction={(action, booking) => setPending({ action, booking })} base={base} empty="No reservations match that search." />
        </section>
      )}
      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading || !data ? (
        <SkeletonRows />
      ) : (
        <section className="panel">
          <ul className="nav nav-tabs px-3 pt-2" role="tablist">
            {tabs.map(([k, label]) => (
              <li key={k} className="nav-item" role="presentation">
                <button type="button" role="tab" aria-selected={current[0] === k} className={`nav-link ${current[0] === k ? 'active' : ''}`} onClick={() => setTab(k)}>{label}</button>
              </li>
            ))}
          </ul>
          <MovementTable rows={current[2]} kind={current[0]} onAction={(action, booking) => setPending({ action, booking })} base={base} empty={current[3]} />
        </section>
      )}
      <ConfirmDialog show={Boolean(pending)} title={pending?.action === 'check-in' ? `Check in ${pending?.booking.guestDetails.name}?` : `Check out ${pending?.booking.guestDetails.name}?`} confirmLabel={pending?.action === 'check-in' ? 'Check in' : 'Check out'} onClose={() => setPending(null)} onConfirm={run}>
        <p className="mb-0">{pending?.action === 'check-in' ? `Room ${pending?.booking.room?.roomNumber ?? ''} will be marked occupied. Confirm the guest's photo ID first.` : 'The room moves to cleaning and a departure-clean task is created automatically.'}</p>
      </ConfirmDialog>
    </>
  );
}

/* ───────────────────────── Room board ───────────────────────── */

export function RoomBoard() {
  const { hotelId, hotels, loading: hl } = useHotelScope();
  const [filter, setFilter] = useState('');
  const { data, loading, error, reload, setData } = useApi(() => api.get('/rooms', { params: { hotel: hotelId } }), [hotelId], { skip: !hotelId });
  if (!hl && !hotels.length) return <NoHotel />;
  const change = async (room, status) => {
    try {
      const res = await api.patch(`/rooms/${room._id}/status`, { status });
      setData((list) => list.map((r) => (r._id === room._id ? { ...r, status: res.data.status } : r)));
      toast.success(`Room ${room.roomNumber} is now ${sentence(status).toLowerCase()}`);
    } catch (err) {
      toast.error(err.message);
    }
  };
  const rooms = (data ?? []).filter((r) => !filter || r.status === filter);
  return (
    <>
      <PageHeader title="Room board" description="Live status of every room. Occupied rooms change only through check-in and check-out." actions={
        <select className="form-select form-select-sm" aria-label="Filter by status" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All rooms</option>
          {['available', 'occupied', 'cleaning', 'maintenance', 'out_of_service'].map((s) => <option key={s} value={s}>{sentence(s)}</option>)}
        </select>
      } />
      {error ? <ErrorState error={error} onRetry={reload} /> : loading || !data ? <SkeletonRows /> : rooms.length === 0 ? (
        <div className="panel"><EmptyState icon={DoorOpen} title="No rooms with that status" /></div>
      ) : (
        <div className="row g-3">
          {rooms.map((r) => (
            <div className="col-sm-6 col-lg-4 col-xl-3" key={r._id}>
              <div className="panel panel-pad h-100">
                <div className="d-flex justify-content-between align-items-start">
                  <div>
                    <div className="figure">{r.roomNumber}</div>
                    <div className="small text-muted">{r.category?.name}</div>
                  </div>
                  <StatusBadge kind="room" value={r.status} />
                </div>
                <div className="small mt-2" style={{ minHeight: 40 }}>
                  {r.currentGuest ? <>Guest: <strong>{r.currentGuest.name}</strong><br /><span className="text-muted">Leaves {date(r.currentGuest.checkOut, { year: undefined })}</span></> : r.soldTonight ? <span className="text-muted">Sold for tonight</span> : <span className="text-muted">Free tonight</span>}
                  {r.notes && <div className="text-muted">{r.notes}</div>}
                </div>
                {r.status !== 'occupied' && (
                  <select className="form-select form-select-sm mt-2" aria-label={`Change status of room ${r.roomNumber}`} value={r.status} onChange={(e) => change(r, e.target.value)}>
                    {['available', 'cleaning', 'maintenance', 'out_of_service'].map((s) => <option key={s} value={s}>{sentence(s)}</option>)}
                  </select>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ───────────────────────── Housekeeping ───────────────────────── */

function NewTaskModal({ show, onClose, hotelId, team, onCreated }) {
  const rooms = useApi(() => api.get('/rooms', { params: { hotel: hotelId } }), [hotelId, show], { skip: !show || !hotelId });
  const [form, setForm] = useState({ room: '', type: 'daily_service', priority: 'normal', assignedTo: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!form.room) return toast.error('Choose a room');
    setBusy(true);
    try {
      await api.post('/operations/housekeeping', cleanParams({ ...form, hotel: hotelId, notes: form.notes.trim() }));
      toast.success('Task created');
      onCreated();
      onClose();
      setForm({ room: '', type: 'daily_service', priority: 'normal', assignedTo: '', notes: '' });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal show={show} onHide={onClose} centered>
      <form onSubmit={submit}>
        <Modal.Header closeButton><Modal.Title as="h2" className="h4">New housekeeping task</Modal.Title></Modal.Header>
        <Modal.Body className="d-grid gap-3">
          <div>
            <label className="form-label" htmlFor="hk-room">Room</label>
            <select id="hk-room" className="form-select" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} required>
              <option value="">Choose a room</option>
              {(rooms.data ?? []).map((r) => <option key={r._id} value={r._id}>Room {r.roomNumber} ({sentence(r.status)})</option>)}
            </select>
          </div>
          <div className="row g-2">
            <div className="col-6">
              <label className="form-label" htmlFor="hk-type">Task</label>
              <select id="hk-type" className="form-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {Object.entries(TASK_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="col-6">
              <label className="form-label" htmlFor="hk-pri">Priority</label>
              <select id="hk-pri" className="form-select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
              </select>
            </div>
          </div>
          <div>
            <label className="form-label" htmlFor="hk-assign">Assign to</label>
            <select id="hk-assign" className="form-select" value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}>
              <option value="">Unassigned</option>
              {team.map((m) => <option key={m._id} value={m._id}>{m.name}{m.position ? ` (${m.position})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="hk-notes">Notes</label>
            <textarea id="hk-notes" className="form-control" rows={2} maxLength={500} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-quiet" onClick={onClose}>Close</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>Create task</button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

const NEXT_TASK = { pending: ['in_progress', 'Start'], in_progress: ['done', 'Mark done'] };

export function Housekeeping() {
  const { hotelId, hotels, loading: hl } = useHotelScope();
  const [status, setStatus] = useState('open');
  const [page, setPage] = useState(1);
  const [show, setShow] = useState(false);
  const { data, meta, loading, error, reload } = useApi(
    () => api.get('/operations/housekeeping', { params: cleanParams({ hotel: hotelId, status: status === 'open' ? undefined : status, page }) }),
    [hotelId, status, page],
    { skip: !hotelId }
  );
  const team = useApi(() => api.get('/operations/team', { params: { hotel: hotelId } }), [hotelId], { skip: !hotelId });
  if (!hl && !hotels.length) return <NoHotel />;
  const rows = (data ?? []).filter((t) => status !== 'open' || t.status !== 'done');
  const update = async (t, patch, msg) => {
    try {
      await api.patch(`/operations/housekeeping/${t._id}`, patch);
      if (msg) toast.success(msg);
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  };
  return (
    <>
      <PageHeader title="Housekeeping" description="Finishing a departure clean puts the room back on sale automatically." actions={<button type="button" className="btn btn-primary" onClick={() => setShow(true)}><Plus size={16} className="me-1" aria-hidden="true" />New task</button>} />
      <div className="d-flex gap-2 mb-3 flex-wrap" role="group" aria-label="Filter tasks">
        {[['open', 'Open'], ['pending', 'To do'], ['in_progress', 'In progress'], ['done', 'Done']].map(([k, l]) => (
          <button key={k} type="button" className={`btn btn-sm ${status === k ? 'btn-primary' : 'btn-quiet'}`} onClick={() => { setStatus(k); setPage(1); }}>{l}</button>
        ))}
      </div>
      <div className="panel">
        {error ? <ErrorState error={error} onRetry={reload} /> : loading || !data ? <SkeletonRows /> : rows.length === 0 ? (
          <EmptyState icon={SprayCan} title="No tasks here">New departure cleans are created automatically at check-out.</EmptyState>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover">
              <thead><tr><th scope="col">Room</th><th scope="col">Task</th><th scope="col">Assigned to</th><th scope="col">Status</th><th scope="col" className="text-end">Update</th></tr></thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t._id}>
                    <td><strong>Room {t.room?.roomNumber}</strong><div className="small text-muted"><StatusBadge kind="room" value={t.room?.status} /></div></td>
                    <td>{TASK_TYPES[t.type]}{t.priority === 'high' && <span className="status status-bad ms-2">High priority</span>}<div className="small text-muted">{t.notes}</div></td>
                    <td>
                      <select className="form-select form-select-sm" aria-label={`Assign task for room ${t.room?.roomNumber}`} value={t.assignedTo?._id ?? ''} onChange={(e) => update(t, { assignedTo: e.target.value || null }, 'Task reassigned')} disabled={t.status === 'done'}>
                        <option value="">Unassigned</option>
                        {(team.data ?? []).map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
                      </select>
                    </td>
                    <td><StatusBadge kind="task" value={t.status} /><div className="small text-muted">{t.completedAt ? `Done ${relative(t.completedAt)}` : `Created ${relative(t.createdAt)}`}</div></td>
                    <td className="text-end">
                      {NEXT_TASK[t.status] && <button type="button" className="btn btn-sm btn-primary" onClick={() => update(t, { status: NEXT_TASK[t.status][0] }, `Room ${t.room?.roomNumber}: ${NEXT_TASK[t.status][1].toLowerCase()}`)}>{NEXT_TASK[t.status][1]}</button>}
                      {t.status === 'done' && <button type="button" className="btn btn-sm btn-quiet" onClick={() => update(t, { status: 'pending' }, 'Task reopened')}>Reopen</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination meta={meta} onPage={setPage} />
          </div>
        )}
      </div>
      <NewTaskModal show={show} onClose={() => setShow(false)} hotelId={hotelId} team={team.data ?? []} onCreated={reload} />
    </>
  );
}

/* ───────────────────────── Guest requests ───────────────────────── */

export function GuestRequests() {
  const { hotelId, hotels, loading: hl } = useHotelScope();
  const [status, setStatus] = useState('open');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const base = useBase();
  const { data, meta, loading, error, reload } = useApi(() => api.get('/operations/service-requests', { params: cleanParams({ hotel: hotelId, status, page }) }), [hotelId, status, page], { skip: !hotelId });
  const team = useApi(() => api.get('/operations/team', { params: { hotel: hotelId } }), [hotelId], { skip: !hotelId });
  if (!hl && !hotels.length) return <NoHotel />;
  const save = async () => {
    try {
      await api.patch(`/operations/service-requests/${editing._id}`, cleanParams({ status: editing.status, staffNote: editing.staffNote?.trim(), assignedTo: editing.assignedTo || null }));
      toast.success('Request updated; the guest has been notified');
      setEditing(null);
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  };
  return (
    <>
      <PageHeader title="Guest requests" description="Requests sent by guests from their booking page. Status changes notify the guest." />
      <div className="d-flex gap-2 mb-3 flex-wrap" role="group" aria-label="Filter requests">
        {[['open', 'Open'], ['in_progress', 'In progress'], ['resolved', 'Resolved'], ['', 'All']].map(([k, l]) => (
          <button key={l} type="button" className={`btn btn-sm ${status === k ? 'btn-primary' : 'btn-quiet'}`} onClick={() => { setStatus(k); setPage(1); }}>{l}</button>
        ))}
      </div>
      <div className="panel">
        {error ? <ErrorState error={error} onRetry={reload} /> : loading || !data ? <SkeletonRows /> : data.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No requests here">Guests can send requests once their stay is confirmed.</EmptyState>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover">
              <thead><tr><th scope="col">Request</th><th scope="col">Guest</th><th scope="col">Assigned</th><th scope="col">Status</th><th scope="col" className="text-end">Action</th></tr></thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r._id}>
                    <td style={{ maxWidth: 320 }}><strong>{SERVICE_TYPES[r.type]}</strong>{r.priority === 'high' && <span className="status status-bad ms-2">Urgent</span>}<div className="small">{r.description}</div>{r.staffNote && <div className="small text-muted">Note: {r.staffNote}</div>}</td>
                    <td className="small"><Link to={`${base}/bookings/${r.booking?._id}`}>{r.booking?.guestDetails?.name}</Link><div className="text-muted">{r.room ? `Room ${r.room.roomNumber}` : ''}, {relative(r.createdAt)}</div></td>
                    <td className="small">{r.assignedTo?.name ?? 'Unassigned'}</td>
                    <td><StatusBadge kind="request" value={r.status} /></td>
                    <td className="text-end"><button type="button" className="btn btn-sm btn-quiet" onClick={() => setEditing({ _id: r._id, status: r.status, staffNote: r.staffNote ?? '', assignedTo: r.assignedTo?._id ?? '' })}>Update</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination meta={meta} onPage={setPage} />
          </div>
        )}
      </div>
      <Modal show={Boolean(editing)} onHide={() => setEditing(null)} centered>
        <Modal.Header closeButton><Modal.Title as="h2" className="h4">Update request</Modal.Title></Modal.Header>
        {editing && (
          <Modal.Body className="d-grid gap-3">
            <div>
              <label className="form-label" htmlFor="sr-status">Status</label>
              <select id="sr-status" className="form-select" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                {['open', 'in_progress', 'resolved', 'cancelled'].map((s) => <option key={s} value={s}>{sentence(s)}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="sr-assign">Assigned to</label>
              <select id="sr-assign" className="form-select" value={editing.assignedTo} onChange={(e) => setEditing({ ...editing, assignedTo: e.target.value })}>
                <option value="">Unassigned</option>
                {(team.data ?? []).map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="sr-note">Note for the guest</label>
              <textarea id="sr-note" className="form-control" rows={2} maxLength={500} value={editing.staffNote} onChange={(e) => setEditing({ ...editing, staffNote: e.target.value })} />
            </div>
          </Modal.Body>
        )}
        <Modal.Footer>
          <button type="button" className="btn btn-quiet" onClick={() => setEditing(null)}>Close</button>
          <button type="button" className="btn btn-primary" onClick={save}>Save</button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

