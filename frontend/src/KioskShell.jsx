import { useCallback, useEffect, useState } from "react";

import Dialog from "./components/Dialog";
import { Icon } from "./components/Icons";
import ChatPanel from "./features/chat/ChatPanel";
import { ApiError, api } from "./services/api";


export default function KioskShell({ user, onLogout, onSessionExpired }) {
  const [conversation, setConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);

  const loadCurrentSession = useCallback(async (signal) => {
    setLoading(true);
    setLoadError("");
    try {
      const current = await api.currentSession(signal);
      setConversation(current);
    } catch (requestError) {
      if (requestError.name === "AbortError") return;
      if (requestError instanceof ApiError && [401, 403].includes(requestError.status)) {
        onSessionExpired();
        return;
      }
      setLoadError(requestError.message || "بازیابی وضعیت گفتگو انجام نشد.");
    } finally {
      setLoading(false);
    }
  }, [onSessionExpired]);

  useEffect(() => {
    const controller = new AbortController();
    loadCurrentSession(controller.signal);
    return () => controller.abort();
  }, [loadCurrentSession]);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const resetCustomer = useCallback(async (conversationId) => {
    setConversation(null);
    if (!conversationId) return;
    try {
      await api.closeConversation(conversationId);
    } catch (requestError) {
      if (requestError instanceof ApiError && [401, 403].includes(requestError.status)) {
        onSessionExpired();
      }
    }
  }, [onSessionExpired]);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLogoutDialogOpen(false);
    setLogoutError("");
    setLoggingOut(true);
    const activeId = conversation?.id;
    setConversation(null);
    if (activeId) {
      try {
        await api.closeConversation(activeId);
      } catch {
        // Logout is still attempted even if closing the conversation fails.
      }
    }

    try {
      await api.logout();
      onLogout();
    } catch (requestError) {
      if (requestError instanceof ApiError && [401, 403].includes(requestError.status)) {
        onLogout();
      } else {
        setLogoutError("خروج در سرور ثبت نشد. اتصال شبکه را بررسی و دوباره تلاش کنید.");
        setLogoutDialogOpen(true);
      }
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="app-background flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-3 sm:px-8 sm:py-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-teal-700 text-white shadow-md shadow-teal-900/15" aria-label="صفحه گفتگو">
          <Icon name="sparkles" size={22} />
        </span>
        <div className="flex items-center gap-2">
          {!online && (
            <span className="hidden items-center gap-2 rounded-full bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 sm:flex" role="status">
              <Icon name="wifiOff" size={17} />
              بدون اتصال
            </span>
          )}
          {conversation && (
            <button
              aria-label="مشتری جدید"
              className="touch-button inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800 sm:px-4"
              onClick={() => setResetDialogOpen(true)}
              type="button"
            >
              <Icon name="refresh" size={18} />
              <span className="hidden sm:inline">مشتری جدید</span>
            </button>
          )}
          <button aria-label="خروج اپراتور" className="touch-button inline-flex items-center gap-2 rounded-2xl px-3 text-sm font-bold text-slate-500 hover:bg-white hover:text-slate-800" onClick={() => { setLogoutError(""); setLogoutDialogOpen(true); }} type="button">
            <Icon name="logout" size={19} />
            <span className="hidden sm:inline">خروج</span>
          </button>
        </div>
      </header>

      {loading ? (
        <main className="grid flex-1 place-items-center p-6" role="status">
          <div className="text-center">
            <span className="spinner mx-auto !h-9 !w-9 !border-teal-700 !border-l-transparent" />
            <p className="mt-4 font-bold text-slate-600">در حال آماده‌سازی کیوسک…</p>
          </div>
        </main>
      ) : loadError ? (
        <main className="grid flex-1 place-items-center p-6">
          <section className="w-full max-w-md rounded-[2rem] bg-white p-8 text-center shadow-xl ring-1 ring-slate-200">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-rose-50 text-rose-600"><Icon name="wifiOff" size={30} /></span>
            <h1 className="mt-5 text-xl font-extrabold">اتصال با سامانه برقرار نشد</h1>
            <p className="mt-3 leading-7 text-slate-500">{loadError}</p>
            <button className="primary-button mt-6 w-full" onClick={() => loadCurrentSession()} type="button"><Icon name="refresh" />تلاش دوباره</button>
          </section>
        </main>
      ) : (
        <ChatPanel
          conversation={conversation}
          onConversationChange={setConversation}
          onReset={resetCustomer}
          onSessionExpired={onSessionExpired}
          online={online}
        />
      )}

      <Dialog
        cancelLabel="ادامه گفتگو"
        confirmLabel="شروع برای مشتری جدید"
        description="نام، شماره همراه و پیام‌های این مشتری از صفحه پاک می‌شود. گفتگو برای بررسی مدیر در سامانه باقی می‌ماند."
        onCancel={() => setResetDialogOpen(false)}
        onConfirm={() => {
          const conversationId = conversation?.id;
          setResetDialogOpen(false);
          resetCustomer(conversationId);
        }}
        open={resetDialogOpen}
        title="گفتگوی فعلی پایان یابد؟"
      />

      <Dialog
        cancelLabel="ماندن در سامانه"
        confirmLabel="خروج"
        description={logoutError || `با خروج از حساب «${user.username}»، برای استفاده دوباره باید رمز عبور اپراتور وارد شود.`}
        onCancel={() => setLogoutDialogOpen(false)}
        onConfirm={handleLogout}
        open={logoutDialogOpen}
        title={logoutError ? "خروج انجام نشد" : "از حساب اپراتور خارج می‌شوید؟"}
      />
    </div>
  );
}
