import { useState } from "react";

import { Icon, LogoMark } from "../../components/Icons";
import { ApiError, api } from "../../services/api";


const GENERIC_LOGIN_ERROR = "نام کاربری یا رمز عبور نادرست است.";


export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);

    try {
      await api.prepareCsrf();
      const user = await api.login({ username: username.trim(), password });
      setPassword("");
      onLogin(user);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 429) {
        setError(requestError.message);
      } else if (requestError instanceof ApiError && requestError.status === 0) {
        setError(requestError.message);
      } else {
        setError(GENERIC_LOGIN_ERROR);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="app-background grid min-h-screen place-items-center p-4 sm:p-8">
      <section className="grid min-w-0 w-full max-w-6xl overflow-hidden rounded-[2.25rem] bg-white shadow-2xl shadow-slate-900/10 ring-1 ring-slate-900/5 lg:min-h-[720px] lg:grid-cols-[1.05fr_.95fr]">
        <div className="relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 opacity-50 login-pattern" />
          <div className="relative z-10">
            <div className="mb-16 inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-teal-50 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_5px_rgba(52,211,153,.12)]" />
              سامانه آماده خدمت‌رسانی است
            </div>
            <p className="mb-4 text-sm font-bold tracking-wide text-teal-300">تجربه‌ای ساده و مطمئن</p>
            <h1 className="max-w-lg text-4xl font-black leading-[1.45] xl:text-5xl">
              پاسخ‌گویی بهتر،<br />ارتباط نزدیک‌تر با مشتری
            </h1>
            <p className="mt-7 max-w-md text-lg leading-9 text-slate-300">
              این کیوسک برای ثبت پرسش‌های مشتریان و ارائه پاسخ‌های دقیق بر پایه اطلاعات مجموعه طراحی شده است.
            </p>
          </div>
          <div className="relative z-10 flex items-center gap-3 text-sm text-slate-400">
            <Icon name="shield" size={20} className="text-teal-300" />
            دسترسی به سامانه فقط برای اپراتور مجاز است
          </div>
        </div>

        <div className="flex min-w-0 items-center px-6 py-10 sm:px-12 lg:px-16">
          <div className="mx-auto min-w-0 w-full max-w-md">
            <LogoMark />
            <div className="mb-9 mt-12">
              <p className="mb-2 text-sm font-bold text-teal-700">دروازه ورود کیوسک</p>
              <h2 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">ورود اپراتور</h2>
              <p className="mt-3 leading-7 text-slate-500">برای فعال‌سازی دستیار، وارد حساب کاربری کیوسک شوید.</p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit} noValidate>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">نام کاربری</span>
                <span className="input-shell">
                  <Icon name="user" className="shrink-0 text-slate-400" />
                  <input
                    autoCapitalize="none"
                    autoComplete="username"
                    className="min-w-0 flex-1 bg-transparent py-4 outline-none placeholder:text-slate-400"
                    dir="ltr"
                    maxLength={150}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="Username"
                    required
                    value={username}
                  />
                </span>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">رمز عبور</span>
                <span className="input-shell">
                  <Icon name="shield" className="shrink-0 text-slate-400" />
                  <input
                    autoComplete="current-password"
                    className="min-w-0 flex-1 bg-transparent py-4 outline-none placeholder:text-slate-400"
                    dir="ltr"
                    maxLength={128}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Password"
                    required
                    type="password"
                    value={password}
                  />
                </span>
              </label>

              {error && (
                <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700" role="alert">
                  <Icon name="warning" size={20} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button className="primary-button w-full" disabled={submitting || !username.trim() || !password} type="submit">
                {submitting ? <span className="spinner" aria-hidden="true" /> : <Icon name="arrowLeft" />}
                {submitting ? "در حال ورود…" : "ورود به سامانه"}
              </button>
            </form>

            <p className="mt-8 text-center text-xs leading-6 text-slate-400">رمز عبور فقط برای ورود ارسال می‌شود و در مرورگر ذخیره نخواهد شد.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
