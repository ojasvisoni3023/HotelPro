import { Building2, CalendarDays, CreditCard, Hotel, Plus, ScrollText, ShieldCheck, Star, Undo2, Users } from 'lucide-react';
import { useState } from 'react';
import { Modal } from 'react-bootstrap';
import { Link } from 'react-router';
import { toast } from 'react-toastify';
import api, { cleanParams } from '../../api/client';
import AnalyticsView from '../../components/charts/AnalyticsView';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { Field, Img, PageHeader, Pagination, StatCard, Stars, StatusBadge, TestBadge } from '../../components/ui/Bits';
import { EmptyState, ErrorState, InlineAlert, SkeletonRows } from '../../components/ui/Feedback';
import { useAuth } from '../../context/AuthContext';
import { useHotelScope } from '../../context/HotelScopeContext';
import useApi from '../../hooks/useApi';
import { date, dateTime, money, relative, sentence } from '../../utils/format';
import { ROLE_LABEL, STATUS } from '../../utils/status';
import { AssignmentsPanel, HotelForm, ImageManager, RefundQueue, ReservationsTable } from '../manager/ManageComponents';

export function AdminDashboard() {
  const { data, loading, error, reload } = useApi(() => api.get('/dashboard/admin'), []);
  return (
    <>
      <PageHeader title="Platform overview" description="All hotels. Every figure is computed from stored bookings, payments and rooms." actions={<Link to="/admin/analytics" className="btn btn-primary">Open analytics</Link>} />
      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <SkeletonRows rows={6} /> : (
        <>
          <div className="row g-3 mb-4">
            <div className="col-6 col-lg-2"><StatCard label="Users" value={data.totals.users} icon={Users} hint={`${data.usersByRole.guest ?? 0} guests`} /></div>
            <div className="col-6 col-lg-2"><StatCard label="Active hotels" value={data.totals.hotels} icon={Building2} /></div>
            <div className="col-6 col-lg-2"><StatCard label="Rooms" value={data.totals.rooms} icon={Hotel} /></div>
            <div className="col-6 col-lg-2"><StatCard label="Bookings, all time" value={data.totals.bookings} icon={CalendarDays} /></div>
            <div className="col-6 col-lg-2"><StatCard label="Refunds waiting" value={data.totals.pendingRefunds} icon={Undo2} tone={data.totals.pendingRefunds ? 'bad' : undefined} /></div>
            <div className="col-6 col-lg-2"><StatCard label="Hidden reviews" value={data.totals.hiddenReviews} icon={Star} /></div>
          </div>
        </>
      )}
      <AnalyticsView hotelId={null} showForward={false} />
      <section className="panel mt-4">
        <div className="panel-header"><h2>Recent activity</h2><Link to="/admin/audit-logs" className="small">Full audit log</Link></div>
        {data?.activity?.length ? (
          <ul className="list-unstyled mb-0">
            {data.activity.map((a) => (
              <li key={a._id} className="px-3 py-2 border-bottom d-flex justify-content-between gap-3 small" style={{ borderColor: 'var(--hp-stone-soft)' }}>
                <span><StatusBadge kind="audit" value={a.category} /> <strong className="ms-1">{a.action}</strong> {a.actorEmail && <span className="text-muted">by {a.actorEmail}</span>}</span>
                <span className="text-muted text-nowrap">{relative(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="p-3 text-muted mb-0">No activity recorded yet.</p>}
      </section>
    </>
  );
}

export function AdminAnalytics() {
  const { hotels } = useHotelScope();
  const [hotel, setHotel] = useState('');
  return (
    <>
      <PageHeader
        title="Analytics"
        description="Revenue, occupancy and booking trends across the platform or for one hotel."
        actions={
          <select className="form-select" aria-label="Hotel" value={hotel} onChange={(e) => setHotel(e.target.value)}>
            <option value="">All hotels</option>
            {hotels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
          </select>
        }
      />
      <AnalyticsView hotelId={hotel || null} key={hotel} />
    </>
  );
}

export function AdminBookings() {
  const { hotels } = useHotelScope();
  return (
    <>
      <PageHeader title="Bookings" description="Every reservation on the platform." />
      <ReservationsTable hotelId={null} hotels={hotels} />
    </>
  );
}

export function AdminPayments() {
  const [f, setF] = useState({ status: '', provider: '', q: '' });
  const [page, setPage] = useState(1);
  const { data, meta, loading, error, reload } = useApi(() => api.get('/admin/payments', { params: cleanParams({ ...f, page }) }), [JSON.stringify(f), page]);
  return (
    <>
      <PageHeader title="Payments & refunds" description="Payment attempts across all hotels. Test-mode payments are labelled and never represent real money." />
      <div className="mb-4"><RefundQueue /></div>
      <div className="panel">
        <div className="panel-header flex-wrap">
          <h2>Payments</h2>
          <div className="d-flex gap-2 flex-wrap">
            <select className="form-select form-select-sm" aria-label="Status" value={f.status} onChange={(e) => { setPage(1); setF({ ...f, status: e.target.value }); }}>
              <option value="">Any status</option>
              {['created', 'captured', 'failed', 'refunded', 'partially_refunded'].map((s) => <option key={s} value={s}>{STATUS.payment[s]?.[0] ?? sentence(s)}</option>)}
            </select>
            <select className="form-select form-select-sm" aria-label="Provider" value={f.provider} onChange={(e) => { setPage(1); setF({ ...f, provider: e.target.value }); }}>
              <option value="">Any provider</option>
              <option value="razorpay">Razorpay</option>
              <option value="mock">Test mode</option>
            </select>
          </div>
        </div>
        {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <SkeletonRows /> : data.length === 0 ? <EmptyState icon={CreditCard} title="No payments match" /> : (
          <div className="table-responsive">
            <table className="table table-hover">
              <thead><tr><th scope="col">Date</th><th scope="col">Booking</th><th scope="col">Guest</th><th scope="col">Hotel</th><th scope="col">Provider</th><th scope="col" className="text-end">Amount</th><th scope="col">Status</th></tr></thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p._id}>
                    <td className="small text-nowrap">{dateTime(p.capturedAt ?? p.createdAt)}</td>
                    <td><Link to={`/admin/bookings/${p.booking?._id}`} className="num">{p.booking?.confirmationCode}</Link><div className="small text-muted num text-truncate" style={{ maxWidth: 160 }}>{p.providerOrderId}</div></td>
                    <td className="small">{p.user?.name}</td>
                    <td className="small">{p.hotel?.name}</td>
                    <td className="small">{p.isTest ? <TestBadge /> : `Razorpay${p.method ? `, ${p.method}` : ''}`}</td>
                    <td className="text-end num">{money(p.amount)}{p.amountRefunded > 0 && <div className="small text-muted">−{money(p.amountRefunded)}</div>}</td>
                    <td><StatusBadge kind="payment" value={p.status} />{p.failureReason && <div className="small text-muted">{p.failureReason}</div>}</td>
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

export function AdminUsers() {
  const { user: me } = useAuth();
  const [f, setF] = useState({ q: '', role: '', status: '' });
  const [text, setText] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const { data, meta, loading, error, reload } = useApi(() => api.get('/admin/users', { params: cleanParams({ ...f, page }) }), [JSON.stringify(f), page]);
  const save = async () => {
    const original = data.find((u) => u._id === editing._id);
    const patch = {};
    if (editing.role !== original.role) patch.role = editing.role;
    if (editing.status !== original.status) patch.status = editing.status;
    if (editing.emailVerified !== original.emailVerified) patch.emailVerified = editing.emailVerified;
    if (!Object.keys(patch).length) return setEditing(null);
    try {
      await api.patch(`/admin/users/${editing._id}`, patch);
      toast.success('User updated. Their existing sessions were signed out if their access changed.');
      setEditing(null);
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  };
  return (
    <>
      <PageHeader title="Users & roles" description="Change roles, suspend accounts and confirm email addresses. Every change is written to the audit log." />
      <form className="panel panel-pad mb-3 d-flex flex-wrap gap-2 align-items-end" onSubmit={(e) => { e.preventDefault(); setPage(1); setF({ ...f, q: text.trim() }); }}>
        <div className="flex-grow-1"><label className="form-label" htmlFor="u-q">Search</label><input id="u-q" className="form-control" placeholder="Name or email" value={text} onChange={(e) => setText(e.target.value)} /></div>
        <div><label className="form-label" htmlFor="u-role">Role</label><select id="u-role" className="form-select" value={f.role} onChange={(e) => { setPage(1); setF({ ...f, role: e.target.value }); }}><option value="">Any role</option>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="form-label" htmlFor="u-status">Status</label><select id="u-status" className="form-select" value={f.status} onChange={(e) => { setPage(1); setF({ ...f, status: e.target.value }); }}><option value="">Any</option><option value="active">Active</option><option value="suspended">Suspended</option></select></div>
        <button className="btn btn-primary" type="submit">Search</button>
      </form>
      <div className="panel">
        {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <SkeletonRows /> : data.length === 0 ? <EmptyState icon={Users} title="No users match" /> : (
          <div className="table-responsive">
            <table className="table table-hover">
              <thead><tr><th scope="col">User</th><th scope="col">Role</th><th scope="col">Email</th><th scope="col">Status</th><th scope="col">Joined</th><th scope="col" className="text-end">Action</th></tr></thead>
              <tbody>
                {data.map((u) => (
                  <tr key={u._id}>
                    <td className="fw-semibold">{u.name}{u._id === me._id && <span className="small text-muted fw-normal"> (you)</span>}<div className="small text-muted fw-normal">{u.email}</div></td>
                    <td>{ROLE_LABEL[u.role]}</td>
                    <td>{u.emailVerified ? <span className="status status-good">Verified</span> : <span className="status status-wait">Unverified</span>}</td>
                    <td><StatusBadge kind="user" value={u.status} /></td>
                    <td className="small">{date(u.createdAt)}<div className="text-muted">{u.lastLoginAt ? `Last seen ${relative(u.lastLoginAt)}` : 'Never signed in'}</div></td>
                    <td className="text-end"><button type="button" className="btn btn-sm btn-quiet" onClick={() => setEditing({ ...u })}>Manage</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination meta={meta} onPage={setPage} />
          </div>
        )}
      </div>
      <Modal show={Boolean(editing)} onHide={() => setEditing(null)} centered>
        <Modal.Header closeButton><Modal.Title as="h2" className="h4">{editing?.name}</Modal.Title></Modal.Header>
        {editing && (
          <Modal.Body className="d-grid gap-3">
            {editing._id === me._id && <InlineAlert tone="warn">You cannot change your own role or status. Ask another administrator.</InlineAlert>}
            <Field id="ue-role" label="Role" className="mb-0">
              <select id="ue-role" className="form-select" value={editing.role} disabled={editing._id === me._id} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>
                {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            {editing.role === 'admin' && editing.role !== data.find((u) => u._id === editing._id)?.role && <InlineAlert tone="bad">Administrators can manage every user, hotel, payment and setting. Only grant this to people you trust.</InlineAlert>}
            <Field id="ue-status" label="Account status" className="mb-0">
              <select id="ue-status" className="form-select" value={editing.status} disabled={editing._id === me._id} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                <option value="active">Active</option>
                <option value="suspended">Suspended (cannot sign in)</option>
              </select>
            </Field>
            <div className="form-check">
              <input id="ue-verified" type="checkbox" className="form-check-input" checked={editing.emailVerified} onChange={(e) => setEditing({ ...editing, emailVerified: e.target.checked })} />
              <label htmlFor="ue-verified" className="form-check-label">Email address confirmed</label>
            </div>
            <p className="small text-muted mb-0">Changing role removes the person’s hotel assignments; re-assign them under Staff assignments.</p>
          </Modal.Body>
        )}
        <Modal.Footer>
          <button type="button" className="btn btn-quiet" onClick={() => setEditing(null)}>Close</button>
          <button type="button" className="btn btn-primary" onClick={save}>Save changes</button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

export function AdminHotels() {
  const { reload: reloadScope } = useHotelScope();
  const { data, loading, error, reload } = useApi(() => api.get('/hotels', { params: { includeInactive: 'true', limit: 100, sort: 'name' } }), []);
  const [mode, setMode] = useState(null); // { create } | { edit: hotel } | { photos: hotel }
  const [removing, setRemoving] = useState(null);
  const refresh = () => {
    reload();
    reloadScope();
  };
  const full = useApi(() => api.get(`/hotels/${mode?.edit?._id ?? mode?.photos?._id}`), [mode?.edit?._id, mode?.photos?._id], { skip: !(mode?.edit || mode?.photos) });
  return (
    <>
      <PageHeader title="Hotels" description="Add hotels, edit their public profile, and take them off sale." actions={<button type="button" className="btn btn-primary" onClick={() => setMode({ create: true })}><Plus size={16} className="me-1" aria-hidden="true" />Add hotel</button>} />
      <div className="panel">
        {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <SkeletonRows /> : data.length === 0 ? <EmptyState icon={Building2} title="No hotels yet" /> : (
          <div className="table-responsive">
            <table className="table table-hover">
              <thead><tr><th scope="col">Hotel</th><th scope="col">City</th><th scope="col">Rating</th><th scope="col">From</th><th scope="col">Status</th><th scope="col" className="text-end">Actions</th></tr></thead>
              <tbody>
                {data.map((h) => (
                  <tr key={h._id}>
                    <td><div className="d-flex align-items-center gap-2"><Img src={h.images?.[0]?.url} alt="" style={{ width: 56, height: 42, borderRadius: 6 }} /><Link to={`/hotels/${h.slug}`} className="fw-semibold">{h.name}</Link></div></td>
                    <td className="small">{h.address.city}, {h.address.state}</td>
                    <td><Stars value={h.ratingAvg} count={h.ratingCount} size={13} /></td>
                    <td className="num small">{h.minPrice ? money(h.minPrice) : '—'}</td>
                    <td><span className={`status ${h.status === 'active' ? 'status-good' : 'status-neutral'}`}>{h.status === 'active' ? 'Active' : 'Inactive'}</span></td>
                    <td className="text-end text-nowrap">
                      <button type="button" className="btn btn-sm btn-quiet me-1" onClick={() => setMode({ edit: h })}>Edit</button>
                      <button type="button" className="btn btn-sm btn-quiet me-1" onClick={() => setMode({ photos: h })}>Photos</button>
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setRemoving(h)}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal show={Boolean(mode?.create || mode?.edit)} onHide={() => setMode(null)} size="lg" centered>
        <Modal.Header closeButton><Modal.Title as="h2" className="h4">{mode?.create ? 'Add a hotel' : `Edit ${mode?.edit?.name}`}</Modal.Title></Modal.Header>
        <Modal.Body>
          {mode?.create && <HotelForm isAdmin onSaved={() => { setMode(null); refresh(); }} onCancel={() => setMode(null)} />}
          {mode?.edit && (full.loading || !full.data ? <SkeletonRows /> : <HotelForm isAdmin hotel={full.data.hotel} onSaved={() => { setMode(null); refresh(); }} onCancel={() => setMode(null)} />)}
        </Modal.Body>
      </Modal>
      <Modal show={Boolean(mode?.photos)} onHide={() => setMode(null)} size="lg" centered>
        <Modal.Header closeButton><Modal.Title as="h2" className="h4">Photos: {mode?.photos?.name}</Modal.Title></Modal.Header>
        <Modal.Body>
          {full.data && mode?.photos && (
            <ImageManager path={`/hotels/${mode.photos._id}`} images={full.data.hotel.images} onChange={full.reload} saveImages={async (images) => {
              try {
                await api.patch(`/hotels/${mode.photos._id}`, { images });
                full.reload();
              } catch (err) {
                toast.error(err.message);
              }
            }} />
          )}
        </Modal.Body>
      </Modal>
      <ConfirmDialog show={Boolean(removing)} title={`Remove ${removing?.name}?`} tone="danger" confirmLabel="Remove hotel" onClose={() => setRemoving(null)} onConfirm={async () => {
        try {
          const res = await api.delete(`/hotels/${removing._id}`);
          toast.info(res.data.deleted ? 'Hotel deleted' : 'The hotel has bookings, so it was deactivated instead of deleted');
          refresh();
        } catch (err) {
          toast.error(err.message);
          throw err;
        }
      }}>
        <p className="mb-0">Hotels with booking history are deactivated (hidden from guests) rather than deleted, so invoices and reports stay intact.</p>
      </ConfirmDialog>
    </>
  );
}

export function AdminStaff() {
  const { hotels } = useHotelScope();
  return (
    <>
      <PageHeader title="Staff assignments" description="Link managers and staff to the hotels they run. Account roles are set under Users & roles." />
      <AssignmentsPanel hotelId={null} hotels={hotels} allowManagers />
    </>
  );
}

export function AdminReviews() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [moderating, setModerating] = useState(null);
  const { data, meta, loading, error, reload } = useApi(() => api.get('/admin/reviews', { params: cleanParams({ status, page }) }), [status, page]);
  return (
    <>
      <PageHeader title="Reviews" description="Hide reviews that break the content rules. Ratings are recalculated from published reviews only." actions={
        <select className="form-select" aria-label="Status" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
          <option value="">All reviews</option><option value="published">Published</option><option value="hidden">Hidden</option>
        </select>
      } />
      <div className="panel">
        {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <SkeletonRows /> : data.length === 0 ? <EmptyState icon={Star} title="No reviews here" /> : (
          <>
            {data.map((r) => (
              <article key={r._id} className="p-3 border-bottom d-flex flex-column flex-md-row gap-3 justify-content-between" style={{ borderColor: 'var(--hp-stone-soft)' }}>
                <div style={{ maxWidth: '70ch' }}>
                  <div className="d-flex gap-2 align-items-center flex-wrap"><Stars value={r.rating} /><strong>{r.title}</strong><StatusBadge kind="review" value={r.status} /></div>
                  <p className="mb-1 mt-1">{r.comment}</p>
                  <div className="small text-muted">{r.guest?.name} ({r.guest?.email}) on {r.hotel?.name}, {date(r.createdAt)}</div>
                  {r.moderationNote && <div className="small text-muted">Moderator note: {r.moderationNote}</div>}
                </div>
                <div><button type="button" className={`btn btn-sm ${r.status === 'published' ? 'btn-outline-danger' : 'btn-quiet'}`} onClick={() => setModerating(r)}>{r.status === 'published' ? 'Hide' : 'Publish again'}</button></div>
              </article>
            ))}
            <Pagination meta={meta} onPage={setPage} />
          </>
        )}
      </div>
      <ConfirmDialog show={Boolean(moderating)} title={moderating?.status === 'published' ? 'Hide this review?' : 'Publish this review again?'} tone={moderating?.status === 'published' ? 'danger' : 'primary'} confirmLabel={moderating?.status === 'published' ? 'Hide review' : 'Publish review'} reasonLabel="Moderator note (shown to the guest)" onClose={() => setModerating(null)} onConfirm={async (note) => {
        try {
          await api.patch(`/admin/reviews/${moderating._id}`, { status: moderating.status === 'published' ? 'hidden' : 'published', moderationNote: note || undefined });
          toast.success('Review updated');
          reload();
        } catch (err) {
          toast.error(err.message);
          throw err;
        }
      }}>
        <p className="mb-0">The hotel’s average rating is recalculated straight away.</p>
      </ConfirmDialog>
    </>
  );
}

export function AuditLogs() {
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const { data, meta, loading, error, reload } = useApi(() => api.get('/admin/audit-logs', { params: cleanParams({ category, q: applied, page }) }), [category, applied, page]);
  return (
    <>
      <PageHeader title="Audit log" description="Security events, administrative changes and key user activity, newest first." />
      <form className="panel panel-pad mb-3 d-flex flex-wrap gap-2 align-items-end" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(q.trim()); }}>
        <div className="flex-grow-1"><label className="form-label" htmlFor="al-q">Search</label><input id="al-q" className="form-control" placeholder="Action or email, e.g. role_change" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div><label className="form-label" htmlFor="al-cat">Category</label><select id="al-cat" className="form-select" value={category} onChange={(e) => { setPage(1); setCategory(e.target.value); }}><option value="">All</option><option value="security">Security</option><option value="admin">Admin</option><option value="activity">Activity</option></select></div>
        <button className="btn btn-primary" type="submit">Search</button>
      </form>
      <div className="panel">
        {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <SkeletonRows /> : data.length === 0 ? <EmptyState icon={ScrollText} title="No entries match" /> : (
          <div className="table-responsive">
            <table className="table table-hover">
              <thead><tr><th scope="col">When</th><th scope="col">Category</th><th scope="col">Action</th><th scope="col">By</th><th scope="col">Target</th><th scope="col">IP</th><th scope="col" /></tr></thead>
              <tbody>
                {data.map((a) => (
                  <tr key={a._id}>
                    <td className="small text-nowrap">{dateTime(a.createdAt)}</td>
                    <td><StatusBadge kind="audit" value={a.category} /></td>
                    <td className="small fw-semibold">{a.action}</td>
                    <td className="small">{a.actorEmail ?? 'System'}{a.actorRole && <div className="text-muted">{ROLE_LABEL[a.actorRole]}</div>}</td>
                    <td className="small">{a.entityType ?? '—'}</td>
                    <td className="small num">{a.ip ?? '—'}</td>
                    <td>{a.details && <button type="button" className="btn btn-sm btn-link" onClick={() => setOpen(a)}>Details</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination meta={meta} onPage={setPage} />
          </div>
        )}
      </div>
      <Modal show={Boolean(open)} onHide={() => setOpen(null)} centered size="lg">
        <Modal.Header closeButton><Modal.Title as="h2" className="h5">{open?.action}</Modal.Title></Modal.Header>
        <Modal.Body><pre className="small mb-0" style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(open?.details, null, 2)}</pre></Modal.Body>
      </Modal>
    </>
  );
}

export function AdminSettings() {
  const { data, loading, error, reload } = useApi(() => api.get('/admin/settings'), []);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  if (data && !f) setF({ ...data });
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !f) return <SkeletonRows rows={8} />;
  const num = (k) => (e) => setF({ ...f, [k]: e.target.value === '' ? '' : Number(e.target.value) });
  const save = async (e) => {
    e.preventDefault();
    const keys = ['taxRatePercent', 'freeCancellationHours', 'lateCancellationRefundPercent', 'maxStayNights', 'bookingWindowDays', 'supportEmail', 'supportPhone', 'announcement'];
    const patch = Object.fromEntries(keys.filter((k) => f[k] !== data[k]).map((k) => [k, f[k]]));
    if (!Object.keys(patch).length) return toast.info('Nothing changed');
    setBusy(true);
    try {
      const res = await api.patch('/admin/settings', patch);
      toast.success('Settings saved. New bookings use them immediately.');
      setF({ ...res.data });
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader title="Platform settings" description="Business rules applied to every hotel. Existing bookings keep the prices and policy they were made with." />
      <form className="panel panel-pad" onSubmit={save} noValidate style={{ maxWidth: 820 }}>
        <h2 className="h4">Pricing</h2>
        <Field id="st-tax" label="GST rate applied to room charges (%)" hint="Check the current GST rules for hotel accommodation before changing this."><input id="st-tax" type="number" min="0" max="40" step="0.5" className="form-control" value={f.taxRatePercent} onChange={num('taxRatePercent')} style={{ maxWidth: 160 }} /></Field>
        <h2 className="h4 mt-4">Cancellation policy</h2>
        <div className="row">
          <div className="col-md-6"><Field id="st-free" label="Free cancellation until (hours before check-in)"><input id="st-free" type="number" min="0" max="720" className="form-control" value={f.freeCancellationHours} onChange={num('freeCancellationHours')} /></Field></div>
          <div className="col-md-6"><Field id="st-late" label="Refund after that, before check-in (%)"><input id="st-late" type="number" min="0" max="100" className="form-control" value={f.lateCancellationRefundPercent} onChange={num('lateCancellationRefundPercent')} /></Field></div>
        </div>
        <h2 className="h4 mt-4">Booking limits</h2>
        <div className="row">
          <div className="col-md-6"><Field id="st-max" label="Longest stay (nights)"><input id="st-max" type="number" min="1" max="90" className="form-control" value={f.maxStayNights} onChange={num('maxStayNights')} /></Field></div>
          <div className="col-md-6"><Field id="st-win" label="Booking window (days ahead)"><input id="st-win" type="number" min="1" max="730" className="form-control" value={f.bookingWindowDays} onChange={num('bookingWindowDays')} /></Field></div>
        </div>
        <h2 className="h4 mt-4">Support & announcements</h2>
        <div className="row">
          <div className="col-md-6"><Field id="st-email" label="Support email"><input id="st-email" type="email" className="form-control" value={f.supportEmail} onChange={(e) => setF({ ...f, supportEmail: e.target.value })} /></Field></div>
          <div className="col-md-6"><Field id="st-phone" label="Support phone"><input id="st-phone" className="form-control" value={f.supportPhone} onChange={(e) => setF({ ...f, supportPhone: e.target.value })} /></Field></div>
        </div>
        <Field id="st-ann" label="Site-wide announcement" hint="Shown in a bar at the top of every page. Leave empty to hide."><input id="st-ann" className="form-control" maxLength={200} value={f.announcement} onChange={(e) => setF({ ...f, announcement: e.target.value })} /></Field>
        <div className="d-flex align-items-center gap-3">
          <button type="submit" className="btn btn-primary" disabled={busy}>Save settings</button>
          {data.updatedAt && <span className="small text-muted"><ShieldCheck size={14} className="me-1" aria-hidden="true" />Last changed {dateTime(data.updatedAt)}</span>}
        </div>
      </form>
    </>
  );
}
