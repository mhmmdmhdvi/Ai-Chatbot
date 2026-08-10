// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";


function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}


function emptyResponse(status = 204) {
  return new Response(null, { status });
}


function eventStreamResponse(events, status = 201) {
  const body = events.map(({ event, data }) => (
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  )).join("");
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/event-stream; charset=utf-8" },
  });
}


const kioskUser = { id: 2, username: "kiosk", is_staff: false };


beforeEach(() => {
  document.cookie = "csrftoken=test-token; Path=/";
});


afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});


describe("Persian kiosk application", () => {
  it("shows only the Persian login gate to an unauthenticated visitor", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (url === "/api/v1/auth/me/") return jsonResponse({ detail: "Authentication required" }, 403);
      if (url === "/api/v1/auth/csrf/") return jsonResponse({ detail: "ok" });
      throw new Error(`Unexpected request: ${url}`);
    }));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "ورود" })).toBeTruthy();
    expect(screen.getByAltText("Megatite")).toBeTruthy();
    expect(screen.queryByText("دروازه ورود کیوسک")).toBeNull();
    expect(screen.queryByText("برای فعال‌سازی دستیار، وارد حساب کاربری کیوسک شوید.")).toBeNull();
    expect(screen.queryByText("رمز عبور فقط برای ورود ارسال می‌شود و در مرورگر ذخیره نخواهد شد.")).toBeNull();
    expect(screen.getByLabelText("نام کاربری").getAttribute("dir")).toBe("ltr");
    expect(screen.queryByText("شروع گفتگو")).toBeNull();
  });

  it("shows a generic Persian error for invalid login credentials", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (url === "/api/v1/auth/me/") return jsonResponse({ detail: "Authentication required" }, 403);
      if (url === "/api/v1/auth/csrf/") return jsonResponse({ detail: "ok" });
      if (url === "/api/v1/auth/login/") return jsonResponse({ detail: "نام کاربری یا رمز عبور نادرست است." }, 400);
      throw new Error(`Unexpected request: ${url}`);
    }));
    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByLabelText("نام کاربری"), "wrong-user");
    await user.type(screen.getByLabelText("رمز عبور"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "ورود به سامانه" }));

    expect((await screen.findByRole("alert")).textContent).toContain("نام کاربری یا رمز عبور نادرست است.");
  });

  it("opens the single introduction screen after a valid kiosk login", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (url === "/api/v1/auth/me/") return jsonResponse({ detail: "Authentication required" }, 403);
      if (url === "/api/v1/auth/csrf/") return jsonResponse({ detail: "ok" });
      if (url === "/api/v1/auth/login/") return jsonResponse(kioskUser);
      if (url === "/api/v1/sessions/current/") return emptyResponse();
      throw new Error(`Unexpected request: ${url}`);
    }));
    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByLabelText("نام کاربری"), "kiosk");
    await user.type(screen.getByLabelText("رمز عبور"), "Strong-password");
    await user.click(screen.getByRole("button", { name: "ورود به سامانه" }));

    expect(await screen.findByRole("heading", { name: "سلام، من مشاور هوشمند مگاتایت هستم." })).toBeTruthy();
    expect(screen.getByText("بریم باهم گپ بزنیم؟")).toBeTruthy();
    expect(screen.getByRole("button", { name: "شروع" })).toBeTruthy();
    expect(screen.queryByLabelText("نام")).toBeNull();
    expect(screen.queryByLabelText("شماره موبایل")).toBeNull();
    expect(screen.queryByText(/مرحله [۱۲] از ۲/)).toBeNull();
    expect(screen.queryByText("نام، شماره و متن گفتگو در سامانه مجموعه ثبت می‌شود.")).toBeNull();
    expect(screen.queryByRole("button", { name: "خروج اپراتور" })).toBeNull();
    const intakeCharacter = document.querySelector("img.intake-character");
    expect(intakeCharacter).not.toBeNull();
    expect(intakeCharacter.getAttribute("src")).toContain("customer-guide-avatar");
    expect(screen.queryByLabelText("پیام‌های گفتگو")).toBeNull();
  });

  it("returns to the login gate when the kiosk session has expired", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (url === "/api/v1/auth/me/") return jsonResponse(kioskUser);
      if (url === "/api/v1/sessions/current/") return jsonResponse({ detail: "Authentication required" }, 403);
      throw new Error(`Unexpected request: ${url}`);
    }));
    render(<App />);

    expect(await screen.findByRole("heading", { name: "ورود" })).toBeTruthy();
    expect(screen.queryByText("سلام، من مشاور هوشمند مگاتایت هستم.")).toBeNull();
  });

  it("does not expose operator controls on the customer screen", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (url === "/api/v1/auth/me/") return jsonResponse(kioskUser);
      if (url === "/api/v1/sessions/current/") return emptyResponse();
      throw new Error(`Unexpected request: ${url}`);
    }));
    render(<App />);

    expect(await screen.findByText("سلام، من مشاور هوشمند مگاتایت هستم.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "خروج اپراتور" })).toBeNull();
    expect(screen.queryByLabelText("صفحه گفتگو")).toBeNull();
  });

  it("starts an anonymous chat, stores a message, and clears the screen for the next customer", async () => {
    const conversation = {
      id: "30d117a4-924c-4490-a202-5def926ad914",
      customer: null,
      status: "active",
      language: "fa",
      messages: [],
      ai_status: "ready",
    };
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === "/api/v1/auth/me/") return jsonResponse(kioskUser);
      if (url === "/api/v1/sessions/current/") return emptyResponse();
      if (url === "/api/v1/sessions/" && options.method === "POST") return jsonResponse(conversation, 201);
      if (url.endsWith("/messages/") && options.method === "POST") {
        const customerMessage = {
          id: "1f57ceac-38c8-41ee-a96e-a833988efdd8",
          role: "customer",
          content: "قیمت مدل X200 چقدر است؟",
          created_at: "2026-08-09T12:00:00Z",
        };
        const assistantMessage = {
          id: "74f237eb-e10d-46a2-b346-da99d20ef8a2",
          role: "assistant",
          content: "هنوز اطلاعات قیمت مدل X200 را در اختیار ندارم.",
          created_at: "2026-08-09T12:00:01Z",
        };
        return eventStreamResponse([
          { event: "customer", data: { message: customerMessage, ai_status: "thinking" } },
          { event: "delta", data: { delta: "هنوز اطلاعات قیمت مدل X200 " } },
          { event: "delta", data: { delta: "را در اختیار ندارم." } },
          {
            event: "completed",
            data: {
              customer_message: customerMessage,
              assistant_message: assistantMessage,
              ai_status: "completed",
            },
          },
        ]);
      }
      if (url.endsWith("/close/") && options.method === "POST") return emptyResponse();
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "شروع" }));

    expect(await screen.findByText(/خیلی خوب، من آماده‌ام/)).toBeTruthy();
    const messageScroller = screen.getByLabelText("پیام‌های گفتگو");
    expect(messageScroller).toBeTruthy();
    expect(messageScroller.className).toContain("min-h-0");
    expect(messageScroller.className).toContain("overflow-y-auto");
    expect(messageScroller.className).toContain("touch-pan-y");
    const sessionRequest = fetchMock.mock.calls.find(
      ([url, options = {}]) => url === "/api/v1/sessions/" && options.method === "POST",
    );
    expect(JSON.parse(sessionRequest[1].body)).toEqual({});
    const composer = screen.getByLabelText("متن پیام");
    await user.type(composer, "قیمت مدل X200 چقدر است؟");
    await user.click(screen.getByRole("button", { name: "ارسال پیام" }));

    const message = await screen.findByText("قیمت مدل X200 چقدر است؟");
    expect(message.getAttribute("dir")).toBe("auto");
    const customerMessageRow = message.closest("article");
    expect(customerMessageRow.getAttribute("dir")).toBe("ltr");
    expect(customerMessageRow.className).toContain("justify-end");
    expect(customerMessageRow.querySelector("img.customer-avatar")).not.toBeNull();
    expect(customerMessageRow.querySelector("img.assistant-avatar")).toBeNull();
    const assistantMessage = await screen.findByText("هنوز اطلاعات قیمت مدل X200 را در اختیار ندارم.");
    const assistantMessageRow = assistantMessage.closest("article");
    expect(assistantMessageRow.getAttribute("dir")).toBe("ltr");
    expect(assistantMessageRow.className).toContain("justify-start");
    const assistantCharacter = assistantMessageRow.querySelector("img.assistant-avatar");
    expect(assistantCharacter).not.toBeNull();
    expect(assistantCharacter.getAttribute("src")).toContain("customer-guide-avatar");
    expect(assistantMessageRow.querySelector("img.customer-avatar")).toBeNull();
    const streamRequest = fetchMock.mock.calls.find(
      ([url, options = {}]) => url.endsWith("/messages/") && options.method === "POST",
    );
    expect(streamRequest[1].headers.Accept).toBe("text/event-stream, application/json");

    await user.click(screen.getByRole("button", { name: "چت جدید" }));
    const resetDialog = screen.getByRole("dialog", { name: "گفتگوی فعلی پایان یابد؟" });
    expect(resetDialog.parentElement.className).toContain("dialog-backdrop");
    expect(resetDialog.parentElement.className).toContain("place-items-center");
    expect(resetDialog.parentElement.parentElement).toBe(document.body);
    await user.click(screen.getByRole("button", { name: "شروع چت جدید" }));

    expect(await screen.findByText("سلام، من مشاور هوشمند مگاتایت هستم.")).toBeTruthy();
    expect(screen.queryByText("قیمت مدل X200 چقدر است؟")).toBeNull();
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/close/"))).toBe(true));
  });
});
