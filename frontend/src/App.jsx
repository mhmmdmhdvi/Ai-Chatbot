import { useEffect, useState } from "react";


function App() {
  const [backendStatus, setBackendStatus] = useState("checking");

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/v1/health/", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Backend health check failed");
        }
        return response.json();
      })
      .then(() => setBackendStatus("online"))
      .catch((error) => {
        if (error.name !== "AbortError") {
          setBackendStatus("offline");
        }
      });

    return () => controller.abort();
  }, []);

  const statusText = {
    checking: "در حال بررسی ارتباط با سرور...",
    online: "ارتباط با سرور برقرار است.",
    offline: "ارتباط با سرور برقرار نیست.",
  }[backendStatus];

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-slate-900">
      <section className="w-full max-w-2xl rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200 sm:p-12">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-700 text-3xl text-white">
          چ
        </div>
        <p className="mb-3 text-sm font-semibold text-teal-700">نسخه اولیه زیرساخت</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">دستیار هوشمند مشتریان</h1>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-slate-600">
          زیرساخت اولیه رابط فارسی، جنگو و پایگاه داده آماده شده است. صفحه ورود و گفت‌وگو در مرحله بعد ساخته می‌شود.
        </p>
        <div
          className="mt-8 rounded-2xl bg-slate-50 px-5 py-4 text-base text-slate-700"
          role="status"
          aria-live="polite"
        >
          {statusText}
        </div>
      </section>
    </main>
  );
}


export default App;
