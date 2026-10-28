import { CreditCard, FlaskConical, Lock, TimerReset } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { toast } from 'react-toastify';
import api from '../../api/client';
import PriceBreakdown from '../../components/booking/PriceBreakdown';
import { PageHeader } from '../../components/ui/Bits';
import { ErrorState, InlineAlert, PageLoader } from '../../components/ui/Feedback';
import useApi from '../../hooks/useApi';
import { dayDate, plural } from '../../utils/format';

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

function useCountdown(until) {
  const [left, setLeft] = useState(() => (until ? new Date(until) - Date.now() : 0));
  useEffect(() => {
    if (!until) return undefined;
    const t = setInterval(() => setLeft(new Date(until) - Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  return Math.max(0, left);
}

export default function Payment() {
  const { id } = useParams();
  const navigate = useNavigate();
  const detail = useApi(() => api.get(`/bookings/${id}`), [id]);
  const [order, setOrder] = useState(null);
  const [orderError, setOrderError] = useState(null);
  const [busy, setBusy] = useState(false);
  const canPay = detail.data?.actions?.canPay;
  const left = useCountdown(order?.holdExpiresAt ?? detail.data?.booking?.holdExpiresAt);

  useEffect(() => {
    if (!canPay || order) return;
    api
      .post('/payments/orders', { bookingId: id })
      .then((r) => setOrder(r.data))
      .catch(setOrderError);
  }, [canPay, order, id]);

  if (detail.loading) return <PageLoader />;
  if (detail.error) return <div className="container py-5"><ErrorState error={detail.error} onRetry={detail.reload} /></div>;
  const { booking } = detail.data;
  if (['confirmed', 'checked_in', 'checked_out'].includes(booking.status)) return <Navigate to={`/bookings/${id}/confirmation`} replace />;

  const finish = () => navigate(`/bookings/${id}/confirmation`, { replace: true });

  const payWithRazorpay = async () => {
    setBusy(true);
    const ok = await loadRazorpay();
    if (!ok) {
      toast.error('Could not load the Razorpay checkout. Check your connection and try again.');
      setBusy(false);
      return;
    }
    const rzp = new window.Razorpay({
      key: order.keyId,
      amount: order.amountMinor,
      currency: order.currency,
      order_id: order.orderId,
      name: 'HotelPro',
      description: `${booking.hotel.name}, ${booking.confirmationCode}`,
      prefill: order.prefill,
      theme: { color: '#14294a' },
      handler: async (resp) => {
        try {
          // The server verifies the signature and checks the payment with Razorpay before confirming.
          await api.post('/payments/razorpay/verify', resp);
          toast.success('Payment confirmed');
          finish();
        } catch (err) {
          toast.error(err.message);
          detail.reload();
          setBusy(false);
        }
      },
      modal: { ondismiss: () => setBusy(false) },
    });
    rzp.on('payment.failed', (r) => {
      toast.error(r.error?.description || 'Payment failed');
      setBusy(false);
    });
    rzp.open();
  };

  const mockPay = async (outcome) => {
    setBusy(true);
    try {
      const res = await api.post('/payments/mock/complete', { orderId: order.orderId, outcome });
      if (res.data.status === 'confirmed') {
        toast.success('Test payment completed');
        finish();
      } else {
        toast.error('The test payment was declined. You can try again.');
        detail.reload();
        setBusy(false);
      }
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  const mins = Math.floor(left / 60000);
  const secs = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
  const expired = booking.status === 'expired' || (booking.status === 'pending' && left <= 0 && booking.holdExpiresAt);

  return (
    <div className="container py-4" style={{ maxWidth: 1000 }}>
      <PageHeader title="Payment" description={`Booking ${booking.confirmationCode}`} crumbs={[{ label: 'My bookings', to: '/account/bookings' }, { label: 'Payment' }]} />
      <div className="row g-4">
        <div className="col-lg-7">
          <div className="panel panel-pad">
            {expired ? (
              <>
                <h2 className="h4">Your hold has expired</h2>
                <p className="text-muted">The room was released because payment was not completed in time. Search again to see if it is still available.</p>
                <Link to={`/rooms/${booking.category._id}?checkIn=${booking.checkIn.slice(0, 10)}&checkOut=${booking.checkOut.slice(0, 10)}&guests=${booking.guests}`} className="btn btn-primary">
                  Check availability again
                </Link>
              </>
            ) : booking.status === 'cancelled' ? (
              <InlineAlert tone="bad">This booking was cancelled and cannot be paid.</InlineAlert>
            ) : (
              <>
                <div className="d-flex align-items-center gap-2 mb-3">
                  <TimerReset size={20} className="text-brass" aria-hidden="true" />
                  <span aria-live="polite">
                    Room held for you for <strong className="num">{mins}:{secs}</strong>
                  </span>
                </div>
                {booking.paymentStatus === 'failed' && (
                  <InlineAlert tone="bad" className="mb-3">
                    Your last payment attempt failed. You have not been charged; you can try again below.
                  </InlineAlert>
                )}
                {orderError && <InlineAlert tone="bad" className="mb-3">{orderError.message}</InlineAlert>}
                {!order && !orderError && <p className="text-muted">Preparing a secure payment…</p>}
                {order?.provider === 'razorpay' && (
                  <>
                    <p className="text-muted">Pay with card, UPI, net banking or wallet in Razorpay’s secure window. Your card details go directly to Razorpay.</p>
                    {order.testMode && <InlineAlert tone="test" className="mb-3">Razorpay test keys are in use: use Razorpay test cards; no real money is charged.</InlineAlert>}
                    <button type="button" className="btn btn-primary btn-lg w-100" onClick={payWithRazorpay} disabled={busy}>
                      <Lock size={18} className="me-2" aria-hidden="true" />
                      Pay securely
                    </button>
                  </>
                )}
                {order?.provider === 'mock' && (
                  <>
                    <InlineAlert tone="test" className="mb-3">
                      <FlaskConical size={16} className="me-2" aria-hidden="true" />
                      <strong>Test mode.</strong> This server has no payment provider configured, so no real payment can be taken. Use the buttons below to simulate the outcome; the booking will be marked as a test payment.
                    </InlineAlert>
                    <div className="d-flex flex-wrap gap-2">
                      <button type="button" className="btn btn-primary" onClick={() => mockPay('success')} disabled={busy}>
                        <CreditCard size={18} className="me-2" aria-hidden="true" />
                        Complete test payment
                      </button>
                      <button type="button" className="btn btn-quiet" onClick={() => mockPay('failure')} disabled={busy}>
                        Simulate a declined payment
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        <aside className="col-lg-5">
          <div className="panel panel-pad">
            <div className="small text-brass fw-semibold">{booking.hotel.name}</div>
            <h2 className="h4">{booking.category.name}</h2>
            <p className="small">
              {dayDate(booking.checkIn)} to {dayDate(booking.checkOut)}
              <br />
              {plural(booking.nights, 'night')}, {plural(booking.guests, 'guest')}
            </p>
            <PriceBreakdown pricing={booking.pricing} nights={booking.nights} />
          </div>
        </aside>
      </div>
    </div>
  );
}
