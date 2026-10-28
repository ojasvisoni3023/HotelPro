import { Building2 } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import api, { cleanParams } from '../../api/client';
import HotelCard from '../../components/booking/HotelCard';
import { Pagination } from '../../components/ui/Bits';
import { Skeleton } from '../../components/ui/Feedback';
import { EmptyState, ErrorState } from '../../components/ui/Feedback';
import useApi from '../../hooks/useApi';
import './public.css';

export default function Hotels() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const sort = params.get('sort') ?? 'rating';
  const page = Number(params.get('page') ?? 1);
  const [text, setText] = useState(q);
  const { data, meta, loading, error, reload } = useApi(() => api.get('/hotels', { params: cleanParams({ q, sort, page, limit: 12 }) }), [q, sort, page]);

  const update = (next) => setParams(cleanParams({ q, sort, page: 1, ...next }));

  return (
    <>
      <section className="page-band">
        <div className="container py-5">
          <h1 className="mb-2">Our hotels</h1>
          <p className="mb-0 measure">Each property is independently run with its own rooms, rates and team. Choose one to see its room types and reviews.</p>
        </div>
      </section>
      <div className="container py-4">
        <form
          className="d-flex flex-wrap gap-2 align-items-end mb-4"
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: text.trim() });
          }}
        >
          <div className="flex-grow-1" style={{ minWidth: 220 }}>
            <label htmlFor="hotel-q" className="form-label">
              Search hotels
            </label>
            <input id="hotel-q" className="form-control" placeholder="Name, city or state" value={text} onChange={(e) => setText(e.target.value)} maxLength={100} />
          </div>
          <div>
            <label htmlFor="hotel-sort" className="form-label">
              Sort by
            </label>
            <select id="hotel-sort" className="form-select" value={sort} onChange={(e) => update({ sort: e.target.value })}>
              <option value="rating">Guest rating</option>
              <option value="price_asc">Lowest price</option>
              <option value="price_desc">Highest price</option>
              <option value="name">Name</option>
            </select>
          </div>
          <button className="btn btn-primary" type="submit">
            Search
          </button>
        </form>

        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading ? (
          <div className="row g-4">
            {[0, 1, 2, 3].map((i) => (
              <div className="col-sm-6 col-lg-3" key={i}>
                <Skeleton height={330} />
              </div>
            ))}
          </div>
        ) : data.length === 0 ? (
          <EmptyState icon={Building2} title="No hotels match that search" action={<button className="btn btn-quiet" onClick={() => { setText(''); update({ q: '' }); }}>Clear search</button>}>
            Try a city such as Goa or Udaipur, or clear the search to see every hotel.
          </EmptyState>
        ) : (
          <>
            <div className="row g-4">
              {data.map((h) => (
                <div className="col-sm-6 col-lg-3" key={h._id}>
                  <HotelCard hotel={h} />
                </div>
              ))}
            </div>
            <Pagination meta={meta} onPage={(p) => setParams(cleanParams({ q, sort, page: p }))} />
          </>
        )}
      </div>
    </>
  );
}
