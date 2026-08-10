import { useCallback, useEffect, useState } from "react";

import Dialog from "./components/Dialog";
import { Icon } from "./components/Icons";
import ChatPanel from "./features/chat/ChatPanel";
import { ApiError, api } from "./services/api";


export default function KioskShell({ onSessionExpired }) {
  const [conversation, setConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
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

  return (
    <div className="app-background gradient-world flex h-dvh min-h-0 flex-col overflow-hidden">
      <div className="ambient-scene" aria-hidden="true">
        <span className="ambient-ribbon ambient-ribbon-one" />
        <span className="ambient-ribbon ambient-ribbon-two" />
        <span className="ambient-sphere ambient-sphere-one" />
        <span className="ambient-sphere ambient-sphere-two" />
        <span className="ambient-ring" />
        <span className="ambient-signal ambient-signal-one" />
        <span className="ambient-signal ambient-signal-two" />
      </div>

      {loading ? (
        <main className="grid flex-1 place-items-center p-6" role="status">
          <div className="text-center">
            <span className="spinner mx-auto !h-9 !w-9 !border-cyan-300 !border-l-transparent" />
            <p className="mt-4 font-bold text-white/80">در حال آماده‌سازی کیوسک…</p>
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
          onNewCustomer={() => setResetDialogOpen(true)}
          onReset={resetCustomer}
          onSessionExpired={onSessionExpired}
          online={online}
        />
      )}

      <Dialog
        cancelLabel="ادامه گفتگو"
        confirmLabel="شروع چت جدید"
        description="پیام‌های این گفتگو از صفحه پاک می‌شود. گفتگو برای بررسی مدیر در سامانه باقی می‌ماند."
        onCancel={() => setResetDialogOpen(false)}
        onConfirm={() => {
          const conversationId = conversation?.id;
          setResetDialogOpen(false);
          resetCustomer(conversationId);
        }}
        open={resetDialogOpen}
        title="گفتگوی فعلی پایان یابد؟"
      />

    </div>
  );
}
