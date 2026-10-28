import { Compass } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'react-toastify';
import api, { ApiError } from '../../api/client';
import { Field } from '../../components/ui/Bits';
import { InlineAlert } from '../../components/ui/Feedback';
import { useAuth } from '../../context/AuthContext';
import { useConfig } from '../../context/ConfigContext';
import { emailError, nameError } from '../../utils/validation';
import './public.css';

export function About() {
  const { config } = useConfig();
  return (
    <>
      <section className="page-band">
        <div className="container py-5">
          <h1 className="mb-2">About HotelPro</h1>
          <p className="mb-0 measure">One booking and operations platform for a small group of independent hotels.</p>
        </div>
      </section>
      <div className="container py-5">
        <div className="row g-4 gx-lg-5">
          <div className="col-lg-7 measure">
            <h2 className="h3">For guests</h2>
            <p>Search across our hotels, see the exact price of your stay before you commit, and pay securely. Your bookings, invoices and requests to the hotel stay together in your account.</p>
            <h2 className="h3 mt-4">For hotel teams</h2>
            <p>Front desk staff see today’s arrivals and departures, check guests in and out, and keep housekeeping and guest requests moving. Managers set rates and seasons, manage rooms and staff, and follow occupancy and revenue. Administrators look after accounts, payments, reviews and platform settings.</p>
            <h2 className="h3 mt-4">How we handle your data</h2>
            <p>Passwords are stored only as salted hashes. Card details go straight to our payment provider and never touch our servers. Sign-in uses a secure, http-only cookie.</p>
          </div>
          <aside className="col-lg-5">
            <div className="panel panel-pad">
              <h2 className="h4">Policies at a glance</h2>
              <p className="small text-muted">{config?.cancellationPolicy}</p>
              <p className="small text-muted mb-0">Room rates are shown per night. Taxes ({config?.taxRatePercent ?? '—'}% GST) are added to every booking and shown before payment.</p>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

export function Contact() {
  const { user } = useAuth();
  const { config } = useConfig();
  const [form, setForm] = useState({ name: user?.name ?? '', email: user?.email ?? '', subject: '', message: '' });
  const [errors, setErrors] = useState({});
  const [state, setState] = useState('idle');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    const errs = {
      name: nameError(form.name),
      email: emailError(form.email),
      subject: form.subject.trim().length < 3 ? 'Add a short subject' : undefined,
      message: form.message.trim().length < 10 ? 'Write at least 10 characters' : undefined,
    };
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setState('sending');
    try {
      await api.post('/contact', form);
      setState('sent');
      toast.success('Message sent');
    } catch (err) {
      setState('idle');
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      toast.error(err.message);
    }
  };
  return (
    <>
      <section className="page-band">
        <div className="container py-5">
          <h1 className="mb-2">Contact us</h1>
          <p className="mb-0 measure">Questions about a booking, a group stay or the platform? Our team reads every message.</p>
        </div>
      </section>
      <div className="container py-5">
        <div className="row g-4 gx-lg-5">
          <div className="col-lg-7">
            {state === 'sent' ? (
              <div className="panel panel-pad">
                <h2 className="h3">Thanks, your message is with us</h2>
                <p className="text-muted mb-3">We reply within one working day to {form.email}.</p>
                <Link to="/" className="btn btn-quiet">
                  Back to homepage
                </Link>
              </div>
            ) : (
              <form className="panel panel-pad" onSubmit={submit} noValidate>
                <div className="row">
                  <div className="col-md-6">
                    <Field id="c-name" label="Your name" error={errors.name}>
                      <input id="c-name" className={`form-control ${errors.name ? 'is-invalid' : ''}`} value={form.name} onChange={set('name')} autoComplete="name" />
                    </Field>
                  </div>
                  <div className="col-md-6">
                    <Field id="c-email" label="Email" error={errors.email}>
                      <input id="c-email" type="email" className={`form-control ${errors.email ? 'is-invalid' : ''}`} value={form.email} onChange={set('email')} autoComplete="email" />
                    </Field>
                  </div>
                </div>
                <Field id="c-subject" label="Subject" error={errors.subject}>
                  <input id="c-subject" className={`form-control ${errors.subject ? 'is-invalid' : ''}`} value={form.subject} onChange={set('subject')} maxLength={120} />
                </Field>
                <Field id="c-message" label="Message" error={errors.message}>
                  <textarea id="c-message" rows={6} className={`form-control ${errors.message ? 'is-invalid' : ''}`} value={form.message} onChange={set('message')} maxLength={2000} />
                </Field>
                <button className="btn btn-primary" type="submit" disabled={state === 'sending'}>
                  {state === 'sending' && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
                  Send message
                </button>
              </form>
            )}
          </div>
          <aside className="col-lg-5">
            <div className="panel panel-pad">
              <h2 className="h4">Other ways to reach us</h2>
              <p className="mb-1">
                Email: <a href={`mailto:${config?.supportEmail}`}>{config?.supportEmail}</a>
              </p>
              <p className="mb-3">Phone: {config?.supportPhone}</p>
              <InlineAlert>For changes to an existing stay, open the booking in your account — cancellations and requests to the hotel are handled there instantly.</InlineAlert>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

export function NotFound() {
  return (
    <div className="container py-5 text-center">
      <Compass size={40} strokeWidth={1.3} className="text-brass mb-3" aria-hidden="true" />
      <h1 className="mb-2">We could not find that page</h1>
      <p className="text-muted mb-4">The link may be old, or the page may have moved.</p>
      <div className="d-flex justify-content-center gap-2">
        <Link to="/" className="btn btn-primary">
          Go to homepage
        </Link>
        <Link to="/rooms" className="btn btn-quiet">
          Search rooms
        </Link>
      </div>
    </div>
  );
}
