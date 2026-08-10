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


function parseEventBlock(block) {
  let eventName = "message";
  const dataLines = [];

  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (!dataLines.length) return null;

  try {
    return { eventName, payload: JSON.parse(dataLines.join("\n")) };
  } catch {
    throw new ApiError("پاسخ نامعتبر از سرور دریافت شد.", 502);
  }
}


async function sendMessageStream(conversationId, content, handlers = {}, signal) {
  const headers = {
    Accept: "text/event-stream",
    "Content-Type": "application/json",
  };
  const csrfToken = getCookie("csrftoken");
  if (csrfToken) headers["X-CSRFToken"] = csrfToken;

  let response;
  try {
    response = await fetch(`/api/v1/conversations/${conversationId}/messages/`, {
      method: "POST",
      headers,
      credentials: "same-origin",
      body: JSON.stringify({ content }),
      signal,
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError("ارتباط با سرور برقرار نشد. اتصال شبکه را بررسی کنید.", 0);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    let data = null;
    if (contentType.includes("application/json")) {
      try {
        data = await response.json();
      } catch {
        data = null;
      }
    }
    throw new ApiError(firstError(data), response.status, data);
  }

  if (!contentType.includes("text/event-stream") || !response.body) {
    throw new ApiError("پاسخ زنده از سرور دریافت نشد.", 502);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completedPayload = null;

  const handleBlock = (block) => {
    const parsed = parseEventBlock(block);
    if (!parsed) return;
    const { eventName, payload } = parsed;

    if (eventName === "customer") {
      handlers.onCustomer?.(payload);
    } else if (eventName === "delta") {
      handlers.onDelta?.(payload.delta || "");
    } else if (eventName === "completed") {
      completedPayload = payload;
      handlers.onCompleted?.(payload);
    } else if (eventName === "error") {
      throw new ApiError(
        payload.detail || "در پاسخ‌گویی مشکلی پیش آمد.",
        502,
        payload,
      );
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || "";
      blocks.forEach(handleBlock);

      if (done) break;
    }
    if (buffer.trim()) handleBlock(buffer);
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      // The connection may already be closed by the server or AbortController.
    }
    if (error instanceof ApiError || error.name === "AbortError") throw error;
    throw new ApiError("ارتباط هنگام دریافت پاسخ قطع شد. لطفاً دوباره تلاش کنید.", 0);
  } finally {
    reader.releaseLock();
  }

  if (!completedPayload) {
    throw new ApiError("پاسخ کامل از سرور دریافت نشد. لطفاً دوباره تلاش کنید.", 502);
  }
  return completedPayload;
}


export const api = {
  prepareCsrf: (signal) => request("/api/v1/auth/csrf/", { signal }),
  login: (credentials) => request("/api/v1/auth/login/", { method: "POST", body: credentials }),
  logout: () => request("/api/v1/auth/logout/", { method: "POST" }),
  me: (signal) => request("/api/v1/auth/me/", { signal }),
  currentSession: (signal) => request("/api/v1/sessions/current/", { signal }),
  startSession: (customer) => request("/api/v1/sessions/", { method: "POST", body: customer }),
  sendMessageStream,
  closeConversation: (conversationId) =>
    request(`/api/v1/conversations/${conversationId}/close/`, { method: "POST" }),
};
