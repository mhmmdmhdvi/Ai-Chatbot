import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";


const PERSIAN_ROWS = [
  ["۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹", "۰"],
  ["ض", "ص", "ث", "ق", "ف", "غ", "ع", "ه", "خ", "ح", "ج", "چ"],
  ["ش", "س", "ی", "ب", "ل", "ا", "ت", "ن", "م", "ک", "گ"],
  ["ظ", "ط", "ز", "ر", "ذ", "د", "پ", "و", "،", "؟"],
];

const LATIN_ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m", "-", "_", "."],
];

const NUMERIC_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["+", "0", "⌫"],
];


function setControlledValue(target, value, caretPosition) {
  const prototype = target instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  valueSetter?.call(target, value);
  target.dispatchEvent(new Event("input", { bubbles: true }));
  window.requestAnimationFrame(() => {
    target.focus({ preventScroll: true });
    target.setSelectionRange?.(caretPosition, caretPosition);
  });
}


function mutateTarget(target, text) {
  if (!target || !target.isConnected || target.disabled || target.readOnly) return;
  const value = target.value || "";
  const start = target.selectionStart ?? value.length;
  const end = target.selectionEnd ?? start;
  const room = Number.isFinite(target.maxLength) && target.maxLength >= 0
    ? Math.max(0, target.maxLength - (value.length - (end - start)))
    : text.length;
  const inserted = text.slice(0, room);
  const nextValue = `${value.slice(0, start)}${inserted}${value.slice(end)}`;
  setControlledValue(target, nextValue, start + inserted.length);
}


function backspaceTarget(target) {
  if (!target || !target.isConnected || target.disabled || target.readOnly) return;
  const value = target.value || "";
  const start = target.selectionStart ?? value.length;
  const end = target.selectionEnd ?? start;
  if (start === 0 && end === 0) return;
  const previousCharacterLength = start === end && start > 0
    ? [...value.slice(0, start)].at(-1)?.length || 1
    : 0;
  const removeFrom = start === end ? start - previousCharacterLength : start;
  const nextValue = `${value.slice(0, removeFrom)}${value.slice(end)}`;
  setControlledValue(target, nextValue, removeFrom);
}


function keyboardLabel(target) {
  if (!target) return "";
  return target.getAttribute("aria-label")
    || target.labels?.[0]?.textContent?.trim()
    || "ورودی متن";
}


export default function VirtualKeyboard() {
  const [activeTarget, setActiveTarget] = useState(null);
  const [layout, setLayout] = useState("persian");
  const targetRef = useRef(null);
  const open = Boolean(activeTarget);

  const activateTarget = useCallback((target) => {
    if (!target?.matches?.("[data-virtual-keyboard]")) return;
    const requestedLayout = target.dataset.virtualKeyboard || "persian";
    targetRef.current = target;
    setActiveTarget(target);
    setLayout(["persian", "latin", "numeric"].includes(requestedLayout) ? requestedLayout : "persian");
  }, []);

  const closeKeyboard = useCallback(() => {
    targetRef.current = null;
    setActiveTarget(null);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (event.target.closest?.(".virtual-keyboard")) return;
      const directTarget = event.target.closest?.("[data-virtual-keyboard]");
      const labelTarget = event.target.closest?.("label")?.querySelector?.("[data-virtual-keyboard]");
      const nextTarget = directTarget || labelTarget;
      if (nextTarget) activateTarget(nextTarget);
      else closeKeyboard();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("submit", closeKeyboard, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("submit", closeKeyboard, true);
    };
  }, [activateTarget, closeKeyboard]);

  useEffect(() => {
    if (!open || typeof MutationObserver !== "function") return undefined;
    const observer = new MutationObserver(() => {
      if (targetRef.current && !targetRef.current.isConnected) closeKeyboard();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [closeKeyboard, open]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("virtual-keyboard-visible", open);
    return () => root.classList.remove("virtual-keyboard-visible");
  }, [open]);

  const rows = useMemo(() => {
    if (layout === "numeric") return NUMERIC_ROWS;
    return layout === "latin" ? LATIN_ROWS : PERSIAN_ROWS;
  }, [layout]);

  const pressKey = (key) => {
    const target = targetRef.current;
    if (key === "⌫") backspaceTarget(target);
    else mutateTarget(target, key);
  };

  const handleEnter = () => {
    const target = targetRef.current;
    if (!target?.isConnected) return closeKeyboard();
    const nextTargetId = target.dataset.keyboardNext;
    if (nextTargetId) {
      const nextTarget = document.getElementById(nextTargetId);
      if (nextTarget) {
        activateTarget(nextTarget);
        nextTarget.focus({ preventScroll: true });
        return;
      }
    }

    const keyboardEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
    });
    const notPrevented = target.dispatchEvent(keyboardEvent);
    if (notPrevented && target.form) target.form.requestSubmit();
    closeKeyboard();
  };

  if (!open) return null;

  const canSwitchLanguage = layout !== "numeric";
  const enterLabel = activeTarget?.dataset.keyboardNext
    ? "بعدی"
    : activeTarget?.tagName === "TEXTAREA"
      ? "ارسال"
      : "تأیید";

  return createPortal(
    <section
      aria-label={`صفحه‌کلید مگاتایت برای ${keyboardLabel(activeTarget)}`}
      className={`virtual-keyboard virtual-keyboard-${layout}`}
      onPointerDown={(event) => event.preventDefault()}
      role="region"
    >
      <div className="virtual-keyboard-watermark" aria-hidden="true">MEGATITE</div>
      <div className="virtual-keyboard-panel">
        <header className="virtual-keyboard-header">
          <div className="virtual-keyboard-brand" aria-hidden="true">
            <strong>MEGATITE</strong>
            <span>کیبورد لمسی</span>
          </div>
          <span className="virtual-keyboard-field">{keyboardLabel(activeTarget)}</span>
          <button aria-label="بستن صفحه‌کلید" className="virtual-keyboard-close" onClick={closeKeyboard} tabIndex={-1} type="button">بستن ×</button>
        </header>

        <div className="virtual-keyboard-rows" dir="ltr">
          {rows.map((row, rowIndex) => (
            <div className={`virtual-keyboard-row virtual-keyboard-row-${rowIndex}`} key={`${layout}-${rowIndex}`}>
              {row.map((key) => (
                <button
                  aria-label={key === "⌫" ? "پاک کردن" : key}
                  className={`virtual-key ${key === "⌫" ? "virtual-key-action" : ""}`}
                  key={key}
                  onClick={() => pressKey(key)}
                  tabIndex={-1}
                  type="button"
                >
                  {key}
                </button>
              ))}
            </div>
          ))}
        </div>

        {layout !== "numeric" && (
          <div className="virtual-keyboard-controls" dir="ltr">
            <button aria-label="پاک کردن" className="virtual-key virtual-key-wide" onClick={() => backspaceTarget(targetRef.current)} tabIndex={-1} type="button">⌫</button>
            <button
              className="virtual-key virtual-key-language"
              disabled={!canSwitchLanguage}
              onClick={() => setLayout((current) => current === "persian" ? "latin" : "persian")}
              tabIndex={-1}
              type="button"
            >
              {layout === "persian" ? "EN" : "فا"}
            </button>
            <button aria-label="فاصله" className="virtual-key virtual-key-space" onClick={() => mutateTarget(targetRef.current, " ")} tabIndex={-1} type="button">فاصله</button>
            <button className="virtual-key virtual-key-enter" onClick={handleEnter} tabIndex={-1} type="button">{enterLabel} ↵</button>
          </div>
        )}

        {layout === "numeric" && (
          <button className="virtual-key numeric-enter-key" onClick={handleEnter} tabIndex={-1} type="button">{enterLabel} ↵</button>
        )}
      </div>
    </section>,
    document.body,
  );
}
