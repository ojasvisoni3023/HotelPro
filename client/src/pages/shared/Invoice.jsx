import { ArrowLeft, Printer } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import api from '../../api/client';
import { Monogram } from '../../components/layout/Brand';
import { ErrorState, InlineAlert, PageLoader } from '../../components/ui/Feedback';
import useApi from '../../hooks/useApi';
import { date, money, plural } from '../../utils/format';
import './invoice.css';

/** Printable invoice. "Save as PDF" in the browser print dialog produces a PDF copy. */
export default function Invoice() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: inv, loading, error, reload } = useApi(() => api.get(`/bookings/${id}/invoice`), [id]);
  if (loading) return <PageLoader />;
  if (error) return <div className="container py-5"><ErrorState error={error} onRetry={reload} title="Invoice unavailable" /></div>;
  const a = inv.seller.address;
  return (
    <div className="invoice-page py-4">
      <div className="container no-print d-flex justify-content-between mb-3" style={{ maxWidth: 820 }}>
        <button type="button" className="btn btn-quiet" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} className="me-2" aria-hidden="true" />Back
        </button>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          <Printer size={16} className="me-2" aria-hidden="true" />Print or save as PDF
        </button>
      </div>
      <article className="invoice container" style={{ maxWidth: 820 }} aria-label={`Invoice ${inv.invoiceNumber}`}>
        <header className="d-flex justify-content-between flex-wrap gap-3 pb-4 border-bottom">
          <div className="d-flex gap-3 align-items-start">
            <Monogram size={44} />
            <div>
              <div className="display-type" style={{ fontSize: '1.5rem' }}>{inv.seller.name}</div>
              <div className="small text-muted">
                {a.line1}, {a.city}, {a.state} {a.postalCode}
                <br />
                {inv.seller.contact?.email} {inv.seller.contact?.phone}
              </div>
            </div>
          </div>
          <div className="text-end">
            <h1 className="h3 mb-1">Tax invoice</h1>
            <div className="num fw-semibold">{inv.invoiceNumber}</div>
            <div className="small text-muted">Issued {date(inv.issuedAt)}</div>
          </div>
        </header>
        {inv.testMode && <InlineAlert tone="test" className="my-3">Test-mode payment: this invoice documents a demonstration transaction. No real money was charged.</InlineAlert>}
        <section className="row g-4 py-4">
          <div className="col-sm-6">
            <div className="small text-muted fw-semibold mb-1">Billed to</div>
            <div className="fw-semibold">{inv.billedTo.name}</div>
            <div className="small">{inv.billedTo.email}</div>
            {inv.billedTo.phone && <div className="small">{inv.billedTo.phone}</div>}
          </div>
          <div className="col-sm-6">
            <div className="small text-muted fw-semibold mb-1">Stay</div>
            <div className="small">
              Booking <span className="num fw-semibold">{inv.booking.confirmationCode}</span>
              <br />
              {inv.booking.roomType}{inv.booking.roomNumber ? `, room ${inv.booking.roomNumber}` : ''}
              <br />
              {date(inv.booking.checkIn)} to {date(inv.booking.checkOut)} ({plural(inv.booking.nights, 'night')}, {plural(inv.booking.guests, 'guest')})
            </div>
          </div>
        </section>
        <table className="table num">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Description</th>
              <th scope="col" className="text-end">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l) => (
              <tr key={l.date}>
                <td>{date(l.date)}</td>
                <td>{l.description}</td>
                <td className="text-end">{money(l.amount, { exact: true })}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={2} className="text-end">Subtotal</td><td className="text-end">{money(inv.subtotal, { exact: true })}</td></tr>
            <tr><td colSpan={2} className="text-end">GST ({inv.taxRatePercent}%)</td><td className="text-end">{money(inv.taxes, { exact: true })}</td></tr>
            <tr><td colSpan={2} className="text-end fw-bold">Total</td><td className="text-end fw-bold">{money(inv.total, { exact: true })}</td></tr>
            <tr><td colSpan={2} className="text-end">Paid</td><td className="text-end">{money(inv.amountPaid, { exact: true })}</td></tr>
            {inv.amountRefunded > 0 && <tr><td colSpan={2} className="text-end">Refunded</td><td className="text-end">−{money(inv.amountRefunded, { exact: true })}</td></tr>}
          </tfoot>
        </table>
        <footer className="small text-muted pt-3">
          Issued through {inv.seller.platform}. Questions about this invoice: {inv.seller.supportEmail}. Tax rate is configured by the platform administrator; this is a student project and not a statutory tax document.
        </footer>
      </article>
    </div>
  );
}
