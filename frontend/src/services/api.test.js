// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, api } from "./api";


function chunkedEventStream(chunks, status = 200) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(
        typeof chunk === "string" ? encoder.encode(chunk) : chunk,
      ));
      controller.close();
    },
  }), {
    status,
    headers: { "Content-Type": "text/event-stream; charset=utf-8" },
  });
}


afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});


describe("streaming message API", () => {
  it("sends the idempotency UUID and parses Persian SSE split across byte chunks", async () => {
    const customer = {
      id: "customer-1",
      role: "customer",
      content: "زمان پخت چقدر است؟",
    };
    const assistant = {
      id: "assistant-1",
      role: "assistant",
      content: "زمان پخت اولیه ۱۲ ساعت است.",
    };
    const streamText = [
      `event: customer\ndata: ${JSON.stringify({ message: customer })}\n\n`,
      `event: delta\ndata: ${JSON.stringify({ delta: "زمان پخت اولیه " })}\n\n`,
      `event: completed\ndata: ${JSON.stringify({
        customer_message: customer,
        assistant_message: assistant,
      })}\n\n`,
    ].join("");
    const bytes = new TextEncoder().encode(streamText);
    const fetchMock = vi.fn(async () => chunkedEventStream([
      bytes.slice(0, 73),
      bytes.slice(73, 127),
      bytes.slice(127),
    ]));
    vi.stubGlobal("fetch", fetchMock);
    const events = [];

    const result = await api.sendMessageStream(
      "conversation-1",
      {
        content: customer.content,
        clientRequestId: "123e4567-e89b-42d3-a456-426614174000",
      },
      {
        onCustomer: ({ message }) => events.push(["customer", message.content]),
        onDelta: (delta) => events.push(["delta", delta]),
        onCompleted: ({ assistant_message: message }) => events.push(["completed", message.content]),
      },
    );

    expect(events).toEqual([
      ["customer", customer.content],
      ["delta", "زمان پخت اولیه "],
      ["completed", assistant.content],
    ]);
    expect(result.assistant_message).toEqual(assistant);
    const request = fetchMock.mock.calls[0][1];
    expect(JSON.parse(request.body)).toEqual({
      content: customer.content,
      client_request_id: "123e4567-e89b-42d3-a456-426614174000",
    });
  });

  it("preserves retry guidance from an SSE error event", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => chunkedEventStream([
      `event: error\ndata: ${JSON.stringify({
        detail: "سرویس موقتاً در دسترس نیست.",
        retryable: true,
        code: "provider_busy",
      })}\n\n`,
    ])));

    await expect(api.sendMessageStream(
      "conversation-1",
      {
        content: "سلام",
        clientRequestId: "123e4567-e89b-42d3-a456-426614174000",
      },
    )).rejects.toMatchObject({
      name: "ApiError",
      status: 502,
      data: { retryable: true, code: "provider_busy" },
    });
  });

  it("rejects a truncated stream that never sends completed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => chunkedEventStream([
      `event: delta\ndata: ${JSON.stringify({ delta: "پاسخ ناتمام" })}\n\n`,
    ])));

    let error;
    try {
      await api.sendMessageStream(
        "conversation-1",
        {
          content: "یک سؤال",
          clientRequestId: "123e4567-e89b-42d3-a456-426614174000",
        },
      );
    } catch (requestError) {
      error = requestError;
    }

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
    expect(error.message).toContain("پاسخ کامل");
  });
});
