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


const kioskUser = { id: 2, username: "kiosk", is_staff: false };


beforeEach(() => {
  document.cookie = "csrftoken=test-token; Path=/";
  HTMLElement.prototype.scrollIntoView = vi.fn();
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

    expect(await screen.findByRole("heading", { name: "ورود اپراتور" })).toBeTruthy();
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

  it("opens conversational customer intake after a valid kiosk login", async () => {
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

    expect(await screen.findByText(/برای شروع، لطفاً نام و نام خانوادگی‌تان را بنویسید/)).toBeTruthy();
    expect(screen.getByLabelText("نام و نام خانوادگی")).toBeTruthy();
    expect(screen.queryByText("نام، شماره و متن گفتگو در سامانه مجموعه ثبت می‌شود.")).toBeNull();
    expect(screen.queryByRole("button", { name: "خروج اپراتور" })).toBeNull();
    expect(document.querySelector("img.assistant-avatar")).not.toBeNull();
  });

  it("returns to the login gate when the kiosk session has expired", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (url === "/api/v1/auth/me/") return jsonResponse(kioskUser);
      if (url === "/api/v1/sessions/current/") return jsonResponse({ detail: "Authentication required" }, 403);
      throw new Error(`Unexpected request: ${url}`);
    }));
    render(<App />);

    expect(await screen.findByRole("heading", { name: "ورود اپراتور" })).toBeTruthy();
    expect(screen.queryByText(/برای شروع، لطفاً نام و نام خانوادگی‌تان را بنویسید/)).toBeNull();
  });

  it("does not expose operator controls on the customer screen", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (url === "/api/v1/auth/me/") return jsonResponse(kioskUser);
      if (url === "/api/v1/sessions/current/") return emptyResponse();
      throw new Error(`Unexpected request: ${url}`);
    }));
    render(<App />);

    expect(await screen.findByText(/برای شروع، لطفاً نام و نام خانوادگی‌تان را بنویسید/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "خروج اپراتور" })).toBeNull();
    expect(screen.queryByLabelText("صفحه گفتگو")).toBeNull();
  });

  it("creates a customer, stores a message, and clears the screen for the next customer", async () => {
    const conversation = {
      id: "30d117a4-924c-4490-a202-5def926ad914",
      customer: { id: "e64fb302-e68b-478f-adfe-41352601e026", name: "سارا احمدی", phone_number: "+989121234567" },
      status: "active",
      language: "fa",
      messages: [],
      ai_status: "disabled",
    };
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === "/api/v1/auth/me/") return jsonResponse(kioskUser);
      if (url === "/api/v1/sessions/current/") return emptyResponse();
      if (url === "/api/v1/sessions/" && options.method === "POST") return jsonResponse(conversation, 201);
      if (url.endsWith("/messages/") && options.method === "POST") {
        return jsonResponse({
          ai_status: "disabled",
          message: {
            id: "1f57ceac-38c8-41ee-a96e-a833988efdd8",
            role: "customer",
            content: "قیمت مدل X200 چقدر است؟",
            created_at: "2026-08-09T12:00:00Z",
          },
        }, 201);
      }
      if (url.endsWith("/close/") && options.method === "POST") return emptyResponse();
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByLabelText("نام و نام خانوادگی"), "سارا احمدی");
    await user.click(screen.getByRole("button", { name: "ادامه" }));
    expect(await screen.findByText(/ممنون سارا/)).toBeTruthy();
    await user.type(screen.getByLabelText("شماره همراه"), "09121234567");
    await user.click(screen.getByRole("button", { name: "شروع گفتگو" }));

    expect(await screen.findByText(/خیلی خوب، آماده‌ام/)).toBeTruthy();
    const composer = screen.getByLabelText("متن پیام");
    await user.type(composer, "قیمت مدل X200 چقدر است؟");
    await user.click(screen.getByRole("button", { name: "ارسال پیام" }));

    const message = await screen.findByText("قیمت مدل X200 چقدر است؟");
    expect(message.getAttribute("dir")).toBe("auto");

    await user.click(screen.getByRole("button", { name: "مشتری جدید" }));
    await user.click(screen.getByRole("button", { name: "شروع برای مشتری جدید" }));

    expect(await screen.findByText(/برای شروع، لطفاً نام و نام خانوادگی‌تان را بنویسید/)).toBeTruthy();
    expect(screen.queryByText("سارا احمدی")).toBeNull();
    expect(screen.queryByText("قیمت مدل X200 چقدر است؟")).toBeNull();
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/close/"))).toBe(true));
  });
});
