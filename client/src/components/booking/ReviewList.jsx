import { date } from '../../utils/format';
import { Stars } from '../ui/Bits';

export default function ReviewList({ reviews }) {
  if (!reviews?.length) return <p className="text-muted">No reviews yet. Reviews appear here after guests complete their stay.</p>;
  return (
    <div className="d-grid gap-3">
      {reviews.map((r) => (
        <figure key={r._id} className="panel panel-pad mb-0">
          <div className="d-flex justify-content-between flex-wrap gap-2">
            <Stars value={r.rating} />
            <span className="small text-muted">{date(r.createdAt)}</span>
          </div>
          {r.title && <h3 className="h5 mt-2 mb-1">{r.title}</h3>}
          <blockquote className="mb-2">
            <p className="mb-0">{r.comment}</p>
          </blockquote>
          <figcaption className="small text-muted">{r.guestName}</figcaption>
        </figure>
      ))}
    </div>
  );
}

