import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Dialog from "../../components/Dialog";
import { Icon } from "../../components/Icons";
import useIdleTimeout from "../../hooks/useIdleTimeout";
import { ApiError, api } from "../../services/api";


const IDLE_TIMEOUT_MS = 3 * 60 * 1000;
const IDLE_WARNING_MS = 30 * 1000;
const INITIAL_PROMPT = "سلام، خوش آمدید 👋\nبرای شروع، لطفاً نام و نام خانوادگی‌تان را بنویسید.";


function makeLocalMessage(role, content) {
  return {
    id: `local-${Date.now()}-${Math.random()}`,
    role,
    content,
    created_at: new Date().toISOString(),
    local: true,
  };
}


function firstName(name) {
  return name.trim().split(/\s+/)[0];
}


function MessageBubble({ message }) {
  const customer = message.role === "customer";
  const time = !message.local && message.created_at
    ? new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" }).format(new Date(message.created_at))
    : "";

  return (
    <article className={`flex w-full items-end gap-2.5 ${customer ? "justify-start" : "justify-end"}`}>
      {!customer && (
        <span className="mb-1 grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-teal-700 text-white shadow-sm" aria-hidden="true">
          <Icon name="sparkles" size={18} />
        </span>
      )}
      <div
        className={`max-w-[86%] px-5 py-3.5 sm:max-w-[74%] ${
          customer
            ? "rounded-[1.4rem] rounded-tr-md bg-slate-900 text-white shadow-sm"
            : "rounded-[1.4rem] rounded-tl-md border border-slate-200/80 bg-white text-slate-800 shadow-sm shadow-slate-900/5"
        }`}
      >
        <p className="mixed-content whitespace-pre-wrap break-words text-[15px] leading-7 sm:text-base" dir="auto">{message.content}</p>
        {time && (
          <time className={`mt-1.5 block text-[11px] ${customer ? "text-slate-300" : "text-slate-400"}`} dateTime={message.created_at}>
            {time}
          </time>
        )}
      </div>
    </article>
  );
}


export default function ChatPanel({ conversation, onConversationChange, onReset, onSessionExpired, online }) {
  const [intakeStep, setIntakeStep] = useState(() => (conversation ? "complete" : "name"));
  const [intakeValue, setIntakeValue] = useState("");
  const [customerName, setCustomerName] = useState(() => conversation?.customer?.name || "");
  const [intakeMessages, setIntakeMessages] = useState(() => (
    conversation ? [] : [makeLocalMessage("assistant", INITIAL_PROMPT)]
  ));
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const listEndRef = useRef(null);
  const previousConversationIdRef = useRef(conversation?.id || null);

  const resetLocalFlow = useCallback(() => {
    setIntakeStep("name");
    setIntakeValue("");
    setCustomerName("");
    setIntakeMessages([makeLocalMessage("assistant", INITIAL_PROMPT)]);
    setContent("");
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
    if (!conversation) return intakeMessages;

    const welcomeMessages = intakeMessages.length > 0
      ? intakeMessages
      : [{
          id: `conversation-${conversation.id}-welcome`,
          role: "assistant",
          content: `سلام ${firstName(conversation.customer.name)}، خوش آمدید.\nچه سؤالی دارید؟`,
          created_at: conversation.started_at,
          local: true,
        }];

    return [...welcomeMessages, ...conversation.messages];
  }, [conversation, intakeMessages]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [displayMessages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [conversation?.id, intakeStep]);

  const submitIntake = async () => {
    const value = intakeValue.trim();
    if (!value || busy) return;

    setError("");

    if (intakeStep === "name") {
      setCustomerName(value);
      setIntakeMessages((messages) => [
        ...messages,
        makeLocalMessage("customer", value),
        makeLocalMessage("assistant", `ممنون ${firstName(value)}.\nحالا شماره موبایل‌تان را وارد کنید.`),
      ]);
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
      setIntakeMessages((messages) => [
        ...messages,
        makeLocalMessage("customer", value),
        makeLocalMessage("assistant", "خیلی خوب، آماده‌ام.\nچه سؤالی دارید؟"),
      ]);
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

  const submitMessage = async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent || busy || !conversation) return;

    setError("");
    setBusy(true);
    try {
      const result = await api.sendMessage(conversation.id, trimmedContent);
      onConversationChange({
        ...conversation,
        messages: [...conversation.messages, result.message],
      });
      setContent("");
    } catch (requestError) {
      if (requestError instanceof ApiError && [401, 403].includes(requestError.status)) {
        onSessionExpired();
        return;
      }
      setError(requestError.message || "پیام ارسال نشد. دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (conversation) {
      await submitMessage();
    } else {
      await submitIntake();
    }
  };

  const handleTextareaKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const restartNameStep = () => {
    setCustomerName("");
    setIntakeValue("");
    setError("");
    setIntakeStep("name");
    setIntakeMessages([makeLocalMessage("assistant", INITIAL_PROMPT)]);
  };

  const composerValue = conversation ? content : intakeValue;
  const composerDisabled = busy || !online;
  const composerPlaceholder = !online
    ? "اتصال شبکه برقرار نیست"
    : conversation
      ? "سؤالتان را بنویسید…"
      : intakeStep === "phone"
        ? "مثلاً ۰۹۱۲۱۲۳۴۵۶۷"
        : "نام و نام خانوادگی";

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-3 pb-3 sm:px-6 sm:pb-6">
      <section className="chat-surface flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-xl shadow-slate-900/5">
        <div className="chat-scroll flex-1 overflow-y-auto bg-[#f7f8f7] px-4 py-7 sm:px-8 sm:py-10" aria-live="polite" aria-label="پیام‌های گفتگو">
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {displayMessages.map((message) => <MessageBubble key={message.id} message={message} />)}
            <div ref={listEndRef} />
          </div>
        </div>

        <footer className="border-t border-slate-100 bg-white px-3 pb-3 pt-3 sm:px-6 sm:pb-5 sm:pt-4">
          <div className="mx-auto max-w-3xl">
            {error && (
              <div className="mb-3 flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700" role="alert">
                <Icon name="warning" size={18} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form className="chat-composer flex items-end gap-2 rounded-[1.4rem] border border-slate-200 bg-slate-50 p-2 transition focus-within:border-teal-600 focus-within:bg-white focus-within:ring-4 focus-within:ring-teal-600/10" onSubmit={handleSubmit}>
              {conversation ? (
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
              ) : (
                <input
                  aria-label={intakeStep === "phone" ? "شماره همراه" : "نام و نام خانوادگی"}
                  autoComplete="off"
                  autoFocus
                  className="min-h-14 min-w-0 flex-1 bg-transparent px-3 py-3.5 leading-7 outline-none placeholder:text-slate-400"
                  dir={intakeStep === "phone" ? "ltr" : "rtl"}
                  disabled={composerDisabled}
                  inputMode={intakeStep === "phone" ? "tel" : "text"}
                  maxLength={intakeStep === "phone" ? 30 : 100}
                  onChange={(event) => setIntakeValue(event.target.value)}
                  placeholder={composerPlaceholder}
                  ref={inputRef}
                  value={intakeValue}
                />
              )}

              <button
                aria-label={conversation ? "ارسال پیام" : intakeStep === "phone" ? "شروع گفتگو" : "ادامه"}
                className="grid h-14 w-14 shrink-0 place-items-center rounded-[1.1rem] bg-teal-700 text-white shadow-md shadow-teal-900/15 transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/25 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={composerDisabled || !composerValue.trim()}
                type="submit"
              >
                {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="send" size={22} />}
              </button>
            </form>

            {!conversation && (
              <div className="mt-2 flex min-h-7 flex-wrap items-center justify-between gap-2 px-2 text-xs text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="shield" size={15} />
                  نام، شماره و متن گفتگو در سامانه مجموعه ثبت می‌شود.
                </span>
                {intakeStep === "phone" && (
                  <button className="min-h-7 font-bold text-teal-700 hover:text-teal-900" onClick={restartNameStep} type="button">
                    اصلاح نام
                  </button>
                )}
              </div>
            )}
          </div>
        </footer>
      </section>

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
    </main>
  );
}
