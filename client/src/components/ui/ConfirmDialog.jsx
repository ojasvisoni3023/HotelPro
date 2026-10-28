import { useState } from 'react';
import { Modal } from 'react-bootstrap';

/**
 * Confirmation modal for consequential actions.
 * `onConfirm(reason)` may be async; the dialog shows progress and stays open on error.
 */
export default function ConfirmDialog({ show, title, children, confirmLabel = 'Confirm', tone = 'primary', reasonLabel, reasonRequired = false, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const handle = async () => {
    setBusy(true);
    try {
      await onConfirm(reason.trim());
      setReason('');
      onClose();
    } catch {
      /* caller shows the error */
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal show={show} onHide={busy ? undefined : onClose} centered>
      <Modal.Header closeButton={!busy}>
        <Modal.Title as="h2" className="h4">
          {title}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {children}
        {reasonLabel && (
          <div className="mt-3">
            <label className="form-label" htmlFor="confirm-reason">
              {reasonLabel}
            </label>
            <textarea id="confirm-reason" className="form-control" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-quiet" onClick={onClose} disabled={busy}>
          Keep as is
        </button>
        <button type="button" className={`btn btn-${tone}`} onClick={handle} disabled={busy || (reasonRequired && reason.trim().length < 3)}>
          {busy && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
          {confirmLabel}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
