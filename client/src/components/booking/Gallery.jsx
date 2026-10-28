import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Modal } from 'react-bootstrap';
import { Img } from '../ui/Bits';

/** Hero gallery: one large + two small images; click to open a keyboard-navigable viewer. */
export default function Gallery({ images = [], title }) {
  const [open, setOpen] = useState(null);
  const shown = images.slice(0, 3);
  if (!images.length) return <Img alt={title} ratio="16 / 7" className="w-100 rounded-2" />;
  const move = (d) => setOpen((i) => (i + d + images.length) % images.length);
  return (
    <>
      <div className="gallery">
        {shown.map((img, i) => (
          <button key={img._id ?? img.url} type="button" className="gallery-btn" onClick={() => setOpen(i)} aria-label={`Open photo ${i + 1} of ${images.length}: ${img.alt || title}`}>
            <Img src={img.url} alt={img.alt || title} />
          </button>
        ))}
      </div>
      {images.length > 3 && (
        <button type="button" className="btn btn-quiet btn-sm mt-2" onClick={() => setOpen(0)}>
          View all {images.length} photos
        </button>
      )}
      <Modal show={open !== null} onHide={() => setOpen(null)} size="xl" centered onKeyDown={(e) => { if (e.key === 'ArrowRight') move(1); if (e.key === 'ArrowLeft') move(-1); }}>
        <Modal.Header closeButton>
          <Modal.Title as="h2" className="h5">
            {title} ({(open ?? 0) + 1} of {images.length})
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-0 position-relative" style={{ background: 'var(--hp-night)' }}>
          {open !== null && <Img src={images[open].url.replace('w=1600', 'w=2200')} alt={images[open].alt || title} style={{ width: '100%', maxHeight: '75vh', objectFit: 'contain' }} />}
          {images.length > 1 && (
            <>
              <button type="button" className="btn btn-light position-absolute top-50 start-0 translate-middle-y ms-2" onClick={() => move(-1)} aria-label="Previous photo">
                <ChevronLeft />
              </button>
              <button type="button" className="btn btn-light position-absolute top-50 end-0 translate-middle-y me-2" onClick={() => move(1)} aria-label="Next photo">
                <ChevronRight />
              </button>
            </>
          )}
        </Modal.Body>
        {images[open ?? 0]?.credit && <Modal.Footer className="small text-muted justify-content-start">{images[open ?? 0].credit}</Modal.Footer>}
      </Modal>
    </>
  );
}
