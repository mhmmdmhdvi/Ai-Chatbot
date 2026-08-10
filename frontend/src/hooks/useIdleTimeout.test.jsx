// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IDLE_INACTIVITY_MS, IDLE_WARNING_MS } from "../features/chat/ChatPanel";
import useIdleTimeout from "./useIdleTimeout";


function IdleHarness({ enabled = true, onTimeout }) {
  const { secondsLeft, warningOpen } = useIdleTimeout({
    enabled,
    idleMs: IDLE_INACTIVITY_MS,
    warningMs: IDLE_WARNING_MS,
    onTimeout,
  });

  return warningOpen ? <div role="alert">{secondsLeft}</div> : null;
}


afterEach(() => {
  cleanup();
  vi.useRealTimers();
});


describe("useIdleTimeout", () => {
  it("warns after 45 inactive seconds and times out 15 seconds later", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    render(<IdleHarness onTimeout={onTimeout} />);

    act(() => vi.advanceTimersByTime(20_000));
    act(() => window.dispatchEvent(new Event("pointerdown")));
    act(() => vi.advanceTimersByTime(IDLE_INACTIVITY_MS - 1));
    expect(screen.queryByRole("alert")).toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("alert").textContent).toBe("15");

    act(() => vi.advanceTimersByTime(IDLE_WARNING_MS));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("does not run while the welcome and customer intake screens are active", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    render(<IdleHarness enabled={false} onTimeout={onTimeout} />);

    act(() => vi.advanceTimersByTime(IDLE_INACTIVITY_MS + IDLE_WARNING_MS + 1));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
