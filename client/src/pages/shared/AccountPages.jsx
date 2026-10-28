import { Bell, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'react-toastify';
import api, { ApiError } from '../../api/client';
import { Field, PageHeader, Pagination } from '../../components/ui/Bits';
import { EmptyState, ErrorState, SkeletonRows } from '../../components/ui/Feedback';
import { useAuth } from '../../context/AuthContext';
import useApi from '../../hooks/useApi';
import { relative } from '../../utils/format';
import { ROLE_LABEL } from '../../utils/status';
import { nameError, passwordError, phoneError } from '../../utils/validation';

export function Notifications() {
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, meta, loading, error, reload, setData } = useApi(() => api.get('/notifications', { params: { page, unread: unreadOnly ? 'true' : undefined } }), [page, unreadOnly]);
  const announce = () => window.dispatchEvent(new CustomEvent('hp:notifications'));
  const markOne = async (n) => {
    if (n.read) return;
    try {
      await api.patch(`/notifications/${n._id}/read`);
      setData((list) => list.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
      announce();
    } catch (err) {
      toast.error(err.message);
    }
  };
  const markAll = async () => {
    try {
      await api.post('/notifications/read-all');
      reload();
      announce();
    } catch (err) {
      toast.error(err.message);
    }
  };
  return (
    <>
      <PageHeader
        title="Notifications"
        description="Updates about bookings, payments, requests and your account."
        actions={
          <>
            <div className="form-check form-switch align-self-center me-2">
              <input id="unread-only" className="form-check-input" type="checkbox" role="switch" checked={unreadOnly} onChange={(e) => { setUnreadOnly(e.target.checked); setPage(1); }} />
              <label htmlFor="unread-only" className="form-check-label small">Unread only</label>
            </div>
            <button type="button" className="btn btn-quiet btn-sm" onClick={markAll} disabled={!meta?.unread}>
              <CheckCheck size={16} className="me-1" aria-hidden="true" />Mark all as read
            </button>
          </>
        }
      />
      <div className="panel">
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading ? (
          <SkeletonRows />
        ) : data.length === 0 ? (
          <EmptyState icon={Bell} title={unreadOnly ? 'No unread notifications' : 'No notifications yet'}>Booking, payment and request updates will appear here.</EmptyState>
        ) : (
          <>
            <ul className="list-unstyled mb-0">
              {data.map((n) => (
                <li key={n._id} className="d-flex gap-3 p-3 border-bottom" style={{ borderColor: 'var(--hp-stone-soft)', background: n.read ? 'transparent' : '#fbf7ee' }}>
                  <span aria-hidden="true" className="mt-2 rounded-circle flex-shrink-0" style={{ width: 8, height: 8, background: n.read ? 'transparent' : 'var(--hp-brass)' }} />
                  <div className="flex-grow-1">
                    <div className="d-flex justify-content-between gap-2">
                      <span className="fw-semibold">{n.title}</span>
                      <span className="small text-muted text-nowrap">{relative(n.createdAt)}</span>
                    </div>
                    <p className="mb-1 small">{n.message}</p>
                    <div className="d-flex gap-3 small">
                      {n.link && <Link to={n.link} onClick={() => markOne(n)}>Open</Link>}
                      {!n.read && <button type="button" className="btn btn-link btn-sm p-0" onClick={() => markOne(n)}>Mark as read</button>}
                      {!n.read && <span className="visually-hidden">Unread</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination meta={meta} onPage={setPage} />
          </>
        )}
      </div>
    </>
  );
}

export function Profile() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({ name: user.name, phone: user.phone ?? '', address: { line1: user.address?.line1 ?? '', city: user.address?.city ?? '', state: user.address?.state ?? '', country: user.address?.country ?? '', postalCode: user.address?.postalCode ?? '' } });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [pwErrors, setPwErrors] = useState({});

  const save = async (e) => {
    e.preventDefault();
    const errs = { name: nameError(form.name), phone: phoneError(form.phone) };
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    try {
      const res = await api.patch('/auth/profile', { name: form.name.trim(), phone: form.phone.trim(), address: form.address });
      setUser(res.data.user);
      toast.success('Profile saved');
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const changePw = async (e) => {
    e.preventDefault();
    const errs = { currentPassword: pw.currentPassword ? undefined : 'Enter your current password', newPassword: passwordError(pw.newPassword) };
    setPwErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    try {
      await api.post('/auth/change-password', pw);
      setPw({ currentPassword: '', newPassword: '' });
      toast.success('Password changed. Other devices have been signed out.');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const addr = (k) => (e) => setForm({ ...form, address: { ...form.address, [k]: e.target.value } });
  return (
    <>
      <PageHeader title="Profile" description={`${ROLE_LABEL[user.role]} account, ${user.email}`} />
      <div className="row g-4">
        <div className="col-lg-7">
          <form className="panel panel-pad" onSubmit={save} noValidate>
            <h2 className="h4 mb-3">Personal details</h2>
            <div className="row">
              <div className="col-md-6">
                <Field id="pf-name" label="Full name" error={errors.name}>
                  <input id="pf-name" className={`form-control ${errors.name ? 'is-invalid' : ''}`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
                </Field>
              </div>
              <div className="col-md-6">
                <Field id="pf-phone" label="Phone" error={errors.phone}>
                  <input id="pf-phone" type="tel" className={`form-control ${errors.phone ? 'is-invalid' : ''}`} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" />
                </Field>
              </div>
            </div>
            <Field id="pf-email" label="Email" hint={user.emailVerified ? 'Verified. Contact support to change your email.' : 'Not verified yet.'}>
              <input id="pf-email" className="form-control" value={user.email} disabled />
            </Field>
            <h3 className="h5 mt-2">Address</h3>
            <Field id="pf-line1" label="Street address">
              <input id="pf-line1" className="form-control" value={form.address.line1} onChange={addr('line1')} autoComplete="street-address" />
            </Field>
            <div className="row">
              <div className="col-md-6"><Field id="pf-city" label="City"><input id="pf-city" className="form-control" value={form.address.city} onChange={addr('city')} autoComplete="address-level2" /></Field></div>
              <div className="col-md-6"><Field id="pf-state" label="State"><input id="pf-state" className="form-control" value={form.address.state} onChange={addr('state')} autoComplete="address-level1" /></Field></div>
              <div className="col-md-6"><Field id="pf-country" label="Country"><input id="pf-country" className="form-control" value={form.address.country} onChange={addr('country')} autoComplete="country-name" /></Field></div>
              <div className="col-md-6"><Field id="pf-pin" label="Postal code"><input id="pf-pin" className="form-control" value={form.address.postalCode} onChange={addr('postalCode')} autoComplete="postal-code" /></Field></div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy}>Save profile</button>
          </form>
        </div>
        <div className="col-lg-5">
          <form className="panel panel-pad" onSubmit={changePw} noValidate>
            <h2 className="h4 mb-3">Change password</h2>
            <Field id="pw-current" label="Current password" error={pwErrors.currentPassword}>
              <input id="pw-current" type="password" className={`form-control ${pwErrors.currentPassword ? 'is-invalid' : ''}`} value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} autoComplete="current-password" />
            </Field>
            <Field id="pw-new" label="New password" error={pwErrors.newPassword} hint="At least 8 characters, with a letter and a number.">
              <input id="pw-new" type="password" className={`form-control ${pwErrors.newPassword ? 'is-invalid' : ''}`} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} autoComplete="new-password" />
            </Field>
            <button className="btn btn-quiet" type="submit">Update password</button>
          </form>
        </div>
      </div>
    </>
  );
}
