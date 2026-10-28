import { Link } from 'react-router';
import api from '../../api/client';
import HotelCard from '../../components/booking/HotelCard';
import SearchBar from '../../components/booking/SearchBar';
import { Skeleton } from '../../components/ui/Feedback';
import { ErrorState } from '../../components/ui/Feedback';
import { useConfig } from '../../context/ConfigContext';
import useApi from '../../hooks/useApi';
import './public.css';

const HERO = 'https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=2200&q=70';

const STEPS = [
  ['Pick your dates', 'Search by city or hotel. Every price you see is calculated live for your exact nights, taxes included.'],
  ['Hold the room, then pay', 'Choosing a room holds it for you for 15 minutes while you pay securely. Nobody else can take it in that time.'],
  ['Arrive and settle in', 'Your confirmation, invoice and any requests to the hotel live in your account, from booking to check-out.'],
];

export default function Home() {
  const { config } = useConfig();
  const hotels = useApi(() => api.get('/hotels', { params: { sort: 'rating', limit: 8 } }), []);

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <img className="hero-img" src={HERO} alt="" aria-hidden="true" onError={(e) => (e.currentTarget.style.display = 'none')} />
        <div className="hero-shade" aria-hidden="true" />
        <div className="container hero-inner">
          <div className="row g-4 gx-lg-5 align-items-end">
            <div className="col-lg-6">
              <h1 id="hero-title" className="hero-title">
                Four hotels, four very different Indias.
              </h1>
              <p className="hero-lead">A lakeside haveli, a barefoot beach resort, a cedar retreat in the hills and a harbour hotel in the city. Live rates and instant confirmation for each.</p>
            </div>
            <div className="col-lg-6">
              <nav aria-label="Destinations">
                <ul className="destinations">
                  {(hotels.data ?? []).map((h) => (
                    <li key={h._id}>
                      <Link to={`/rooms?location=${encodeURIComponent(h.address.city)}`}>
                        <span className="dest-city">{h.address.city}</span>
                        <span className="dest-hotel">{h.name}</span>
                      </Link>
                    </li>
                  ))}
                  {hotels.loading && [0, 1, 2, 3].map((i) => <li key={i} className="dest-placeholder" aria-hidden="true" />)}
                </ul>
              </nav>
            </div>
          </div>
        </div>
      </section>

      <div className="container planner-dock">
        <SearchBar />
      </div>

      <section className="container py-5 mt-3" aria-labelledby="hotels-title">
        <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
          <div>
            <h2 id="hotels-title" className="mb-1">
              Where you could be staying
            </h2>
            <p className="text-muted mb-0">Rated by guests who checked out — reviews are only accepted after a completed stay.</p>
          </div>
          <Link to="/hotels" className="btn btn-quiet">
            See all hotels
          </Link>
        </div>
        {hotels.error ? (
          <ErrorState error={hotels.error} onRetry={hotels.reload} />
        ) : (
          <div className="row g-4">
            {hotels.loading
              ? [0, 1, 2, 3].map((i) => (
                  <div className="col-sm-6 col-lg-3" key={i}>
                    <Skeleton height={330} />
                  </div>
                ))
              : hotels.data.map((h) => (
                  <div className="col-sm-6 col-lg-3" key={h._id}>
                    <HotelCard hotel={h} />
                  </div>
                ))}
          </div>
        )}
      </section>

      <section className="steps-band" aria-labelledby="steps-title">
        <div className="container py-5">
          <h2 id="steps-title" className="mb-4">
            How booking works
          </h2>
          <ol className="steps">
            {STEPS.map(([title, text]) => (
              <li key={title}>
                <h3 className="h4">{title}</h3>
                <p className="mb-0">{text}</p>
              </li>
            ))}
          </ol>
          {config?.cancellationPolicy && (
            <p className="policy-note mb-0 mt-4 measure">
              <strong>Cancellation policy.</strong> {config.cancellationPolicy}
            </p>
          )}
        </div>
      </section>
    </>
  );
}
