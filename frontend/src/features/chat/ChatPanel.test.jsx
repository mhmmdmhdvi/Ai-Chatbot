// @vitest-environment jsdom

import { useCallback, useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  saveCustomer: vi.fn(),
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
      saveCustomer: apiMocks.saveCustomer,
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
  customer: { id: "customer-existing", name: "محمد", phone_number: "+989121234567" },
  messages: [],
};

const noopReset = () => {};


function ChatHarness({ online = true, initialConversation = baseConversation, onReset = noopReset }) {
  const [conversation, setConversation] = useState(initialConversation);

  const resetConversation = useCallback((conversationId) => {
    setConversation(null);
    onReset(conversationId);
  }, [onReset]);

  return (
    <ChatPanel
      conversation={conversation}
      online={online}
      onConversationChange={setConversation}
      onNewCustomer={vi.fn()}
      onReset={resetConversation}
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
    expect(getAssistantAvatarMood({ streaming: true })).toBe("thinking");
    expect(getAssistantAvatarMood({ failed: true })).toBe("careful");
    expect(getAssistantAvatarMood({ content: "اطلاعات کافی درباره این مورد در اختیارم نیست." })).toBe("careful");
    expect(getAssistantAvatarMood({ content: "ممنون که با من گفتگو کردید؛ روز خوبی داشته باشید." })).toBe("goodbye");
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
  it("generates a suggested first answer behind the required contact dialog", async () => {
    const guestConversation = { ...baseConversation, customer: null };
    const savedConversation = {
      ...guestConversation,
      customer: { id: "saved-customer", name: "سارا", phone_number: "+989121234567" },
    };
    apiMocks.saveCustomer.mockResolvedValue(savedConversation);
    apiMocks.sendMessageStream.mockResolvedValue({
      customer_message: {
        id: "customer-question",
        role: "customer",
        content: STARTER_QUESTIONS[0],
      },
      assistant_message: {
        id: "assistant-answer",
        role: "assistant",
        content: "برای انتخاب دقیق، نوع نما را بفرمایید.",
      },
    });
    const user = userEvent.setup();
    render(<ChatHarness initialConversation={guestConversation} />);

    await user.click(screen.getByRole("button", { name: STARTER_QUESTIONS[0] }));

    const contactDialog = screen.getByRole("dialog", {
      name: "برای ادامه لطفا نام و شماره تماس خود را وارد کنید",
    });
    expect(contactDialog).toBeTruthy();
    expect(contactDialog.parentElement.className).toContain("backdrop-blur-md");
    expect(screen.queryByRole("button", { name: "بستن" })).toBeNull();
    expect(screen.queryByRole("button", { name: "فعلاً نه" })).toBeNull();
    expect(screen.getByRole("button", { name: "منصرف شدم" })).toBeTruthy();
    await waitFor(() => expect(apiMocks.sendMessageStream).toHaveBeenCalledTimes(1));
    expect(apiMocks.saveCustomer).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("نام"), "سارا");
    await user.type(screen.getByLabelText("شماره موبایل"), "۰۹۱۲۱۲۳۴۵۶۷");
    await user.click(screen.getByRole("button", { name: "ثبت و مشاهده پاسخ" }));

    await waitFor(() => expect(apiMocks.saveCustomer).toHaveBeenCalledWith(
      guestConversation.id,
      { name: "سارا", phone_number: "۰۹۱۲۱۲۳۴۵۶۷" },
    ));
    expect(apiMocks.sendMessageStream).toHaveBeenCalledTimes(1);
    expect(apiMocks.sendMessageStream.mock.calls[0][1].content).toBe(STARTER_QUESTIONS[0]);
    expect(screen.queryByRole("dialog", {
      name: "برای ادامه لطفا نام و شماره تماس خود را وارد کنید",
    })).toBeNull();
  });

  it("generates a manually typed first answer while the contact dialog is open", async () => {
    const guestConversation = { ...baseConversation, customer: null };
    const savedConversation = {
      ...guestConversation,
      customer: { id: "saved-customer", name: "علی", phone_number: "+989351234567" },
    };
    apiMocks.saveCustomer.mockResolvedValue(savedConversation);
    apiMocks.sendMessageStream.mockResolvedValue({
      customer_message: { id: "manual-customer", role: "customer", content: "مگاتایت C چیست؟" },
      assistant_message: { id: "manual-assistant", role: "assistant", content: "مگاتایت C یک چسب اپوکسی است." },
    });
    const user = userEvent.setup();
    render(<ChatHarness initialConversation={guestConversation} />);

    await user.type(screen.getByLabelText("متن پیام"), "مگاتایت C چیست؟");
    await user.click(screen.getByRole("button", { name: "ارسال پیام" }));

    expect(screen.getByRole("dialog", {
      name: "برای ادامه لطفا نام و شماره تماس خود را وارد کنید",
    })).toBeTruthy();
    expect(screen.getByLabelText("متن پیام").value).toBe("");
    await waitFor(() => expect(apiMocks.sendMessageStream).toHaveBeenCalledTimes(1));

    await user.type(screen.getByLabelText("نام"), "علی");
    await user.type(screen.getByLabelText("شماره موبایل"), "09351234567");
    await user.click(screen.getByRole("button", { name: "ثبت و مشاهده پاسخ" }));

    expect(apiMocks.sendMessageStream).toHaveBeenCalledTimes(1);
    expect(apiMocks.sendMessageStream.mock.calls[0][1].content).toBe("مگاتایت C چیست؟");
    expect(screen.queryByRole("dialog", {
      name: "برای ادامه لطفا نام و شماره تماس خود را وارد کنید",
    })).toBeNull();
  });

  it("cancels first-question collection, aborts generation, and returns to the start page", async () => {
    const guestConversation = { ...baseConversation, customer: null };
    const onReset = vi.fn();
    let streamSignal;
    apiMocks.sendMessageStream.mockImplementation((_conversationId, _payload, _handlers, signal) => {
      streamSignal = signal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });
    const user = userEvent.setup();
    render(<ChatHarness initialConversation={guestConversation} onReset={onReset} />);

    await user.click(screen.getByRole("button", { name: STARTER_QUESTIONS[1] }));
    expect(screen.getByRole("dialog", {
      name: "برای ادامه لطفا نام و شماره تماس خود را وارد کنید",
    })).toBeTruthy();
    await waitFor(() => expect(apiMocks.sendMessageStream).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "منصرف شدم" }));

    expect(streamSignal.aborted).toBe(true);
    expect(onReset).toHaveBeenCalledWith(guestConversation.id);
    expect(screen.queryByRole("dialog", {
      name: "برای ادامه لطفا نام و شماره تماس خود را وارد کنید",
    })).toBeNull();
    expect(screen.getByRole("button", { name: "شروع" })).toBeTruthy();
    expect(apiMocks.saveCustomer).not.toHaveBeenCalled();
  });

  it("ignores a first response that resolves after contact collection is cancelled", async () => {
    const guestConversation = { ...baseConversation, customer: null };
    let resolveStream;
    apiMocks.sendMessageStream.mockImplementation(() => new Promise((resolve) => {
      resolveStream = resolve;
    }));
    const user = userEvent.setup();
    render(<ChatHarness initialConversation={guestConversation} />);

    await user.click(screen.getByRole("button", { name: STARTER_QUESTIONS[2] }));
    await waitFor(() => expect(apiMocks.sendMessageStream).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "منصرف شدم" }));

    resolveStream({
      customer_message: {
        id: "late-customer",
        role: "customer",
        content: STARTER_QUESTIONS[2],
      },
      assistant_message: {
        id: "late-assistant",
        role: "assistant",
        content: "این پاسخ دیرهنگام نباید نمایش داده شود.",
      },
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "شروع" })).toBeTruthy());
    expect(screen.queryByText(STARTER_QUESTIONS[2])).toBeNull();
    expect(screen.queryByText("این پاسخ دیرهنگام نباید نمایش داده شود.")).toBeNull();
  });

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

    expect(screen.getByText((content, element) => (
      element.tagName === "P"
      && content.includes("برای شروع یکی از سوالات زیر رو انتخاب کنید")
    ))).toBeTruthy();
    expect(screen.getByRole("button", { name: "مگاتایت رو معرفی کن" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "مگاتایت چه کمکی به من میکند؟" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "تفاوت مگاتایت S و C چیست؟" })).toBeNull();
    expect(screen.queryByRole("button", { name: "زمان پخت مگاتایت S در دمای ۲۵ درجه چقدر است؟" })).toBeNull();

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
    expect(document.querySelector('img[data-avatar-mood="thinking"]')).not.toBeNull();
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
