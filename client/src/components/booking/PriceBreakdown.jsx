import { date, money, plural } from '../../utils/format';

/** Server-calculated price breakdown. The client only displays it, never computes totals. */
export default function PriceBreakdown({ pricing, nights, showNightly = true }) {
  if (!pricing) return null;
  const n = nights ?? pricing.nights ?? pricing.nightly?.length ?? 0;
  const seasonal = pricing.nightly?.some((x) => x.season);
  return (
    <div>
      <table className="w-100 price-table num">
        <tbody>
          {showNightly && pricing.nightly?.length > 0 && pricing.nightly.length <= 7
            ? pricing.nightly.map((nt) => (
                <tr key={String(nt.date)}>
                  <td className="text-muted">
                    {date(nt.date, { weekday: 'short', year: undefined })}
                    {nt.season && <span className="small"> ({nt.season})</span>}
                  </td>
                  <td className="text-end">{money(nt.rate)}</td>
                </tr>
              ))
            : (
                <tr>
                  <td className="text-muted">
                    {plural(n, 'night')}
                    {seasonal && ' (includes seasonal rates)'}
                  </td>
                  <td className="text-end">{money(pricing.subtotal)}</td>
                </tr>
              )}
          <tr className="border-top">
            <td className="pt-2">Room subtotal</td>
            <td className="text-end pt-2">{money(pricing.subtotal)}</td>
          </tr>
          <tr>
            <td className="text-muted">Taxes ({pricing.taxRatePercent}% GST)</td>
            <td className="text-end">{money(pricing.taxes)}</td>
          </tr>
          <tr>
            <td className="text-muted">Service fees</td>
            <td className="text-end">{money(0)}</td>
          </tr>
          <tr className="border-top">
            <td className="pt-2 fw-bold">Total payable</td>
            <td className="text-end pt-2 price-total">{money(pricing.total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
