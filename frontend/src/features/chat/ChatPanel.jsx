import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import customerAvatar from "../../assets/customer-avatar.webp";
import customerGuideAvatar from "../../assets/customer-guide-avatar.webp";
import customerGuideCareful from "../../assets/customer-guide-careful.webp";
import customerGuideCurious from "../../assets/customer-guide-curious.webp";
import customerGuideGreeting from "../../assets/customer-guide-greeting.webp";
import customerGuideHappy from "../../assets/customer-guide-happy.webp";
import Dialog from "../../components/Dialog";
import { Icon } from "../../components/Icons";
import MessageContent from "../../components/MessageContent";
import useIdleTimeout from "../../hooks/useIdleTimeout";
import { ApiError, api } from "../../services/api";


export const IDLE_INACTIVITY_MS = 45 * 1000;
export const IDLE_WARNING_MS = 15 * 1000;
export const MESSAGE_BOTTOM_THRESHOLD_PX = 96;
export const COMPOSER_MIN_HEIGHT_PX = 56;
export const COMPOSER_MAX_HEIGHT_PX = 128;
export const ACTIVE_NETWORK_STATUSES = ["sending", "thinking", "streaming"];
export const ASSISTANT_AVATAR_MOODS = ["neutral", "greeting", "curious", "happy", "careful"];
export const STARTER_QUESTIONS = [
  "برای نمای ساختمان چه چسبی پیشنهاد می‌کنید؟",
  "تفاوت مگاتایت S و C چیست؟",
  "زمان پخت مگاتایت S در دمای ۲۵ درجه چقدر است؟",
  "برای نصب سنگ در فضای باز چه نکاتی مهم است؟",
];

const ASSISTANT_AVATAR_BY_MOOD = {
  neutral: customerGuideAvatar,
  greeting: customerGuideGreeting,
  curious: customerGuideCurious,
  happy: customerGuideHappy,
  careful: customerGuideCareful,
};

const CAREFUL_ANSWER_HINTS = [
  "اطلاعات کافی",
  "در اختیارم نیست",
  "در اختیار ندارم",
  "در اختیار نیست",
  "نیاز به بررسی",
  "تأیید فنی",
  "تأیید مهندس",
  "مهندس سازه",
  "ایمن‌سازی",
  "مجاز نیست",
  "توصیه نمی‌شود",
  "اعلام نشده",
  "مشخص نشده",
];

const HAPPY_ANSWER_HINTS = [
  "بله،",
  "بله؛",
  "مناسب است",
  "گزینه مناسبی",
  "انتخاب خوبی",
  "پیشنهاد مناسبی",
];


export function isNearMessageBottom({ scrollHeight, scrollTop, clientHeight }) {
  return scrollHeight - scrollTop - clientHeight < MESSAGE_BOTTOM_THRESHOLD_PX;
}


export function getComposerHeight(scrollHeight) {
  return Math.max(
    COMPOSER_MIN_HEIGHT_PX,
    Math.min(scrollHeight, COMPOSER_MAX_HEIGHT_PX),
  );
}


export function shouldSubmitOnEnter(event) {
  return event.key === "Enter"
    && !event.shiftKey
    && !event.nativeEvent?.isComposing
    && event.keyCode !== 229;
}


export function isActiveNetworkStatus(status) {
  return ACTIVE_NETWORK_STATUSES.includes(status);
}


export function getAssistantAvatarMood(message) {
  if (ASSISTANT_AVATAR_MOODS.includes(message?.avatarMood)) return message.avatarMood;
  if (message?.failed) return "careful";
  if (message?.streaming) return "curious";

  const content = String(message?.content || "").trim();
  if (CAREFUL_ANSWER_HINTS.some((hint) => content.includes(hint))) return "careful";
  if (HAPPY_ANSWER_HINTS.some((hint) => content.includes(hint))) return "happy";
  if (/[؟?]\s*$/.test(content)) return "curious";
  return "neutral";
}


export function isRetryableTurnError(error) {
  if (typeof error?.data?.retryable === "boolean") return error.data.retryable;
  return !error?.status
    || error.status >= 500
    || [408, 409, 425, 429].includes(error.status);
}


export function mergeMessagesById(currentMessages, ...newMessages) {
  const merged = [...currentMessages];
  const messageIds = new Set(currentMessages.map((message) => message?.id).filter(Boolean));

  newMessages.filter(Boolean).forEach((message) => {
    if (!message.id || !messageIds.has(message.id)) {
      merged.push(message);
      if (message.id) messageIds.add(message.id);
    }
  });
  return merged;
}


export function createClientRequestId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}


function ThinkingIndicator() {
  return (
    <div className="thinking-indicator" aria-hidden="true">
      <span className="thinking-spark"><Icon name="sparkles" size={18} /></span>
      <span className="thinking-label">یک لحظه، دارم اطلاعات مرتبط را بررسی می‌کنم</span>
      <span className="thinking-dots">
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}


function AssistantAvatar({ className, mood = "neutral" }) {
  const safeMood = ASSISTANT_AVATAR_MOODS.includes(mood) ? mood : "neutral";

  return (
    <img
      alt=""
      aria-hidden="true"
      className={`${className} assistant-avatar-mood assistant-avatar-mood-${safeMood}`}
      data-avatar-mood={safeMood}
      key={safeMood}
      src={ASSISTANT_AVATAR_BY_MOOD[safeMood]}
    />
  );
}


function MessageBubble({ message }) {
  const customer = message.role === "customer";
  const assistantMood = customer ? null : getAssistantAvatarMood(message);
  const time = !message.local && message.created_at
    ? new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" }).format(new Date(message.created_at))
    : "";

  return (
    <article className={`message-row flex w-full min-w-0 items-end ${customer ? "justify-end" : "justify-start"}`} dir="ltr">
      {!customer && (
        <AssistantAvatar
          className="message-avatar assistant-avatar shrink-0 object-contain object-bottom"
          mood={assistantMood}
        />
      )}
      <div
        className={`message-bubble ${message.streaming ? "message-streaming" : ""} ${message.failed ? "message-incomplete" : ""} ${
          customer
            ? "message-customer rounded-[1.4rem] rounded-tr-md text-white"
            : "message-assistant rounded-[1.4rem] rounded-tl-md border border-slate-200/80 bg-white text-slate-800"
        }`}
      >
        {message.streaming && !message.content ? (
          <ThinkingIndicator />
        ) : (
          <MessageContent content={message.content} formatted={!customer} />
        )}
        {message.streaming && message.content && (
          <div className="streaming-progress" aria-hidden="true">
            <span className="streaming-progress-dot" />
            پاسخ در حال تکمیل است
          </div>
        )}
        {message.failed && message.content && (
          <div className="incomplete-response-note">این بخش از پاسخ پیش از قطع ارتباط دریافت شد.</div>
        )}
        {time && (
          <time className={`mt-1.5 block text-[11px] ${customer ? "text-slate-300" : "text-slate-400"}`} dateTime={message.created_at}>
            {time}
          </time>
        )}
      </div>
      {customer && (
        <img
          alt=""
          aria-hidden="true"
          className="message-avatar customer-avatar shrink-0 object-contain object-bottom"
          src={customerAvatar}
        />
      )}
    </article>
  );
}


function StarterQuestions({ disabled, onSelect }) {
  return (
    <section className="starter-prompts" aria-labelledby="starter-prompts-title">
      <div className="starter-prompts-heading">
        <Icon name="sparkles" size={18} />
        <h2 id="starter-prompts-title">می‌توانید گفتگو را با یکی از این سؤال‌ها شروع کنید:</h2>
      </div>
      <div className="starter-prompts-grid">
        {STARTER_QUESTIONS.map((question) => (
          <button
            className="starter-prompt touch-button"
            disabled={disabled}
            key={question}
            onClick={() => onSelect(question)}
            type="button"
          >
            <span>{question}</span>
            <Icon name="arrowLeft" size={18} />
          </button>
        ))}
      </div>
    </section>
  );
}


function TurnFailure({ online, turn, onEdit, onRetry }) {
  return (
    <div className="turn-error-card" role="alert">
      <span className="turn-error-icon"><Icon name="warning" size={20} /></span>
      <div className="min-w-0 flex-1">
        <strong className="block text-[15px] font-black text-rose-900">پاسخ کامل نشد</strong>
        <p className="mt-1 text-sm leading-6 text-rose-800">{turn.errorMessage}</p>
        {!online && turn.retryable && (
          <p className="mt-1 text-xs font-bold leading-5 text-rose-700">برای تلاش دوباره، اتصال اینترنت را برقرار کنید.</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {turn.retryable && (
            <button
              className="turn-action turn-action-primary touch-button"
              disabled={!online}
              onClick={onRetry}
              type="button"
            >
              <Icon name="refresh" size={17} />
              تلاش دوباره
            </button>
          )}
          <button className="turn-action touch-button" onClick={onEdit} type="button">
            ویرایش سؤال
          </button>
        </div>
      </div>
    </div>
  );
}


function IntakeScene({ busy, error, onStart, online }) {
  return (
    <main className="intake-stage mx-auto grid min-h-0 w-full max-w-6xl flex-1 place-items-center overflow-y-auto p-4 sm:p-8">
      <section className="intake-popover" aria-label="شروع گفتگوی مشتری">
        <AssistantAvatar
          className="intake-character"
          mood="greeting"
        />

        <div className="intake-thought-card" aria-live="polite">
          <div className="intake-card-content text-center sm:text-right">
            <h1 className="text-xl font-black leading-9 text-slate-900 sm:text-2xl">سلام، من مشاور هوشمند مگاتایت هستم.</h1>
            <p className="mt-2 text-base font-bold leading-8 text-slate-600 sm:text-lg">بریم باهم گپ بزنیم؟</p>

            {error && (
              <div className="mt-4 flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700" role="alert">
                <Icon name="warning" size={18} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              className="start-chat-button-3d touch-button mx-auto mt-6 inline-flex min-h-16 min-w-44 items-center justify-center gap-3 rounded-[1.35rem] px-8 text-lg font-black text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/30 disabled:cursor-not-allowed disabled:opacity-45 sm:mx-0"
              disabled={busy || !online}
              onClick={onStart}
              type="button"
            >
              {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="send" size={22} />}
              <span>{busy ? "در حال آماده‌سازی…" : "شروع"}</span>
            </button>

            {!online && <p className="mt-4 text-sm font-bold text-rose-600" role="status">اتصال شبکه برقرار نیست.</p>}
          </div>
        </div>
      </section>
    </main>
  );
}


export default function ChatPanel({ conversation, onConversationChange, onNewCustomer, onReset, onSessionExpired, online }) {
  const [content, setContent] = useState("");
  const [starting, setStarting] = useState(false);
  const [intakeError, setIntakeError] = useState("");
  const [activeTurn, setActiveTurn] = useState(null);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const shouldFollowScrollRef = useRef(true);
  const previousConversationIdRef = useRef(conversation?.id || null);
  const streamControllerRef = useRef(null);
  const turnInFlightRef = useRef(false);
  const activeNetworkTurn = isActiveNetworkStatus(activeTurn?.status);

  const resizeComposer = useCallback((textarea) => {
    if (!textarea) return;
    textarea.style.height = "auto";
    const nextHeight = getComposerHeight(textarea.scrollHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > COMPOSER_MAX_HEIGHT_PX
      ? "auto"
      : "hidden";
  }, []);

  const handleMessageScroll = useCallback((event) => {
    const scrollContainer = event.currentTarget;
    shouldFollowScrollRef.current = isNearMessageBottom(scrollContainer);
  }, []);

  const resetLocalFlow = useCallback(() => {
    streamControllerRef.current?.abort();
    streamControllerRef.current = null;
    turnInFlightRef.current = false;
    setContent("");
    setActiveTurn(null);
    setIntakeError("");
    setStarting(false);
  }, []);

  useEffect(() => {
    const currentConversationId = conversation?.id || null;
    if (previousConversationIdRef.current !== currentConversationId) {
      resetLocalFlow();
      shouldFollowScrollRef.current = true;
    }
    previousConversationIdRef.current = currentConversationId;
  }, [conversation, resetLocalFlow]);

  useEffect(() => () => streamControllerRef.current?.abort(), []);

  useEffect(() => {
    if (typeof globalThis.Image !== "function") return;
    Object.values(ASSISTANT_AVATAR_BY_MOOD).forEach((source) => {
      const image = new globalThis.Image();
      image.src = source;
    });
  }, []);

  const handleIdleTimeout = useCallback(() => {
    const conversationId = conversation?.id;
    resetLocalFlow();
    onReset(conversationId);
  }, [conversation?.id, onReset, resetLocalFlow]);

  const { warningOpen, secondsLeft, stayActive } = useIdleTimeout({
    enabled: Boolean(conversation) && !activeNetworkTurn,
    idleMs: IDLE_INACTIVITY_MS,
    warningMs: IDLE_WARNING_MS,
    onTimeout: handleIdleTimeout,
  });

  const pendingMessages = useMemo(() => {
    if (!activeTurn || activeTurn.status === "completed") return [];

    const existingIds = new Set((conversation?.messages || []).map((message) => message.id));
    const customerMessage = activeTurn.customerMessage || {
      id: `pending-customer-${activeTurn.requestId}`,
      role: "customer",
      content: activeTurn.content,
      local: true,
    };
    const messages = existingIds.has(customerMessage.id) ? [] : [customerMessage];

    if (["thinking", "streaming"].includes(activeTurn.status)) {
      messages.push({
        id: `pending-assistant-${activeTurn.requestId}`,
        role: "assistant",
        content: activeTurn.partialAnswer,
        local: true,
        streaming: true,
        avatarMood: "curious",
      });
    } else if (activeTurn.status === "failed" && activeTurn.partialAnswer) {
      messages.push({
        id: `partial-assistant-${activeTurn.requestId}`,
        role: "assistant",
        content: activeTurn.partialAnswer,
        failed: true,
        local: true,
        avatarMood: "careful",
      });
    }
    return messages;
  }, [activeTurn, conversation?.messages]);

  const displayMessages = useMemo(() => {
    if (!conversation) return [];

    return [
      {
        id: `conversation-${conversation.id}-welcome`,
        role: "assistant",
        content: "خیلی خوب، من آماده‌ام 😊\nچه سؤالی دارید؟",
        created_at: conversation.started_at,
        local: true,
        avatarMood: "greeting",
      },
      ...(conversation.messages || []),
      ...pendingMessages,
    ];
  }, [conversation, pendingMessages]);

  const hasCustomerTurn = Boolean(
    conversation?.messages?.some((message) => message.role === "customer")
    || activeTurn?.content,
  );
  const showStarterQuestions = Boolean(
    conversation
    && !hasCustomerTurn
    && !content.trim()
    && !activeNetworkTurn,
  );

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (scrollContainer && shouldFollowScrollRef.current) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }, [displayMessages]);

  useEffect(() => {
    resizeComposer(inputRef.current);
  }, [content, resizeComposer]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [conversation?.id]);

  const startConversation = async () => {
    if (starting || !online) return;

    setIntakeError("");
    setStarting(true);
    try {
      const newConversation = await api.startSession({});
      onConversationChange(newConversation);
    } catch (requestError) {
      if (requestError instanceof ApiError && [401, 403].includes(requestError.status)) {
        onSessionExpired();
        return;
      }
      setIntakeError(requestError.message || "شروع گفتگو انجام نشد. لطفاً دوباره تلاش کنید.");
    } finally {
      setStarting(false);
    }
  };

  const runTurn = async ({ question, requestId, customerMessage = null }) => {
    if (!question.trim() || turnInFlightRef.current || !conversation || !online) return;

    const trimmedQuestion = question.trim();
    let savedCustomerMessage = customerMessage;
    let partialAnswer = "";
    const controller = new AbortController();
    turnInFlightRef.current = true;
    streamControllerRef.current = controller;
    shouldFollowScrollRef.current = true;
    setContent("");
    setActiveTurn({
      requestId,
      content: trimmedQuestion,
      status: "sending",
      customerMessage: savedCustomerMessage,
      partialAnswer: "",
      errorMessage: "",
      retryable: true,
    });

    try {
      const result = await api.sendMessageStream(
        conversation.id,
        { content: trimmedQuestion, clientRequestId: requestId },
        {
          onCustomer: ({ message }) => {
            savedCustomerMessage = message;
            setActiveTurn((current) => current?.requestId === requestId ? {
              ...current,
              status: "thinking",
              customerMessage: message,
            } : current);
          },
          onDelta: (delta) => {
            partialAnswer += delta;
            setActiveTurn((current) => current?.requestId === requestId ? {
              ...current,
              status: "streaming",
              partialAnswer,
            } : current);
          },
        },
        controller.signal,
      );
      const finalCustomerMessage = savedCustomerMessage || result.customer_message;
      onConversationChange({
        ...conversation,
        messages: mergeMessagesById(
          conversation.messages || [],
          finalCustomerMessage,
          result.assistant_message,
        ),
      });
      setActiveTurn((current) => current?.requestId === requestId ? {
        ...current,
        status: "completed",
        customerMessage: finalCustomerMessage,
        partialAnswer: result.assistant_message?.content || partialAnswer,
      } : current);
    } catch (requestError) {
      if (requestError.name === "AbortError") return;
      if (requestError instanceof ApiError && [401, 403].includes(requestError.status)) {
        onSessionExpired();
        return;
      }
      if (savedCustomerMessage) {
        onConversationChange({
          ...conversation,
          messages: mergeMessagesById(conversation.messages || [], savedCustomerMessage),
        });
      }
      setActiveTurn((current) => current?.requestId === requestId ? {
        ...current,
        status: "failed",
        customerMessage: savedCustomerMessage,
        partialAnswer,
        errorMessage: requestError.message || "در دریافت پاسخ مشکلی پیش آمد. سؤال شما از بین نرفته است.",
        retryable: isRetryableTurnError(requestError),
      } : current);
    } finally {
      if (streamControllerRef.current === controller) {
        streamControllerRef.current = null;
        turnInFlightRef.current = false;
      }
    }
  };

  const submitMessage = (event) => {
    event.preventDefault();
    if (!content.trim() || activeNetworkTurn || !conversation) return;
    runTurn({ question: content, requestId: createClientRequestId() });
  };

  const retryTurn = () => {
    if (activeTurn?.status !== "failed" || !activeTurn.retryable || !online) return;
    runTurn({
      question: activeTurn.content,
      requestId: activeTurn.requestId,
      customerMessage: activeTurn.customerMessage,
    });
  };

  const editFailedQuestion = () => {
    if (activeTurn?.status !== "failed") return;
    setContent(activeTurn.content);
    setActiveTurn(null);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const selectStarterQuestion = (question) => {
    if (activeNetworkTurn || !online) return;
    runTurn({ question, requestId: createClientRequestId() });
  };

  const handleTextareaKeyDown = (event) => {
    if (shouldSubmitOnEnter(event)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const handleContentChange = (event) => {
    setContent(event.target.value);
    resizeComposer(event.currentTarget);
  };

  const statusText = !online
    ? "اتصال شبکه قطع است"
    : activeTurn?.status === "sending"
      ? "سؤال در حال ارسال است"
      : activeTurn?.status === "thinking"
        ? "در حال بررسی اطلاعات مرتبط"
        : activeTurn?.status === "streaming"
          ? "پاسخ در حال آماده‌شدن است"
          : activeTurn?.status === "failed"
            ? "دریافت پاسخ کامل نشد"
            : activeTurn?.status === "completed"
              ? "پاسخ آماده شد"
              : "";
  const failedTurnPending = activeTurn?.status === "failed";
  const composerDisabled = activeNetworkTurn || failedTurnPending || !online;
  const composerPlaceholder = !online
    ? "اتصال شبکه برقرار نیست"
    : failedTurnPending
      ? "ابتدا «تلاش دوباره» یا «ویرایش سؤال» را انتخاب کنید"
      : "سؤالتان را بنویسید…";

  return (
    <>
      {!conversation ? (
        <IntakeScene
          busy={starting}
          error={intakeError}
          onStart={startConversation}
          online={online}
        />
      ) : (
        <main className="chat-stage mx-auto flex min-h-0 w-full max-w-[88rem] flex-1 flex-col overflow-hidden p-2.5 sm:p-5 lg:p-7">
          <p className="sr-only" aria-atomic="true" aria-live="polite" role="status">{statusText}</p>
          <div className="chat-frame flex min-h-0 flex-1">
            <section aria-busy={activeNetworkTurn} className="chat-surface relative z-[1] flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-[2rem]">
              <header className="chat-toolbar relative z-[5] flex shrink-0 items-center justify-between gap-3 px-3 py-3 sm:px-5 sm:py-4" dir="ltr">
                <button className="new-customer-button touch-button inline-flex items-center gap-2 rounded-2xl px-4 text-[15px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:px-5 sm:text-base" disabled={activeNetworkTurn} onClick={onNewCustomer} type="button">
                  <Icon name="refresh" size={19} />
                  چت جدید
                </button>
              </header>

              <div
                className="chat-scroll min-h-0 flex-1 touch-pan-y overscroll-contain overflow-y-auto px-3 py-5 sm:px-7 sm:py-7 lg:px-10"
                aria-label="پیام‌های گفتگو"
                onScroll={handleMessageScroll}
                ref={scrollRef}
              >
                <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 sm:gap-6">
                  {displayMessages.map((message) => <MessageBubble key={message.id} message={message} />)}
                  {showStarterQuestions && (
                    <StarterQuestions disabled={!online} onSelect={selectStarterQuestion} />
                  )}
                </div>
              </div>

              <footer className="composer-dock shrink-0 border-t border-white/10 px-3 pb-3 pt-3 sm:px-6 sm:pb-5 sm:pt-4">
                <div className="mx-auto w-full max-w-4xl">
                  {activeTurn?.status === "failed" && (
                    <TurnFailure
                      online={online}
                      onEdit={editFailedQuestion}
                      onRetry={retryTurn}
                      turn={activeTurn}
                    />
                  )}

                  <form className="chat-composer flex items-end gap-2.5 rounded-[1.4rem] border border-white/60 bg-white p-2 transition focus-within:border-cyan-300 focus-within:ring-4 focus-within:ring-cyan-300/20" onSubmit={submitMessage}>
                    <textarea
                      aria-label="متن پیام"
                      autoFocus
                      className="chat-input max-h-32 min-h-14 min-w-0 flex-1 resize-none bg-transparent px-3 py-3.5 text-base leading-7 outline-none placeholder:text-slate-400 sm:px-4 sm:text-[17px] sm:leading-8"
                      disabled={composerDisabled}
                      enterKeyHint="send"
                      maxLength={2000}
                      onChange={handleContentChange}
                      onKeyDown={handleTextareaKeyDown}
                      placeholder={composerPlaceholder}
                      ref={inputRef}
                      rows={1}
                      value={content}
                    />

                    <button
                      aria-label="ارسال پیام"
                      className="send-button-3d grid h-14 w-14 shrink-0 place-items-center rounded-[1.1rem] text-white transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/25 disabled:cursor-not-allowed disabled:opacity-40 sm:h-16 sm:w-16"
                      disabled={composerDisabled || !content.trim()}
                      type="submit"
                    >
                      {activeNetworkTurn ? <span className="spinner" aria-hidden="true" /> : <Icon name="send" size={22} />}
                    </button>
                  </form>
                </div>
              </footer>
            </section>
          </div>
        </main>
      )}

      <Dialog
        cancelLabel="شروع چت جدید"
        confirmLabel="ادامه گفتگو"
        description="اگر هنوز مشغول گفتگو هستید، ادامه گفتگو را بزنید؛ در غیر این صورت برای حفظ حریم خصوصی، چت جدید به‌طور خودکار شروع می‌شود."
        onCancel={handleIdleTimeout}
        onConfirm={stayActive}
        open={warningOpen}
        title="هنوز اینجا هستید؟"
        tone="primary"
      >
        <div className="rounded-2xl bg-amber-50 p-4 text-center text-amber-900">
          <strong className="text-2xl tabular-nums">{secondsLeft}</strong>
          <span className="mr-2 text-sm">ثانیه تا شروع چت جدید</span>
        </div>
      </Dialog>
    </>
  );
}
