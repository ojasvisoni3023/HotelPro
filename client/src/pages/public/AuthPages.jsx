import { Eye, EyeOff, MailCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'react-toastify';
import api, { ApiError } from '../../api/client';
import { Field } from '../../components/ui/Bits';
import { InlineAlert, Spinner } from '../../components/ui/Feedback';
import { HOME_FOR_ROLE, useAuth } from '../../context/AuthContext';
import { emailError, nameError, passwordError, phoneError } from '../../utils/validation';
import './public.css';

const ART = 'https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?auto=format&fit=crop&w=1400&q=70';

function AuthShell({ caption, children }) {
  return (
    <div className="auth-shell">
      <div className="auth-art" aria-hidden="true">
        <img src={ART} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
        <div className="auth-art-caption">{caption}</div>
      </div>
      <div className="auth-form">
        <div>{children}</div>
      </div>
    </div>
  );
}

function PasswordInput({ id, value, onChange, invalid, autoComplete, describedBy }) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-group">
      <input id={id} type={show ? 'text' : 'password'} className={`form-control ${invalid ? 'is-invalid' : ''}`} value={value} onChange={onChange} autoComplete={autoComplete} aria-describedby={describedBy} />
      <button type="button" className="btn btn-quiet" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

/** Only allow in-app redirects after login (prevents open-redirects). */
function safeNext(next) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
}

export function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const next = safeNext(sp.get('next'));
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  if (user && !busy) return <Navigate to={next ?? HOME_FOR_ROLE[user.role]} replace />;

  const submit = async (e) => {
    e.preventDefault();
    const errs = { email: emailError(form.email), password: form.password ? undefined : 'Enter your password' };
    setErrors(errs);
    setFormError('');
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    try {
      const u = await login(form.email.trim(), form.password);
      toast.success(`Welcome back, ${u.name.split(' ')[0]}`);
      navigate(next ?? HOME_FOR_ROLE[u.role], { replace: true });
    } catch (err) {
      setFormError(err.message);
      setBusy(false);
    }
  };

  return (
    <AuthShell caption="Your stays, invoices and requests in one place.">
      <h1 className="h2 mb-1">Sign in</h1>
      <p className="text-muted mb-4">
        New to HotelPro? <Link to={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Create an account</Link>
      </p>
      {formError && (
        <InlineAlert tone="bad" className="mb-3">
          {formError}
        </InlineAlert>
      )}
      <form onSubmit={submit} noValidate>
        <Field id="login-email" label="Email" error={errors.email}>
          <input id="login-email" type="email" className={`form-control ${errors.email ? 'is-invalid' : ''}`} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" autoFocus />
        </Field>
        <Field id="login-password" label="Password" error={errors.password}>
          <PasswordInput id="login-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} invalid={!!errors.password} autoComplete="current-password" />
        </Field>
        <div className="d-flex justify-content-end mb-3">
          <Link to="/forgot-password" className="small">
            Forgot your password?
          </Link>
        </div>
        <button type="submit" className="btn btn-primary w-100" disabled={busy}>
          {busy && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
          Sign in
        </button>
      </form>
    </AuthShell>
  );
}

export function Register() {
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const next = safeNext(sp.get('next'));
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  if (user && !busy) return <Navigate to={next ?? HOME_FOR_ROLE[user.role]} replace />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    const errs = { name: nameError(form.name), email: emailError(form.email), phone: phoneError(form.phone), password: passwordError(form.password) };
    setErrors(errs);
    setFormError('');
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    try {
      const res = await register({ name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() || undefined, password: form.password });
      toast.success(res.verificationEmailDelivered ? 'Account created. Check your inbox to verify your email.' : 'Account created. Verify your email to start booking.');
      navigate(next ?? '/account', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      setFormError(err.message);
      setBusy(false);
    }
  };

  return (
    <AuthShell caption="Create an account to book, pay and manage your stays.">
      <h1 className="h2 mb-1">Create your account</h1>
      <p className="text-muted mb-4">
        Already have one? <Link to={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Sign in</Link>
      </p>
      {formError && (
        <InlineAlert tone="bad" className="mb-3">
          {formError}
        </InlineAlert>
      )}
      <form onSubmit={submit} noValidate>
        <Field id="reg-name" label="Full name" error={errors.name}>
          <input id="reg-name" className={`form-control ${errors.name ? 'is-invalid' : ''}`} value={form.name} onChange={set('name')} autoComplete="name" />
        </Field>
        <Field id="reg-email" label="Email" error={errors.email} hint="We send a link to confirm this address.">
          <input id="reg-email" type="email" className={`form-control ${errors.email ? 'is-invalid' : ''}`} value={form.email} onChange={set('email')} autoComplete="email" />
        </Field>
        <Field id="reg-phone" label="Phone (optional)" error={errors.phone}>
          <input id="reg-phone" type="tel" className={`form-control ${errors.phone ? 'is-invalid' : ''}`} value={form.phone} onChange={set('phone')} autoComplete="tel" />
        </Field>
        <Field id="reg-password" label="Password" error={errors.password} hint="At least 8 characters, with a letter and a number.">
          <PasswordInput id="reg-password" value={form.password} onChange={set('password')} invalid={!!errors.password} autoComplete="new-password" />
        </Field>
        <button type="submit" className="btn btn-primary w-100" disabled={busy}>
          {busy && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
          Create account
        </button>
      </form>
    </AuthShell>
  );
}

export function VerifyEmail() {
  const [sp] = useSearchParams();
  const token = sp.get('token');
  const { refresh } = useAuth();
  const [state, setState] = useState(token ? 'working' : 'missing');
  const [message, setMessage] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true; // tokens are single-use; avoid a double call in StrictMode
    api
      .post('/auth/verify-email', { token })
      .then(() => {
        setState('done');
        refresh();
      })
      .catch((err) => {
        setState('failed');
        setMessage(err.message);
      });
  }, [token, refresh]);

  return (
    <div className="container py-5" style={{ maxWidth: 560 }}>
      <div className="panel panel-pad text-center">
        <MailCheck size={36} strokeWidth={1.4} className="text-brass mb-3" aria-hidden="true" />
        {state === 'working' && <Spinner label="Confirming your email" />}
        {state === 'done' && (
          <>
            <h1 className="h2">Email confirmed</h1>
            <p className="text-muted">You can now book rooms with your account.</p>
            <Link to="/rooms" className="btn btn-primary">
              Find a room
            </Link>
          </>
        )}
        {state === 'failed' && (
          <>
            <h1 className="h2">That link did not work</h1>
            <p className="text-muted">{message} Sign in and request a new link from your account.</p>
            <Link to="/account" className="btn btn-primary">
              Go to my account
            </Link>
          </>
        )}
        {state === 'missing' && (
          <>
            <h1 className="h2">Verification link missing</h1>
            <p className="text-muted">Open the link from your email, or request a new one from your account.</p>
          </>
        )}
      </div>
    </div>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const err = emailError(email);
    setError(err);
    if (err) return;
    setBusy(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setSent(true);
    } catch (e2) {
      toast.error(e2.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="container py-5" style={{ maxWidth: 520 }}>
      <div className="panel panel-pad">
        <h1 className="h2">Reset your password</h1>
        {sent ? (
          <p className="text-muted mb-0">If an account exists for {email}, we have sent a link to reset the password. It expires in 30 minutes.</p>
        ) : (
          <form onSubmit={submit} noValidate>
            <p className="text-muted">Enter the email you signed up with and we will send you a reset link.</p>
            <Field id="fp-email" label="Email" error={error}>
              <input id="fp-email" type="email" className={`form-control ${error ? 'is-invalid' : ''}`} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </Field>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              Send reset link
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export function ResetPassword() {
  const [sp] = useSearchParams();
  const token = sp.get('token');
  const navigate = useNavigate();
  const [pw, setPw] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const errs = { password: passwordError(pw.password), confirm: pw.password !== pw.confirm ? 'Passwords do not match' : undefined };
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, password: pw.password });
      toast.success('Password updated. Please sign in.');
      navigate('/login', { replace: true });
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };
  if (!token) {
    return (
      <div className="container py-5" style={{ maxWidth: 520 }}>
        <div className="panel panel-pad">
          <h1 className="h2">Reset link missing</h1>
          <p className="text-muted">Open the link from your email, or <Link to="/forgot-password">request a new one</Link>.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="container py-5" style={{ maxWidth: 520 }}>
      <form className="panel panel-pad" onSubmit={submit} noValidate>
        <h1 className="h2">Choose a new password</h1>
        <p className="text-muted">This signs you out everywhere else.</p>
        <Field id="rp-pw" label="New password" error={errors.password} hint="At least 8 characters, with a letter and a number.">
          <PasswordInput id="rp-pw" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} invalid={!!errors.password} autoComplete="new-password" />
        </Field>
        <Field id="rp-confirm" label="Repeat new password" error={errors.confirm}>
          <PasswordInput id="rp-confirm" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} invalid={!!errors.confirm} autoComplete="new-password" />
        </Field>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          Update password
        </button>
      </form>
    </div>
  );
}
