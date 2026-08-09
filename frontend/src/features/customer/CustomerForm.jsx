import { useState } from "react";

import { Icon } from "../../components/Icons";
import { ApiError, api } from "../../services/api";


export default function CustomerForm({ onStart, onSessionExpired }) {
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);

    try {
      const conversation = await api.startSession({ name: name.trim(), phone_number: phoneNumber.trim() });
      setName("");
      setPhoneNumber("");
      onStart(conversation);
    } catch (requestError) {
      if (requestError instanceof ApiError && [401, 403].includes(requestError.status)) {
        onSessionExpired();
        return;
      }
      setError(requestError.message || "اطلاعات واردشده را بررسی کنید.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8">
      <section className="grid w-full max-w-6xl overflow-hidden rounded-[2rem] bg-white shadow-xl shadow-slate-900/5 ring-1 ring-slate-200 lg:grid-cols-[.9fr_1.1fr]">
        <div className="relative overflow-hidden bg-teal-800 px-7 py-10 text-white sm:px-10 lg:p-12">
          <div className="absolute -left-20 -top-24 h-72 w-72 rounded-full border-[42px] border-white/5" />
          <div className="relative flex h-full flex-col justify-between gap-12">
            <div>
              <span className="inline-grid h-14 w-14 place-items-center rounded-2xl bg-white/15 backdrop-blur">
                <Icon name="message" size={28} />
              </span>
              <h1 className="mt-8 text-3xl font-black leading-[1.5] sm:text-4xl">سلام! چطور می‌توانیم کمکتان کنیم؟</h1>
              <p className="mt-5 max-w-md text-base leading-8 text-teal-50/80 sm:text-lg">
                اطلاعات کوتاه زیر را وارد کنید تا گفتگوی اختصاصی شما آغاز شود.
              </p>
            </div>
            <div className="grid gap-4 text-sm text-teal-50/90 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <strong className="mb-1 block text-white">ساده و سریع</strong>
                بدون نیاز به ساخت حساب کاربری
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <strong className="mb-1 block text-white">گفتگوی خصوصی</strong>
                هر مراجعه یک گفتگوی تازه
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-10 lg:p-14">
          <p className="text-sm font-bold text-teal-700">شروع گفتگو</p>
          <h2 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">لطفاً خودتان را معرفی کنید</h2>
          <p className="mt-3 leading-7 text-slate-500">نام، شماره همراه و متن گفتگو در سامانه مجموعه ثبت می‌شود.</p>

          <form className="mt-9 space-y-5" onSubmit={handleSubmit} noValidate>
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-700">نام و نام خانوادگی</span>
              <span className="input-shell">
                <Icon name="user" className="shrink-0 text-slate-400" />
                <input
                  autoComplete="off"
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent py-4 outline-none placeholder:text-slate-400"
                  maxLength={100}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="مثلاً سارا احمدی"
                  required
                  value={name}
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-700">شماره همراه</span>
              <span className="input-shell">
                <Icon name="phone" className="shrink-0 text-slate-400" />
                <input
                  autoComplete="off"
                  className="min-w-0 flex-1 bg-transparent py-4 text-left outline-none placeholder:text-slate-400"
                  dir="ltr"
                  inputMode="tel"
                  maxLength={30}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  placeholder="0912 123 4567"
                  required
                  value={phoneNumber}
                />
              </span>
            </label>

            {error && (
              <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700" role="alert">
                <Icon name="warning" size={20} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button className="primary-button w-full" disabled={submitting || !name.trim() || !phoneNumber.trim()} type="submit">
              {submitting ? <span className="spinner" aria-hidden="true" /> : <Icon name="arrowLeft" />}
              {submitting ? "در حال ساخت گفتگو…" : "شروع گفتگو"}
            </button>
          </form>

          <div className="mt-6 flex items-start gap-2.5 rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-500">
            <Icon name="shield" size={18} className="mt-0.5 shrink-0 text-teal-700" />
            شماره همراه شما برای ورود به سامانه استفاده نمی‌شود و گفتگوهای قبلی را نمایش نمی‌دهد.
          </div>
        </div>
      </section>
    </main>
  );
}
