import { BedDouble, MapPin, Ruler, Users } from 'lucide-react';
import { Link } from 'react-router';
import { money, plural } from '../../utils/format';
import { Img, Stars } from '../ui/Bits';
import Amenities from './Amenities';

/** One search result: a room type at a hotel, with live price/availability when dates are set. */
export default function RoomTypeCard({ item, stay }) {
  const { roomType: rt, hotel, quote, availableRooms, nightlyPrice } = item;
  const qs = stay ? `?checkIn=${stay.checkIn}&checkOut=${stay.checkOut}&guests=${stay.guests}` : '';
  const soldOut = stay && availableRooms === 0;
  return (
    <article className="panel room-result">
      <Img src={rt.images?.[0]?.url} alt={rt.images?.[0]?.alt || rt.name} className="room-result-img" />
      <div className="room-result-body">
        <div className="d-flex flex-wrap justify-content-between gap-2">
          <div>
            <Link to={`/hotels/${hotel.slug}`} className="small fw-semibold text-decoration-none text-brass">
              {hotel.name}
            </Link>
            <h3 className="h4 mb-1 mt-1">
              <Link to={`/rooms/${rt._id}${qs}`} className="text-decoration-none" style={{ color: 'inherit' }}>
                {rt.name}
              </Link>
            </h3>
            <div className="small text-muted d-flex flex-wrap gap-3">
              <span>
                <MapPin size={14} className="me-1" aria-hidden="true" />
                {hotel.address?.city}
              </span>
              <span>
                <Users size={14} className="me-1" aria-hidden="true" />
                Sleeps {rt.maxGuests}
              </span>
              {rt.bedType && (
                <span>
                  <BedDouble size={14} className="me-1" aria-hidden="true" />
                  {rt.bedType}
                </span>
              )}
              {rt.sizeSqm ? (
                <span>
                  <Ruler size={14} className="me-1" aria-hidden="true" />
                  {rt.sizeSqm} m²
                </span>
              ) : null}
            </div>
          </div>
          <Stars value={hotel.ratingAvg} count={hotel.ratingCount} />
        </div>
        {rt.description && <p className="mb-1 text-muted" style={{ maxWidth: '62ch' }}>{rt.description}</p>}
        <Amenities items={rt.amenities} limit={5} />
        <div className="room-result-foot">
          <div>
            <div className="price-figure num">{money(nightlyPrice)}</div>
            <div className="small text-muted">
              {quote ? `per night on average, ${money(quote.total)} total for ${plural(quote.nights, 'night')} incl. taxes` : 'per night from, before taxes'}
            </div>
          </div>
          <div className="d-flex align-items-center gap-3">
            {stay &&
              (soldOut ? (
                <span className="status status-bad">Sold out for these dates</span>
              ) : (
                <span className={`status ${availableRooms <= 2 ? 'status-wait' : 'status-good'}`}>{availableRooms <= 2 ? `Only ${availableRooms} left` : `${availableRooms} rooms free`}</span>
              ))}
            <Link to={`/rooms/${rt._id}${qs}`} className={`btn ${soldOut ? 'btn-quiet' : 'btn-primary'}`}>
              {soldOut ? 'View details' : stay ? 'Select room' : 'View room'}
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
