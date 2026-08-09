import { useCallback, useEffect, useRef, useState } from "react";

import Dialog from "../../components/Dialog";
import { Icon } from "../../components/Icons";
import useIdleTimeout from "../../hooks/useIdleTimeout";
import { ApiError, api } from "../../services/api";


const IDLE_TIMEOUT_MS = 3 * 60 * 1000;
const IDLE_WARNING_MS = 30 * 1000;


function MessageBubble({ message }) {
  const customer = message.role === "customer";
  const time = new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" }).format(new Date(message.created_at));

  return (
    <article className={`flex ${customer ? "justify-start" : "justify-end"}`}>
      <div className={`max-w-[86%] rounded-3xl px-5 py-3.5 shadow-sm sm:max-w-[72%] ${customer ? "rounded-tr-md bg-teal-700 text-white" : "rounded-tl-md border border-slate-200 bg-white text-slate-800"}`}>
        <p className="mixed-content whitespace-pre-wrap break-words text-[15px] leading-7 sm:text-base" dir="auto">{message.content}</p>
        <time className={`mt-1.5 block text-[11px] ${customer ? "text-teal-100" : "text-slate-400"}`} dateTime={message.created_at}>{time}</time>
      </div>
    </article>
  );
}


export default function ChatPanel({ conversation, onConversationChange, onReset, onSessionExpired, online }) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [savedNotice, setSavedNotice] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const listEndRef = useRef(null);
  const textareaRef = useRef(null);

  const handleIdleTimeout = useCallback(() => {
    onReset(conversation.id);
  }, [conversation.id, onReset]);

  const { warningOpen, secondsLeft, stayActive } = useIdleTimeout({
    enabled: Boolean(conversation),
    timeoutMs: IDLE_TIMEOUT_MS,
    warningMs: IDLE_WARNING_MS,
    onTimeout: handleIdleTimeout,
  });

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [conversation.messages]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedContent = content.trim();
    if (!trimmedContent || sending) return;

    setError("");
    setSavedNotice(false);
    setSending(true);
    try {
      const result = await api.sendMessage(conversation.id, trimmedContent);
      onConversationChange({
        ...conversation,
        messages: [...conversation.messages, result.message],
      });
      setContent("");
      setSavedNotice(true);
      window.setTimeout(() => setSavedNotice(false), 5000);
      textareaRef.current?.focus();
    } catch (requestError) {
      if (requestError instanceof ApiError && [401, 403].includes(requestError.status)) {
        onSessionExpired();
        return;
      }
      setError(requestError.message || "پیام ارسال نشد. دوباره تلاش کنید.");
    } finally {
      setSending(false);
    }
  };

  const handleTextareaKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-3 pb-3 sm:px-6 sm:pb-6">
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-xl shadow-slate-900/5 ring-1 ring-slate-200">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-3.5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-teal-50 font-black text-teal-700">
              {conversation.customer.name.trim().charAt(0)}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-extrabold text-slate-900">گفتگوی {conversation.customer.name}</h1>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-rose-500"}`} />
                {online ? "ارتباط با سامانه برقرار است" : "ارتباط شبکه قطع است"}
              </div>
            </div>
          </div>
          <button className="touch-button inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800" onClick={() => setResetDialogOpen(true)} type="button">
            <Icon name="refresh" size={19} />
            مشتری جدید
          </button>
        </header>

        <div className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm leading-6 text-amber-900 sm:px-7" role="status">
          <div className="mx-auto flex max-w-3xl items-start gap-2.5">
            <Icon name="warning" size={19} className="mt-0.5 shrink-0 text-amber-600" />
            <span><strong>حالت آزمایشی:</strong> پیام‌ها ذخیره می‌شوند، اما پاسخ‌گویی هوشمند هنوز فعال نشده است.</span>
          </div>
        </div>

        <div className="chat-scroll flex-1 overflow-y-auto bg-slate-50/70 px-4 py-6 sm:px-8" aria-live="polite" aria-label="پیام‌های گفتگو">
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {conversation.messages.length === 0 ? (
              <div className="mx-auto my-8 max-w-md text-center sm:my-16">
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-teal-100 text-teal-700">
                  <Icon name="message" size={30} />
                </span>
                <h2 className="mt-5 text-xl font-extrabold text-slate-900">گفتگو آماده است</h2>
                <p className="mt-2 leading-7 text-slate-500">پرسش خود را در کادر پایین بنویسید. در این مرحله پیام شما برای تست سامانه ذخیره می‌شود.</p>
              </div>
            ) : (
              conversation.messages.map((message) => <MessageBubble key={message.id} message={message} />)
            )}
            <div ref={listEndRef} />
          </div>
        </div>

        <footer className="border-t border-slate-100 bg-white p-3 sm:p-5">
          <div className="mx-auto max-w-3xl">
            {(error || savedNotice) && (
              <div className={`mb-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`} role={error ? "alert" : "status"}>
                <Icon name={error ? "warning" : "check"} size={18} />
                {error || "پیام شما ذخیره شد."}
              </div>
            )}
            <form className="flex items-end gap-2 rounded-3xl border border-slate-200 bg-slate-50 p-2 transition focus-within:border-teal-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-teal-600/10" onSubmit={handleSubmit}>
              <textarea
                aria-label="متن پیام"
                className="max-h-32 min-h-14 flex-1 resize-none bg-transparent px-3 py-3.5 leading-7 outline-none placeholder:text-slate-400"
                disabled={sending || !online}
                maxLength={2000}
                onChange={(event) => setContent(event.target.value)}
                onKeyDown={handleTextareaKeyDown}
                placeholder={online ? "پیام خود را بنویسید…" : "اتصال شبکه برقرار نیست"}
                ref={textareaRef}
                rows={1}
                value={content}
              />
              <button aria-label="ارسال پیام" className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-teal-700 text-white shadow-md shadow-teal-900/15 transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/25 disabled:cursor-not-allowed disabled:opacity-50" disabled={sending || !online || !content.trim()} type="submit">
                {sending ? <span className="spinner" aria-hidden="true" /> : <Icon name="send" size={23} />}
              </button>
            </form>
            <p className="mt-2 px-2 text-xs text-slate-400">Enter برای ارسال · Shift + Enter برای خط جدید</p>
          </div>
        </footer>
      </section>

      <Dialog
        cancelLabel="ادامه گفتگو"
        confirmLabel="شروع برای مشتری جدید"
        description="نام، شماره همراه و پیام‌های این مشتری از صفحه پاک می‌شود. گفتگو برای بررسی مدیر در سامانه باقی می‌ماند."
        onCancel={() => setResetDialogOpen(false)}
        onConfirm={() => {
          setResetDialogOpen(false);
          onReset(conversation.id);
        }}
        open={resetDialogOpen}
        title="گفتگوی فعلی پایان یابد؟"
      />

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
