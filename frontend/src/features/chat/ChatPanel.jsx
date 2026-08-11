import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import customerAvatar from "../../assets/customer-avatar.webp";
import customerGuideAvatar from "../../assets/customer-guide-avatar.webp";
import Dialog from "../../components/Dialog";
import { Icon } from "../../components/Icons";
import MessageContent from "../../components/MessageContent";
import useIdleTimeout from "../../hooks/useIdleTimeout";
import { ApiError, api } from "../../services/api";


export const IDLE_INACTIVITY_MS = 45 * 1000;
export const IDLE_WARNING_MS = 15 * 1000;


function MessageBubble({ message }) {
  const customer = message.role === "customer";
  const time = !message.local && message.created_at
    ? new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" }).format(new Date(message.created_at))
    : "";

  return (
    <article className={`message-row flex w-full items-end gap-2.5 ${customer ? "justify-end" : "justify-start"}`} dir="ltr">
      {!customer && (
        <img
          alt=""
          aria-hidden="true"
          className="assistant-avatar h-[4.5rem] w-[4.5rem] shrink-0 object-contain object-bottom sm:h-20 sm:w-20"
          src={customerGuideAvatar}
        />
      )}
      <div
        className={`message-bubble px-5 py-3.5 ${
          customer
            ? "message-customer max-w-[86%] rounded-[1.4rem] rounded-tr-md text-white sm:max-w-[74%]"
            : "message-assistant max-w-[72%] rounded-[1.4rem] rounded-tl-md border border-slate-200/80 bg-white text-slate-800 sm:max-w-[74%]"
        }`}
      >
        {message.streaming && !message.content ? (
          <span className="flex h-7 items-center gap-1.5 px-1" aria-label="دستیار در حال نوشتن است" role="status">
            <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-500 [animation-delay:-0.3s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-500 [animation-delay:-0.15s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-500" />
          </span>
        ) : (
          <MessageContent content={message.content} formatted={!customer} />
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
          className="customer-avatar h-[4.5rem] w-[4.5rem] shrink-0 object-contain object-bottom sm:h-20 sm:w-20"
          src={customerAvatar}
        />
      )}
    </article>
  );
}


function IntakeScene({ busy, error, onStart, online }) {
  return (
    <main className="intake-stage mx-auto grid min-h-0 w-full max-w-6xl flex-1 place-items-center overflow-y-auto p-4 sm:p-8">
      <section className="intake-popover" aria-label="شروع گفتگوی مشتری">
        <img
          alt=""
          aria-hidden="true"
          className="intake-character"
          src={customerGuideAvatar}
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
              <span>شروع</span>
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
  const [pendingMessages, setPendingMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const previousConversationIdRef = useRef(conversation?.id || null);
  const streamControllerRef = useRef(null);

  const resetLocalFlow = useCallback(() => {
    streamControllerRef.current?.abort();
    streamControllerRef.current = null;
    setContent("");
    setPendingMessages([]);
    setError("");
    setBusy(false);
  }, []);

  useEffect(() => {
    const currentConversationId = conversation?.id || null;
    if (previousConversationIdRef.current && !currentConversationId) {
      resetLocalFlow();
    }
    previousConversationIdRef.current = currentConversationId;
  }, [conversation, resetLocalFlow]);

  useEffect(() => () => streamControllerRef.current?.abort(), []);

  const handleIdleTimeout = useCallback(() => {
    const conversationId = conversation?.id;
    resetLocalFlow();
    onReset(conversationId);
  }, [conversation?.id, onReset, resetLocalFlow]);

  const { warningOpen, secondsLeft, stayActive } = useIdleTimeout({
    enabled: Boolean(conversation),
    idleMs: IDLE_INACTIVITY_MS,
    warningMs: IDLE_WARNING_MS,
    onTimeout: handleIdleTimeout,
  });

  const displayMessages = useMemo(() => {
    if (!conversation) return [];

    return [
      {
        id: `conversation-${conversation.id}-welcome`,
        role: "assistant",
        content: "خیلی خوب، من آماده‌ام 😊\nچه سؤالی دارید؟",
        created_at: conversation.started_at,
        local: true,
      },
      ...(conversation.messages || []),
      ...pendingMessages,
    ];
  }, [conversation, pendingMessages]);

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }, [displayMessages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [conversation?.id]);

  const startConversation = async () => {
    if (busy || !online) return;

    setError("");
    setBusy(true);
    try {
      const newConversation = await api.startSession({});
      onConversationChange(newConversation);
    } catch (requestError) {
      if (requestError instanceof ApiError && [401, 403].includes(requestError.status)) {
        onSessionExpired();
        return;
      }
      setError(requestError.message || "شروع گفتگو انجام نشد. لطفاً دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  };

  const submitMessage = async (event) => {
    event.preventDefault();
    const trimmedContent = content.trim();
    if (!trimmedContent || busy || !conversation) return;

    setError("");
    setBusy(true);
    setContent("");

    const requestKey = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const pendingCustomerId = `pending-customer-${requestKey}`;
    const pendingAssistantId = `pending-assistant-${requestKey}`;
    let savedCustomerMessage = null;
    let assistantContent = "";
    const controller = new AbortController();
    streamControllerRef.current = controller;

    setPendingMessages([
      {
        id: pendingCustomerId,
        role: "customer",
        content: trimmedContent,
        local: true,
      },
      {
        id: pendingAssistantId,
        role: "assistant",
        content: "",
        local: true,
        streaming: true,
      },
    ]);

    try {
      const result = await api.sendMessageStream(
        conversation.id,
        trimmedContent,
        {
          onCustomer: ({ message }) => {
            savedCustomerMessage = message;
            setPendingMessages((current) => current.map((pendingMessage) => (
              pendingMessage.id === pendingCustomerId ? message : pendingMessage
            )));
          },
          onDelta: (delta) => {
            assistantContent += delta;
            setPendingMessages((current) => current.map((pendingMessage) => (
              pendingMessage.id === pendingAssistantId
                ? { ...pendingMessage, content: assistantContent }
                : pendingMessage
            )));
          },
        },
        controller.signal,
      );
      const finalCustomerMessage = savedCustomerMessage || result.customer_message;
      onConversationChange({
        ...conversation,
        messages: [
          ...(conversation.messages || []),
          finalCustomerMessage,
          result.assistant_message,
        ].filter(Boolean),
      });
      setPendingMessages([]);
    } catch (requestError) {
      setPendingMessages([]);
      if (requestError.name === "AbortError") return;
      if (requestError instanceof ApiError && [401, 403].includes(requestError.status)) {
        onSessionExpired();
        return;
      }
      if (savedCustomerMessage) {
        onConversationChange({
          ...conversation,
          messages: [...(conversation.messages || []), savedCustomerMessage],
        });
      }
      setError(requestError.message || "در پاسخ‌گویی مشکلی پیش آمد. پیام شما ذخیره شده است.");
    } finally {
      if (streamControllerRef.current === controller) {
        streamControllerRef.current = null;
      }
      setBusy(false);
    }
  };

  const handleTextareaKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const composerDisabled = busy || !online;
  const composerPlaceholder = online ? "سؤالتان را بنویسید…" : "اتصال شبکه برقرار نیست";

  return (
    <>
      {!conversation ? (
        <IntakeScene
          busy={busy}
          error={error}
          onStart={startConversation}
          online={online}
        />
      ) : (
        <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden p-3 sm:p-7 lg:p-9">
          <div className="chat-frame flex min-h-0 flex-1">
            <section className="chat-surface relative z-[1] flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-[2rem]">
              <button className="new-customer-button touch-button absolute left-4 top-4 z-10 inline-flex items-center gap-2 rounded-2xl px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:left-6 sm:top-6" disabled={busy} onClick={onNewCustomer} type="button">
                <Icon name="refresh" size={18} />
                چت جدید
              </button>

              <div
                className="chat-scroll min-h-0 flex-1 touch-pan-y overscroll-contain overflow-y-auto px-4 pb-8 pt-24 sm:px-8 sm:pb-10"
                aria-live="polite"
                aria-label="پیام‌های گفتگو"
                ref={scrollRef}
              >
                <div className="mx-auto flex max-w-3xl flex-col gap-5">
                  {displayMessages.map((message) => <MessageBubble key={message.id} message={message} />)}
                </div>
              </div>

              <footer className="composer-dock border-t border-white/10 px-3 pb-3 pt-3 sm:px-6 sm:pb-5 sm:pt-4">
                <div className="mx-auto max-w-3xl">
                  {error && (
                    <div className="mb-3 flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700" role="alert">
                      <Icon name="warning" size={18} className="shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <form className="chat-composer flex items-end gap-2 rounded-[1.4rem] border border-white/60 bg-white p-2 transition focus-within:border-cyan-300 focus-within:ring-4 focus-within:ring-cyan-300/20" onSubmit={submitMessage}>
                    <textarea
                      aria-label="متن پیام"
                      autoFocus
                      className="max-h-32 min-h-14 flex-1 resize-none bg-transparent px-3 py-3.5 leading-7 outline-none placeholder:text-slate-400"
                      disabled={composerDisabled}
                      maxLength={2000}
                      onChange={(event) => setContent(event.target.value)}
                      onKeyDown={handleTextareaKeyDown}
                      placeholder={composerPlaceholder}
                      ref={inputRef}
                      rows={1}
                      value={content}
                    />

                    <button
                      aria-label="ارسال پیام"
                      className="send-button-3d grid h-14 w-14 shrink-0 place-items-center rounded-[1.1rem] text-white transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/25 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={composerDisabled || !content.trim()}
                      type="submit"
                    >
                      {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="send" size={22} />}
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
