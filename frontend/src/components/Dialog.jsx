import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { Icon } from "./Icons";


export default function Dialog({ open, title, description, confirmLabel, cancelLabel = "انصراف", tone = "danger", onConfirm, onCancel, children, busy = false, initialFocusRef = null, dismissible = true, showCancel = true }) {
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    (initialFocusRef?.current || confirmRef.current)?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape" && dismissible && !busy) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, dismissible, initialFocusRef, open, onCancel]);

  if (!open) return null;

  const confirmClass = tone === "primary"
    ? "bg-teal-700 text-white hover:bg-teal-800 focus-visible:ring-teal-600"
    : "bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500";

  return createPortal(
    <div className="dialog-backdrop fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/50 p-5 backdrop-blur-md" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && dismissible && !busy && onCancel()}>
      <section
        aria-describedby={description ? "dialog-description" : undefined}
        aria-labelledby="dialog-title"
        aria-modal="true"
        className="dialog-panel w-full max-w-md overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl sm:p-8"
        role="dialog"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900" id="dialog-title">{title}</h2>
            {description && <p className="mt-2 leading-7 text-slate-600" id="dialog-description">{description}</p>}
          </div>
          {dismissible && (
            <button className="touch-button -ml-2 -mt-2 rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-40" disabled={busy} onClick={onCancel} type="button" aria-label="بستن">
              <Icon name="close" />
            </button>
          )}
        </div>
        {children}
        <div className={`dialog-actions mt-7 grid gap-3 ${showCancel ? "grid-cols-2" : "grid-cols-1"}`}>
          {showCancel && (
            <button className="touch-button rounded-2xl border border-slate-200 bg-white px-4 font-bold text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-400 disabled:opacity-40" disabled={busy} onClick={onCancel} type="button">
              {cancelLabel}
            </button>
          )}
          <button ref={confirmRef} className={`touch-button rounded-2xl px-4 font-bold focus-visible:ring-4 disabled:opacity-55 ${confirmClass}`} disabled={busy} onClick={onConfirm} type="button">
            {busy ? "در حال ذخیره…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
