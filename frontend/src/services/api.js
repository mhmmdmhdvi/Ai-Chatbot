export class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}


function getCookie(name) {
  const prefix = `${name}=`;
  const cookie = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : "";
}


function firstError(data) {
  if (!data) return "در ارتباط با سرور مشکلی پیش آمد.";
  if (typeof data === "string") return data;
  if (typeof data.detail === "string") return data.detail;

  const value = Object.values(data)[0];
  if (Array.isArray(value) && value.length) return String(value[0]);
  if (typeof value === "string") return value;
  return "اطلاعات واردشده را بررسی کنید.";
}


async function request(path, options = {}) {
  const { method = "GET", body, signal } = options;
  const headers = { Accept: "application/json" };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrfToken = getCookie("csrftoken");
    if (csrfToken) headers["X-CSRFToken"] = csrfToken;
  }

  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError("ارتباط با سرور برقرار نشد. اتصال شبکه را بررسی کنید.", 0);
  }

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    throw new ApiError(firstError(data), response.status, data);
  }

  return response.status === 204 ? null : data;
}


export const api = {
  prepareCsrf: (signal) => request("/api/v1/auth/csrf/", { signal }),
  login: (credentials) => request("/api/v1/auth/login/", { method: "POST", body: credentials }),
  logout: () => request("/api/v1/auth/logout/", { method: "POST" }),
  me: (signal) => request("/api/v1/auth/me/", { signal }),
  currentSession: (signal) => request("/api/v1/sessions/current/", { signal }),
  startSession: (customer) => request("/api/v1/sessions/", { method: "POST", body: customer }),
  sendMessage: (conversationId, content) =>
    request(`/api/v1/conversations/${conversationId}/messages/`, {
      method: "POST",
      body: { content },
    }),
  closeConversation: (conversationId) =>
    request(`/api/v1/conversations/${conversationId}/close/`, { method: "POST" }),
};
