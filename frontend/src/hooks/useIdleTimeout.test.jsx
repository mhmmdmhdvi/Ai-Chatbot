// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IDLE_INACTIVITY_MS, IDLE_WARNING_MS } from "../features/chat/ChatPanel";
import useIdleTimeout from "./useIdleTimeout";


function IdleHarness({ onTimeout }) {
  const { secondsLeft, warningOpen } = useIdleTimeout({
    enabled: true,
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
  it("warns after 30 inactive seconds and times out 10 seconds later", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    render(<IdleHarness onTimeout={onTimeout} />);

    act(() => vi.advanceTimersByTime(20_000));
    act(() => window.dispatchEvent(new Event("pointerdown")));
    act(() => vi.advanceTimersByTime(IDLE_INACTIVITY_MS - 1));
    expect(screen.queryByRole("alert")).toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("alert").textContent).toBe("10");

    act(() => vi.advanceTimersByTime(IDLE_WARNING_MS));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });
});
