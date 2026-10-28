import { BedDouble, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Offcanvas } from 'react-bootstrap';
import { useSearchParams } from 'react-router';
import api, { cleanParams } from '../../api/client';
import RoomTypeCard from '../../components/booking/RoomTypeCard';
import SearchBar from '../../components/booking/SearchBar';
import { Pagination } from '../../components/ui/Bits';
import { Skeleton } from '../../components/ui/Feedback';
import { EmptyState, ErrorState, InlineAlert } from '../../components/ui/Feedback';
import useApi from '../../hooks/useApi';
import { date, plural } from '../../utils/format';
import './public.css';

const KEYS = ['location', 'hotel', 'checkIn', 'checkOut', 'guests', 'minPrice', 'maxPrice', 'category', 'amenities', 'onlyAvailable', 'sort', 'page'];

function Filters({ params, facets, onChange }) {
  const [price, setPrice] = useState({ min: params.minPrice ?? '', max: params.maxPrice ?? '' });
  const [category, setCategory] = useState(params.category ?? '');
  const selected = new Set((params.amenities ?? '').split(',').filter(Boolean));
  const toggleAmenity = (a) => {
    const next = new Set(selected);
    if (next.has(a)) next.delete(a);
    else next.add(a);
    onChange({ amenities: [...next].join(',') });
  };
  return (
    <div className="filter-panel d-grid gap-4">
      <div>
        <label className="form-label" htmlFor="f-sort">
          Sort by
        </label>
        <select id="f-sort" className="form-select" value={params.sort ?? 'recommended'} onChange={(e) => onChange({ sort: e.target.value })}>
          <option value="recommended">Recommended</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
          <option value="rating">Guest rating</option>
          <option value="capacity">Most space</option>
        </select>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onChange({ minPrice: price.min, maxPrice: price.max, category: category.trim() });
        }}
      >
        <fieldset>
          <legend className="form-label">Nightly price (₹)</legend>
          <div className="d-flex gap-2">
            <input className="form-control" type="number" min="0" step="500" placeholder="Min" aria-label="Minimum nightly price" value={price.min} onChange={(e) => setPrice((p) => ({ ...p, min: e.target.value }))} />
            <input className="form-control" type="number" min="0" step="500" placeholder="Max" aria-label="Maximum nightly price" value={price.max} onChange={(e) => setPrice((p) => ({ ...p, max: e.target.value }))} />
          </div>
        </fieldset>
        <label className="form-label mt-3" htmlFor="f-cat">
          Room type
        </label>
        <input id="f-cat" className="form-control" placeholder="e.g. suite, villa, twin" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={60} />
        <button type="submit" className="btn btn-quiet btn-sm mt-2">
          Apply
        </button>
      </form>
      {params.checkIn && (
        <div className="form-check form-switch">
          <input className="form-check-input" type="checkbox" role="switch" id="f-avail" checked={params.onlyAvailable !== 'false'} onChange={(e) => onChange({ onlyAvailable: e.target.checked ? '' : 'false' })} />
          <label className="form-check-label" htmlFor="f-avail">
            Only show available rooms
          </label>
        </div>
      )}
      {facets?.amenities?.length > 0 && (
        <fieldset>
          <legend className="form-label">Amenities</legend>
          {facets.amenities.map((a) => (
            <div className="form-check" key={a}>
              <input className="form-check-input" type="checkbox" id={`am-${a}`} checked={selected.has(a)} onChange={() => toggleAmenity(a)} />
              <label className="form-check-label" htmlFor={`am-${a}`}>
                {a}
              </label>
            </div>
          ))}
        </fieldset>
      )}
    </div>
  );
}

export default function Rooms() {
  const [sp, setSp] = useSearchParams();
  const params = Object.fromEntries(KEYS.map((k) => [k, sp.get(k) ?? undefined]));
  const key = sp.toString();
  const [showFilters, setShowFilters] = useState(false);
  const { data, meta, loading, error, reload } = useApi(() => api.get('/search', { params: cleanParams({ ...params, limit: 10 }) }), [key]);

  const update = (patch) => setSp(cleanParams({ ...params, page: undefined, ...patch }));
  const stay = meta?.stay;
  const filters = <Filters key={key} params={params} facets={meta?.facets} onChange={update} />;

  return (
    <>
      <section className="page-band">
        <div className="container pt-5 pb-5">
          <h1 className="mb-1">{params.location ? `Rooms in ${params.location}` : 'Find a room'}</h1>
          <p className="mb-0">{stay ? `${date(stay.checkIn, { year: undefined })} to ${date(stay.checkOut)}, ${plural(stay.nights, 'night')}, ${plural(Number(stay.guests), 'guest')}` : 'Add your dates to see live availability and the exact price of your stay.'}</p>
        </div>
      </section>
      <div className="container planner-dock" style={{ marginTop: '-2rem' }}>
        <SearchBar key={key} variant="inline" initial={params} onSearch={(p) => setSp(cleanParams({ ...p, hotel: params.hotel, sort: params.sort }))} />
      </div>
      <div className="container py-4">
        <div className="row g-4">
          <aside className="col-lg-3 d-none d-lg-block" aria-label="Filters">
            <div className="panel panel-pad sticky-aside">{filters}</div>
          </aside>
          <div className="col-lg-9">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <p className="mb-0 text-muted" aria-live="polite">
                {loading ? 'Searching…' : meta ? `${plural(meta.total, 'room type')} found` : ''}
              </p>
              <button type="button" className="btn btn-quiet btn-sm d-lg-none" onClick={() => setShowFilters(true)}>
                <SlidersHorizontal size={16} className="me-1" aria-hidden="true" /> Filters
              </button>
            </div>
            {params.hotel && (
              <InlineAlert className="mb-3">
                Showing one hotel only.{' '}
                <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => update({ hotel: undefined })}>
                  Show all hotels
                </button>
              </InlineAlert>
            )}
            {error ? (
              <ErrorState error={error} onRetry={reload} title="Search could not be completed" />
            ) : loading ? (
              <div className="d-grid gap-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} height={240} />
                ))}
              </div>
            ) : data.length === 0 ? (
              <div className="panel">
                <EmptyState icon={BedDouble} title="No rooms match" action={<button className="btn btn-quiet" onClick={() => setSp({})}>Clear all filters</button>}>
                  {stay ? 'Everything that fits is booked for these dates. Try nearby dates, fewer filters or another city.' : 'Try a different city, a wider price range or fewer amenities.'}
                </EmptyState>
              </div>
            ) : (
              <div className="d-grid gap-3">
                {data.map((item) => (
                  <RoomTypeCard key={item.roomType._id} item={item} stay={stay} />
                ))}
                <Pagination meta={meta} onPage={(p) => setSp(cleanParams({ ...params, page: p }))} />
              </div>
            )}
          </div>
        </div>
      </div>
      <Offcanvas show={showFilters} onHide={() => setShowFilters(false)} placement="end">
        <Offcanvas.Header closeButton>
          <Offcanvas.Title as="h2" className="h4">
            Filters
          </Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body>{filters}</Offcanvas.Body>
      </Offcanvas>
    </>
  );
}
