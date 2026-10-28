import { Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useConfig } from '../../context/ConfigContext';
import { addDaysIso, isoDate } from '../../utils/format';
import { validateStay } from '../../utils/validation';

/**
 * Stay planner: where, when, how many. Dates are optional for browsing but
 * required for prices and live availability.
 */
export default function SearchBar({ initial = {}, variant = 'float', onSearch, hideWhere = false }) {
  const navigate = useNavigate();
  const { config } = useConfig();
  const today = config?.today ?? isoDate(new Date());
  const [form, setForm] = useState({
    location: initial.location ?? '',
    checkIn: initial.checkIn ?? '',
    checkOut: initial.checkOut ?? '',
    guests: initial.guests ?? 2,
  });
  const [errors, setErrors] = useState({});

  const set = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === 'checkIn' && v && (!f.checkOut || f.checkOut <= v)) next.checkOut = addDaysIso(v, 1);
      return next;
    });
  };

  const submit = (e) => {
    e.preventDefault();
    const errs = validateStay(form, today);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const params = new URLSearchParams();
    if (form.location.trim()) params.set('location', form.location.trim());
    if (form.checkIn) params.set('checkIn', form.checkIn);
    if (form.checkOut) params.set('checkOut', form.checkOut);
    params.set('guests', String(form.guests));
    if (onSearch) onSearch(Object.fromEntries(params));
    else navigate(`/rooms?${params}`);
  };

  return (
    <form className={`stay-planner stay-planner-${variant}`} onSubmit={submit} noValidate aria-label="Search rooms">
      <div className={`sp-field sp-where ${hideWhere ? 'd-none' : ''}`}>
        <label htmlFor="sp-location">Where</label>
        <input id="sp-location" className="form-control" placeholder="City or hotel" value={form.location} onChange={set('location')} maxLength={100} autoComplete="off" />
      </div>
      <div className="sp-field">
        <label htmlFor="sp-in">Check-in</label>
        <input id="sp-in" type="date" className={`form-control ${errors.checkIn ? 'is-invalid' : ''}`} min={today} value={form.checkIn} onChange={set('checkIn')} aria-describedby={errors.checkIn ? 'sp-in-err' : undefined} />
        {errors.checkIn && <div id="sp-in-err" className="invalid-feedback d-block">{errors.checkIn}</div>}
      </div>
      <div className="sp-field">
        <label htmlFor="sp-out">Check-out</label>
        <input id="sp-out" type="date" className={`form-control ${errors.checkOut ? 'is-invalid' : ''}`} min={form.checkIn ? addDaysIso(form.checkIn, 1) : addDaysIso(today, 1)} value={form.checkOut} onChange={set('checkOut')} aria-describedby={errors.checkOut ? 'sp-out-err' : undefined} />
        {errors.checkOut && <div id="sp-out-err" className="invalid-feedback d-block">{errors.checkOut}</div>}
      </div>
      <div className="sp-field sp-guests">
        <label htmlFor="sp-guests">Guests</label>
        <select id="sp-guests" className="form-select" value={form.guests} onChange={set('guests')}>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? 'guest' : 'guests'}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn btn-brass sp-submit">
        <Search size={18} className="me-2" aria-hidden="true" />
        Search rooms
      </button>
    </form>
  );
}
