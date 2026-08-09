import { useCallback, useEffect, useState } from "react";

import { Icon, LogoMark } from "./components/Icons";
import LoginPage from "./features/auth/LoginPage";
import KioskShell from "./KioskShell";
import { ApiError, api } from "./services/api";


function LoadingScreen() {
  return (
    <main className="app-background grid min-h-screen place-items-center p-6" role="status">
      <div className="text-center">
        <LogoMark />
        <span className="spinner mx-auto mt-8 !h-9 !w-9 !border-teal-700 !border-l-transparent" />
        <p className="mt-4 font-bold text-slate-600">در حال بررسی دسترسی…</p>
      </div>
    </main>
  );
}


function ServerError({ message, onRetry }) {
  return (
    <main className="app-background grid min-h-screen place-items-center p-6">
      <section className="w-full max-w-md rounded-[2rem] bg-white p-8 text-center shadow-xl ring-1 ring-slate-200">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-rose-50 text-rose-600"><Icon name="wifiOff" size={30} /></span>
        <h1 className="mt-5 text-2xl font-black text-slate-900">سامانه در دسترس نیست</h1>
        <p className="mt-3 leading-7 text-slate-500">{message}</p>
        <button className="primary-button mt-7 w-full" onClick={() => onRetry()} type="button"><Icon name="refresh" />تلاش دوباره</button>
      </section>
    </main>
  );
}


function App() {
  const [authState, setAuthState] = useState({ status: "checking", user: null, error: "" });

  const checkAuthentication = useCallback(async (signal) => {
    setAuthState({ status: "checking", user: null, error: "" });
    try {
      const user = await api.me(signal);
      setAuthState({ status: "authenticated", user, error: "" });
    } catch (error) {
      if (error.name === "AbortError") return;
      if (error instanceof ApiError && [401, 403].includes(error.status)) {
        try {
          await api.prepareCsrf(signal);
        } catch (csrfError) {
          if (csrfError.name === "AbortError") return;
        }
        setAuthState({ status: "unauthenticated", user: null, error: "" });
      } else {
        setAuthState({
          status: "error",
          user: null,
          error: error.message || "ارتباط با سرور برقرار نشد.",
        });
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    checkAuthentication(controller.signal);
    return () => controller.abort();
  }, [checkAuthentication]);

  if (authState.status === "checking") return <LoadingScreen />;
  if (authState.status === "error") return <ServerError message={authState.error} onRetry={checkAuthentication} />;
  if (authState.status === "unauthenticated") {
    return <LoginPage onLogin={(user) => setAuthState({ status: "authenticated", user, error: "" })} />;
  }

  return (
    <KioskShell onSessionExpired={() => setAuthState({ status: "unauthenticated", user: null, error: "" })} />
  );
}


export default App;
