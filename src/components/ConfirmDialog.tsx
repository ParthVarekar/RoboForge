import { useEffect, useRef } from 'react';
import type React from 'react';

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

/**
 * Small modal that asks before something replaces the user's work (loading a preset or an example sketch).
 * The confirm button takes focus, Enter confirms, Esc or a click outside cancels.
 */
export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }): React.ReactElement | null {
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!request) return undefined;
    confirmRef.current?.focus();
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [request, onClose]);

  if (!request) return null;
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) onClose();
      }}
    >
      <div className="modal-box confirm-box" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <div className="confirm-body">
          <h2 id="confirm-title">{request.title}</h2>
          <p id="confirm-message">{request.message}</p>
        </div>
        <div className="confirm-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="btn btn-accent"
            onClick={() => {
              request.onConfirm();
              onClose();
            }}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
