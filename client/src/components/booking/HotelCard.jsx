import { MapPin } from 'lucide-react';
import { Link } from 'react-router';
import { money } from '../../utils/format';
import { Img, Stars } from '../ui/Bits';

export default function HotelCard({ hotel }) {
  return (
    <Link to={`/hotels/${hotel.slug}`} className="panel hotel-card">
      <Img src={hotel.images?.[0]?.url} alt={hotel.images?.[0]?.alt || hotel.name} className="hotel-card-img" />
      <div className="p-3 d-flex flex-column flex-grow-1">
        <div className="small text-muted d-flex align-items-center gap-1">
          <MapPin size={14} aria-hidden="true" />
          {hotel.address?.city}, {hotel.address?.state}
        </div>
        <h3 className="h4 mt-1 mb-1">{hotel.name}</h3>
        {hotel.tagline && <p className="text-muted small mb-2">{hotel.tagline}</p>}
        <div className="mt-auto d-flex justify-content-between align-items-end pt-2">
          <Stars value={hotel.ratingAvg} count={hotel.ratingCount} />
          {hotel.minPrice !== null && hotel.minPrice !== undefined && (
            <div className="text-end">
              <div className="small text-muted">Rooms from</div>
              <div className="fw-bold num" style={{ color: 'var(--hp-navy)' }}>
                {money(hotel.minPrice)}
              </div>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
