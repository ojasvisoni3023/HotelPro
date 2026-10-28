import { BadgeCheck } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router';
import api from '../../api/client';
import { KeyValue, StatusBadge, TestBadge } from '../../components/ui/Bits';
import { ErrorState, PageLoader } from '../../components/ui/Feedback';
import useApi from '../../hooks/useApi';
import { dayDate, money, plural } from '../../utils/format';

export default function Confirmation() {
  const { id } = useParams();
  const { data, loading, error, reload } = useApi(() => api.get(`/bookings/${id}`), [id]);
  if (loading) return <PageLoader />;
  if (error) return <div className="container py-5"><ErrorState error={error} onRetry={reload} /></div>;
  const { booking, payments } = data;
  if (booking.status === 'pending') return <Navigate to={`/bookings/${id}/pay`} replace />;
  const paid = payments.find((p) => ['captured', 'refunded', 'partially_refunded'].includes(p.status));
  return (
    <div className="container py-5" style={{ maxWidth: 720 }}>
      <div className="panel panel-pad">
        <div className="text-center mb-4">
          <BadgeCheck size={44} strokeWidth={1.4} style={{ color: 'var(--hp-lake)' }} aria-hidden="true" />
          <h1 className="h2 mt-2 mb-1">{booking.status === 'confirmed' ? 'Your stay is confirmed' : 'Booking update'}</h1>
          <p className="text-muted mb-0">
            Confirmation code <strong className="num" style={{ color: 'var(--hp-navy)', letterSpacing: '0.05em' }}>{booking.confirmationCode}</strong>
          </p>
        </div>
        <KeyValue label="Hotel">{booking.hotel.name}</KeyValue>
        <KeyValue label="Room">{booking.category.name}</KeyValue>
        <KeyValue label="Check-in">{dayDate(booking.checkIn)}, from {booking.hotel.checkInTime}</KeyValue>
        <KeyValue label="Check-out">{dayDate(booking.checkOut)}, by {booking.hotel.checkOutTime}</KeyValue>
        <KeyValue label="Guests">{plural(booking.guests, 'guest')}</KeyValue>
        <KeyValue label="Status"><StatusBadge kind="booking" value={booking.status} /></KeyValue>
        <KeyValue label="Paid">
          <span className="num">{money(booking.pricing.total)}</span> {paid?.isTest && <TestBadge />}
        </KeyValue>
        <p className="small text-muted mt-3">A confirmation has been sent to {booking.guestDetails.email} if email delivery is configured. Everything is also saved in your account.</p>
        <div className="d-flex flex-wrap gap-2 mt-3">
          <Link to={`/account/bookings/${booking._id}`} className="btn btn-primary">
            View booking
          </Link>
          {booking.invoice?.number && (
            <Link to={`/bookings/${booking._id}/invoice`} className="btn btn-quiet">
              View invoice
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
