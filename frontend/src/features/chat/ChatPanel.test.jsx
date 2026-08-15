// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  sendMessageStream: vi.fn(),
  startSession: vi.fn(),
}));

vi.mock("../../services/api", () => {
  class ApiError extends Error {
    constructor(message, status, data = null) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.data = data;
    }
  }

  return {
    ApiError,
    api: {
      sendMessageStream: apiMocks.sendMessageStream,
      startSession: apiMocks.startSession,
    },
  };
});

import {
  ACTIVE_NETWORK_STATUSES,
  COMPOSER_MAX_HEIGHT_PX,
  COMPOSER_MIN_HEIGHT_PX,
  STARTER_QUESTIONS,
  createClientRequestId,
  getAssistantAvatarMood,
  getComposerHeight,
  isActiveNetworkStatus,
  isNearMessageBottom,
  isRetryableTurnError,
  mergeMessagesById,
  shouldSubmitOnEnter,
} from "./ChatPanel";
import ChatPanel from "./ChatPanel";
import { ApiError } from "../../services/api";


const baseConversation = {
  id: "30d117a4-924c-4490-a202-5def926ad914",
  started_at: "2026-08-11T12:00:00Z",
  messages: [],
};


function ChatHarness({ online = true }) {
  const [conversation, setConversation] = useState(baseConversation);

  return (
    <ChatPanel
      conversation={conversation}
      online={online}
      onConversationChange={setConversation}
      onNewCustomer={vi.fn()}
      onReset={vi.fn()}
      onSessionExpired={vi.fn()}
    />
  );
}


afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});


describe("ChatPanel layout helpers", () => {
  it("follows streaming only while the customer remains near the bottom", () => {
    expect(isNearMessageBottom({ scrollHeight: 1000, scrollTop: 505, clientHeight: 400 })).toBe(true);
    expect(isNearMessageBottom({ scrollHeight: 1000, scrollTop: 504, clientHeight: 400 })).toBe(false);
    expect(isNearMessageBottom({ scrollHeight: 1000, scrollTop: 250, clientHeight: 400 })).toBe(false);
  });

  it("keeps the composer between its touch-friendly minimum and maximum heights", () => {
    expect(getComposerHeight(20)).toBe(COMPOSER_MIN_HEIGHT_PX);
    expect(getComposerHeight(92)).toBe(92);
    expect(getComposerHeight(220)).toBe(COMPOSER_MAX_HEIGHT_PX);
  });

  it("does not submit Enter while Persian text composition is active", () => {
    expect(shouldSubmitOnEnter({
      key: "Enter",
      shiftKey: false,
      keyCode: 13,
      nativeEvent: { isComposing: true },
    })).toBe(false);
    expect(shouldSubmitOnEnter({
      key: "Enter",
      shiftKey: true,
      keyCode: 13,
      nativeEvent: { isComposing: false },
    })).toBe(false);
    expect(shouldSubmitOnEnter({
      key: "Enter",
      shiftKey: false,
      keyCode: 13,
      nativeEvent: { isComposing: false },
    })).toBe(true);
    expect(shouldSubmitOnEnter({
      key: "Enter",
      shiftKey: false,
      keyCode: 229,
      nativeEvent: { isComposing: false },
    })).toBe(false);
    expect(shouldSubmitOnEnter({
      key: "Tab",
      shiftKey: false,
      keyCode: 9,
      nativeEvent: { isComposing: false },
    })).toBe(false);
  });

  it("recognizes only network-active turn phases", () => {
    ACTIVE_NETWORK_STATUSES.forEach((status) => {
      expect(isActiveNetworkStatus(status)).toBe(true);
    });
    expect(isActiveNetworkStatus("failed")).toBe(false);
    expect(isActiveNetworkStatus("completed")).toBe(false);
    expect(isActiveNetworkStatus(undefined)).toBe(false);
  });

  it("maps conversation state and answer tone to deterministic adviser expressions", () => {
    expect(getAssistantAvatarMood({ avatarMood: "greeting" })).toBe("greeting");
    expect(getAssistantAvatarMood({ streaming: true })).toBe("curious");
    expect(getAssistantAvatarMood({ failed: true })).toBe("careful");
    expect(getAssistantAvatarMood({ content: "اطلاعات کافی درباره این مورد در اختیارم نیست." })).toBe("careful");
    expect(getAssistantAvatarMood({ content: "بله، این محصول برای این کاربرد مناسب است." })).toBe("happy");
    expect(getAssistantAvatarMood({ content: "جنس سطح موردنظر شما چیست؟" })).toBe("curious");
    expect(getAssistantAvatarMood({ content: "زمان پخت اولیه ۱۲ ساعت است." })).toBe("neutral");
  });

  it("uses explicit server retry guidance and safe transport fallbacks", () => {
    expect(isRetryableTurnError(new ApiError("try", 400, { retryable: true }))).toBe(true);
    expect(isRetryableTurnError(new ApiError("stop", 503, { retryable: false }))).toBe(false);
    expect(isRetryableTurnError(new ApiError("offline", 0))).toBe(true);
    expect(isRetryableTurnError(new ApiError("server", 502))).toBe(true);
    expect(isRetryableTurnError(new ApiError("invalid", 400))).toBe(false);
  });

  it("merges saved messages without duplicating a retried customer message", () => {
    const customer = { id: "customer-1", role: "customer", content: "سلام" };
    const assistant = { id: "assistant-1", role: "assistant", content: "درود" };

    expect(mergeMessagesById([customer], customer, assistant)).toEqual([customer, assistant]);
  });

  it("creates backend-safe UUID request identifiers", () => {
    expect(createClientRequestId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});


describe("ChatPanel turn experience", () => {
  it("offers starter questions once and blocks a duplicate send while thinking", async () => {
    apiMocks.sendMessageStream.mockImplementation(async (_conversationId, _payload, handlers) => {
      handlers.onCustomer({
        message: {
          id: "customer-starter",
          role: "customer",
          content: STARTER_QUESTIONS[0],
          created_at: "2026-08-11T12:01:00Z",
        },
      });
      return new Promise(() => {});
    });
    render(<ChatHarness />);

    const firstPrompt = screen.getByRole("button", { name: STARTER_QUESTIONS[0] });
    const secondPrompt = screen.getByRole("button", { name: STARTER_QUESTIONS[1] });
    fireEvent.click(firstPrompt);
    fireEvent.click(secondPrompt);

    await waitFor(() => expect(apiMocks.sendMessageStream).toHaveBeenCalledTimes(1));
    expect(apiMocks.sendMessageStream.mock.calls[0][1]).toMatchObject({
      content: STARTER_QUESTIONS[0],
    });
    expect(apiMocks.sendMessageStream.mock.calls[0][1].clientRequestId).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
    expect(screen.queryByText("می‌توانید گفتگو را با یکی از این سؤال‌ها شروع کنید:")).toBeNull();
    expect(screen.getByText("یک لحظه، دارم اطلاعات مرتبط را بررسی می‌کنم")).toBeTruthy();
    expect(document.querySelector('.chat-status-pill')).toBeNull();
    expect(document.querySelector('img[data-avatar-mood="curious"]')).not.toBeNull();
    expect(document.querySelector(".chat-surface").getAttribute("aria-busy")).toBe("true");
  });

  it("preserves a partial answer and retries with the same idempotency key", async () => {
    const question = "زمان پخت مگاتایت S چقدر است؟";
    const savedCustomer = {
      id: "saved-customer",
      role: "customer",
      content: question,
      created_at: "2026-08-11T12:02:00Z",
    };
    const savedAssistant = {
      id: "saved-assistant",
      role: "assistant",
      content: "در دمای ۲۵ درجه، زمان پخت اولیه طبق سند محصول اعلام می‌شود.",
      created_at: "2026-08-11T12:02:02Z",
    };

    apiMocks.sendMessageStream
      .mockImplementationOnce(async (_conversationId, _payload, handlers) => {
        handlers.onCustomer({ message: savedCustomer });
        handlers.onDelta("در دمای ۲۵ درجه، ");
        throw new ApiError("ارتباط هنگام دریافت پاسخ قطع شد.", 502, { retryable: true });
      })
      .mockImplementationOnce(async (_conversationId, _payload, handlers) => {
        handlers.onCustomer({ message: savedCustomer });
        handlers.onDelta(savedAssistant.content);
        return {
          customer_message: savedCustomer,
          assistant_message: savedAssistant,
        };
      });

    const user = userEvent.setup();
    const view = render(<ChatHarness />);
    await user.type(screen.getByLabelText("متن پیام"), question);
    await user.click(screen.getByRole("button", { name: "ارسال پیام" }));

    expect((await screen.findByRole("alert")).textContent).toContain("ارتباط هنگام دریافت پاسخ قطع شد.");
    expect(screen.getByText("در دمای ۲۵ درجه،")).toBeTruthy();
    expect(screen.getAllByText(question)).toHaveLength(1);
    expect(screen.getByLabelText("متن پیام").disabled).toBe(true);
    expect(screen.getByLabelText("متن پیام").placeholder).toContain("تلاش دوباره");
    const firstRequestId = apiMocks.sendMessageStream.mock.calls[0][1].clientRequestId;

    view.rerender(<ChatHarness online={false} />);
    expect(screen.getByRole("button", { name: "تلاش دوباره" }).disabled).toBe(true);
    expect(screen.getByText("برای تلاش دوباره، اتصال اینترنت را برقرار کنید.")).toBeTruthy();

    view.rerender(<ChatHarness online />);
    await user.click(screen.getByRole("button", { name: "تلاش دوباره" }));

    await waitFor(() => expect(apiMocks.sendMessageStream).toHaveBeenCalledTimes(2));
    expect(apiMocks.sendMessageStream.mock.calls[1][1].clientRequestId).toBe(firstRequestId);
    expect(await screen.findByText(savedAssistant.content)).toBeTruthy();
    expect(screen.getAllByText(question)).toHaveLength(1);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("متن پیام").disabled).toBe(false);
  });
});
