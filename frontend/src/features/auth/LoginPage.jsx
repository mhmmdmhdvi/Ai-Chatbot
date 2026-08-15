import { useState } from "react";

import megatiteBanner from "../../assets/megatite-login-banner.jpg";
import megatiteLogo from "../../assets/megatite-logo.svg";
import { Icon } from "../../components/Icons";
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
    <main className="login-stage app-background grid min-h-dvh place-items-center overflow-y-auto">
      <section className="login-shell grid min-w-0 w-full max-w-6xl overflow-hidden rounded-[2.25rem] bg-white shadow-2xl shadow-slate-900/10 ring-1 ring-slate-900/5 lg:grid-cols-[1.05fr_.95fr]">
        <div className="login-brand-banner hidden lg:block">
          <img
            alt=""
            aria-hidden="true"
            className="login-brand-banner-image"
            src={megatiteBanner}
          />
          <div className="login-brand-badge">
            <img alt="Megatite" className="login-brand-logo" src={megatiteLogo} />
          </div>
        </div>

        <div className="login-form-panel flex min-w-0 items-center px-6 py-10 sm:px-12 lg:px-16">
          <div className="login-form-content mx-auto min-w-0 w-full max-w-md">
            <div className="mb-9">
              <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">ورود</h1>
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
          </div>
        </div>
      </section>
    </main>
  );
}
