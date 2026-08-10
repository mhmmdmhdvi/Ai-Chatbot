import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import assistantAvatar from "../../assets/assistant-avatar.webp";
import Dialog from "../../components/Dialog";
import { Icon } from "../../components/Icons";
import useIdleTimeout from "../../hooks/useIdleTimeout";
import { ApiError, api } from "../../services/api";


const IDLE_TIMEOUT_MS = 3 * 60 * 1000;
const IDLE_WARNING_MS = 30 * 1000;


function firstName(name) {
  return name.trim().split(/\s+/)[0];
}


function MessageBubble({ message }) {
  const customer = message.role === "customer";
  const time = !message.local && message.created_at
    ? new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" }).format(new Date(message.created_at))
    : "";

  return (
    <article className={`message-row flex w-full items-end gap-2.5 ${customer ? "justify-end" : "justify-start"}`}>
      {!customer && (
        <img
          alt=""
          aria-hidden="true"
          className="assistant-avatar h-[4.5rem] w-[4.5rem] shrink-0 object-contain object-bottom sm:h-20 sm:w-20"
          src={assistantAvatar}
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
          <p className="mixed-content whitespace-pre-wrap break-words text-[15px] leading-7 sm:text-base" dir="auto">{message.content}</p>
        )}
        {time && (
          <time className={`mt-1.5 block text-[11px] ${customer ? "text-slate-300" : "text-slate-400"}`} dateTime={message.created_at}>
            {time}
          </time>
        )}
      </div>
    </article>
  );
}


function IntakeScene({ busy, customerName, error, inputRef, intakeStep, intakeValue, onChange, onSubmit, online }) {
  const collectingPhone = intakeStep === "phone";
  const promptTitle = collectingPhone ? `خیلی ممنون، ${firstName(customerName)}!` : "سلام، خوش اومدید 👋";
  const promptText = collectingPhone
    ? "حالا لطفاً شماره موبایلتون رو وارد کنید."
    : "لطفاً اسمتون رو وارد کنید تا با هم شروع کنیم.";
  const inputLabel = collectingPhone ? "شماره موبایل" : "نام";
  const submitLabel = collectingPhone ? "شروع گفتگو" : "ادامه";
  const placeholder = !online
    ? "اتصال شبکه برقرار نیست"
    : collectingPhone
      ? "مثلاً ۰۹۱۲۱۲۳۴۵۶۷"
      : "مثلاً سارا";

  return (
    <main className="intake-stage mx-auto grid min-h-0 w-full max-w-6xl flex-1 place-items-center overflow-y-auto p-4 sm:p-8">
      <section className="intake-popover" aria-label="شروع گفتگوی مشتری">
        <img
          alt=""
          aria-hidden="true"
          className="intake-character"
          src={assistantAvatar}
        />

        <div className="intake-thought-card" key={intakeStep} aria-live="polite">
          <div className="intake-card-content">
            <h1 className="text-xl font-black leading-8 text-slate-900 sm:text-2xl">{promptTitle}</h1>
            <p className="mt-1.5 text-sm leading-7 text-slate-600 sm:text-base">{promptText}</p>

            {error && (
              <div className="mt-4 flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700" role="alert">
                <Icon name="warning" size={18} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form className="intake-input-shell mt-5 flex items-center gap-2 rounded-[1.35rem] bg-white p-2" onSubmit={onSubmit}>
              <input
                aria-label={inputLabel}
                autoComplete="off"
                autoFocus
                className="min-h-14 min-w-0 flex-1 bg-transparent px-3 py-3 text-base outline-none placeholder:text-slate-400"
                dir={collectingPhone ? "ltr" : "rtl"}
                disabled={busy || !online}
                inputMode={collectingPhone ? "tel" : "text"}
                maxLength={collectingPhone ? 30 : 100}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                ref={inputRef}
                value={intakeValue}
              />
              <button
                aria-label={submitLabel}
                className="send-button-3d grid h-14 w-14 shrink-0 place-items-center rounded-[1.1rem] text-white transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/25 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={busy || !online || !intakeValue.trim()}
                type="submit"
              >
                {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="send" size={22} />}
              </button>
            </form>

            <div className="mt-4 flex items-center gap-2" aria-hidden="true">
              <span className="intake-progress-dot is-active" />
              <span className={`intake-progress-dot ${collectingPhone ? "is-active" : ""}`} />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}


export default function ChatPanel({ conversation, onConversationChange, onNewCustomer, onReset, onSessionExpired, online }) {
  const [intakeStep, setIntakeStep] = useState(() => (conversation ? "complete" : "name"));
  const [intakeValue, setIntakeValue] = useState("");
  const [customerName, setCustomerName] = useState(() => conversation?.customer?.name || "");
  const [content, setContent] = useState("");
  const [pendingMessages, setPendingMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const listEndRef = useRef(null);
  const previousConversationIdRef = useRef(conversation?.id || null);
  const streamControllerRef = useRef(null);

  const resetLocalFlow = useCallback(() => {
    streamControllerRef.current?.abort();
    streamControllerRef.current = null;
    setIntakeStep("name");
    setIntakeValue("");
    setCustomerName("");
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
    enabled: true,
    timeoutMs: IDLE_TIMEOUT_MS,
    warningMs: IDLE_WARNING_MS,
    onTimeout: handleIdleTimeout,
  });

  const displayMessages = useMemo(() => {
    if (!conversation) return [];

    return [
      {
        id: `conversation-${conversation.id}-welcome`,
        role: "assistant",
        content: `عالیه ${firstName(conversation.customer.name)}! من آماده‌ام 😊\nچه سؤالی دارید؟`,
        created_at: conversation.started_at,
        local: true,
      },
      ...(conversation.messages || []),
      ...pendingMessages,
    ];
  }, [conversation, pendingMessages]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [displayMessages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [conversation?.id, intakeStep]);

  const submitIntake = async (event) => {
    event.preventDefault();
    const value = intakeValue.trim();
    if (!value || busy) return;

    setError("");

    if (intakeStep !== "phone") {
      setCustomerName(value);
      setIntakeValue("");
      setIntakeStep("phone");
      return;
    }

    setBusy(true);
    try {
      const newConversation = await api.startSession({
        name: customerName,
        phone_number: value,
      });
      setIntakeValue("");
      setIntakeStep("complete");
      onConversationChange(newConversation);
    } catch (requestError) {
      if (requestError instanceof ApiError && [401, 403].includes(requestError.status)) {
        onSessionExpired();
        return;
      }
      setError(requestError.message || "شماره موبایل را بررسی و دوباره وارد کنید.");
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

  const customerIntakeStep = intakeStep === "phone" ? "phone" : "name";
  const composerDisabled = busy || !online;
  const composerPlaceholder = online ? "سؤالتان را بنویسید…" : "اتصال شبکه برقرار نیست";

  return (
    <>
      {!conversation ? (
        <IntakeScene
          busy={busy}
          customerName={customerName}
          error={error}
          inputRef={inputRef}
          intakeStep={customerIntakeStep}
          intakeValue={intakeValue}
          onChange={setIntakeValue}
          onSubmit={submitIntake}
          online={online}
        />
      ) : (
        <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col p-3 sm:p-7 lg:p-9">
          <div className="chat-frame flex min-h-0 flex-1">
            <section className="chat-surface relative z-[1] flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-[2rem]">
              <button className="new-customer-button touch-button absolute left-4 top-4 z-10 inline-flex items-center gap-2 rounded-2xl px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:left-6 sm:top-6" disabled={busy} onClick={onNewCustomer} type="button">
                <Icon name="refresh" size={18} />
                مشتری جدید
              </button>

              <div className="chat-scroll flex-1 overflow-y-auto px-4 pb-8 pt-24 sm:px-8 sm:pb-10" aria-live="polite" aria-label="پیام‌های گفتگو">
                <div className="mx-auto flex max-w-3xl flex-col gap-5">
                  {displayMessages.map((message) => <MessageBubble key={message.id} message={message} />)}
                  <div ref={listEndRef} />
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
        cancelLabel="پایان گفتگو"
        confirmLabel="ادامه گفتگو"
        description="برای حفظ حریم خصوصی، در صورت نبود فعالیت این گفتگو بسته و اطلاعات مشتری از صفحه پاک می‌شود."
        onCancel={handleIdleTimeout}
        onConfirm={stayActive}
        open={warningOpen}
        title="هنوز اینجا هستید؟"
        tone="primary"
      >
        <div className="rounded-2xl bg-amber-50 p-4 text-center text-amber-900">
          <strong className="text-2xl tabular-nums">{secondsLeft}</strong>
          <span className="mr-2 text-sm">ثانیه تا پایان خودکار</span>
        </div>
      </Dialog>
    </>
  );
}
