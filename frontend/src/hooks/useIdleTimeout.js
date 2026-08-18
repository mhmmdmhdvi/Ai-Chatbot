import { useCallback, useEffect, useRef, useState } from "react";


export default function useIdleTimeout({ enabled, idleMs, warningMs, onTimeout }) {
  const [warningOpen, setWarningOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(warningMs / 1000));
  const timersRef = useRef([]);
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    setWarningOpen(false);
    setSecondsLeft(Math.ceil(warningMs / 1000));
    if (!enabled) return;

    const warningTimer = window.setTimeout(() => {
      const deadline = Date.now() + warningMs;
      setWarningOpen(true);
      const tick = () => {
        const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        setSecondsLeft(remaining);
        if (remaining > 0) timersRef.current.push(window.setTimeout(tick, 1000));
      };
      tick();
    }, idleMs);

    const timeoutTimer = window.setTimeout(() => {
      setWarningOpen(false);
      onTimeoutRef.current();
    }, idleMs + warningMs);

    timersRef.current.push(warningTimer, timeoutTimer);
  }, [clearTimers, enabled, idleMs, warningMs]);

  useEffect(() => {
    if (!enabled) {
      clearTimers();
      setWarningOpen(false);
      return undefined;
    }

    const activityEvents = ["pointerdown", "keydown", "touchstart"];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, reset, { passive: true }));
    reset();
    return () => {
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, reset));
      clearTimers();
    };
  }, [clearTimers, enabled, reset]);

  return { warningOpen, secondsLeft, stayActive: reset };
}
