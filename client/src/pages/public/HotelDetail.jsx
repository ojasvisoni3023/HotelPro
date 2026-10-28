import { Clock, Mail, MapPin, Phone, Users } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import api from '../../api/client';
import Amenities from '../../components/booking/Amenities';
import Gallery from '../../components/booking/Gallery';
import ReviewList from '../../components/booking/ReviewList';
import SearchBar from '../../components/booking/SearchBar';
import { Img, PageHeader, Stars } from '../../components/ui/Bits';
import { ErrorState, PageLoader } from '../../components/ui/Feedback';
import useApi from '../../hooks/useApi';
import { money } from '../../utils/format';
import NotFound from './NotFound';

export default function HotelDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(() => api.get(`/hotels/${slug}`), [slug]);
  if (loading) return <PageLoader />;
  if (error?.status === 404) return <NotFound />;
  if (error) return <div className="container py-5"><ErrorState error={error} onRetry={reload} /></div>;
  const { hotel, roomTypes, reviews, cancellationPolicy } = data;
  const mapUrl = hotel.location?.lat ? `https://www.openstreetmap.org/?mlat=${hotel.location.lat}&mlon=${hotel.location.lng}#map=15/${hotel.location.lat}/${hotel.location.lng}` : null;

  return (
    <div className="container py-4">
      <PageHeader
        crumbs={[{ label: 'Hotels', to: '/hotels' }, { label: hotel.name }]}
        title={hotel.name}
        description={hotel.tagline}
        actions={<Stars value={hotel.ratingAvg} count={hotel.ratingCount} size={18} />}
      />
      <Gallery images={hotel.images} title={hotel.name} />

      <div className="row g-4 gx-lg-5 mt-1">
        <div className="col-lg-8">
          <p className="d-flex align-items-center gap-2 text-muted">
            <MapPin size={16} aria-hidden="true" />
            {hotel.address.line1}, {hotel.address.city}, {hotel.address.state} {hotel.address.postalCode}
            {mapUrl && (
              <a href={mapUrl} target="_blank" rel="noreferrer" className="small">
                View map
              </a>
            )}
          </p>
          <p className="lead measure">{hotel.description}</p>
          <h2 className="h3 mt-4">At the hotel</h2>
          <Amenities items={hotel.amenities} />

          <h2 className="h3 mt-5 mb-3" id="rooms">
            Room types
          </h2>
          <div className="d-grid gap-3">
            {roomTypes.map((rt) => (
              <div className="panel d-flex flex-column flex-sm-row overflow-hidden" key={rt._id}>
                <Img src={rt.images?.[0]?.url} alt={rt.images?.[0]?.alt || rt.name} style={{ width: '100%', maxWidth: 260, minHeight: 170 }} className="flex-shrink-0" />
                <div className="p-3 flex-grow-1 d-flex flex-column">
                  <h3 className="h4 mb-1">{rt.name}</h3>
                  <div className="small text-muted mb-2">
                    <Users size={14} className="me-1" aria-hidden="true" />
                    Sleeps {rt.maxGuests}
                    {rt.bedType && `, ${rt.bedType}`}
                    {rt.sizeSqm ? `, ${rt.sizeSqm} m²` : ''}
                  </div>
                  <Amenities items={rt.amenities} limit={4} />
                  <div className="d-flex justify-content-between align-items-end mt-auto pt-3">
                    <div>
                      <span className="fw-bold num" style={{ color: 'var(--hp-navy)' }}>{money(rt.basePrice)}</span>
                      <span className="small text-muted"> per night from</span>
                    </div>
                    <Link to={`/rooms/${rt._id}`} className="btn btn-primary btn-sm">
                      View and book
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <h2 className="h3 mt-5 mb-3">What guests say</h2>
          <ReviewList reviews={reviews} />
        </div>

        <aside className="col-lg-4">
          <div className="sticky-aside d-grid gap-3">
            <div className="panel panel-pad">
              <h2 className="h4">Check availability</h2>
              <SearchBar variant="plain" hideWhere onSearch={(p) => navigate(`/rooms?${new URLSearchParams({ ...p, hotel: hotel._id })}`)} />
            </div>
            <div className="panel panel-pad small">
              <h2 className="h5">Good to know</h2>
              <p className="d-flex gap-2 mb-2">
                <Clock size={16} className="text-brass flex-shrink-0 mt-1" aria-hidden="true" />
                Check-in from {hotel.checkInTime}, check-out by {hotel.checkOutTime}
              </p>
              {hotel.policies && <p className="text-muted">{hotel.policies}</p>}
              <p className="text-muted mb-3">{cancellationPolicy}</p>
              {hotel.contact?.phone && (
                <p className="mb-1">
                  <Phone size={14} className="me-2" aria-hidden="true" />
                  <a href={`tel:${hotel.contact.phone.replace(/\s/g, '')}`}>{hotel.contact.phone}</a>
                </p>
              )}
              {hotel.contact?.email && (
                <p className="mb-0">
                  <Mail size={14} className="me-2" aria-hidden="true" />
                  <a href={`mailto:${hotel.contact.email}`}>{hotel.contact.email}</a>
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
