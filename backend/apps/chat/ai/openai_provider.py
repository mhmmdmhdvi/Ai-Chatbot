from django.conf import settings
from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AuthenticationError,
    BadRequestError,
    OpenAI,
    OpenAIError,
    RateLimitError,
)

from .base import AICompletion, AIProvider, AIProviderError, AIStreamEvent
from .prompts import SYSTEM_INSTRUCTIONS


TEMPORARY_ERROR_MESSAGE = "سرویس پاسخ‌گویی موقتاً در دسترس نیست. لطفاً کمی بعد دوباره تلاش کنید."


class OpenAIProvider(AIProvider):
    name = "openai"

    def __init__(self):
        if not settings.OPENAI_API_KEY:
            raise AIProviderError(
                category="missing_api_key",
                user_message="سرویس پاسخ‌گویی هنوز برای این دستگاه آماده نشده است.",
            )

        self.model = settings.OPENAI_MODEL
        self.client = OpenAI(
            api_key=settings.OPENAI_API_KEY,
            timeout=float(settings.OPENAI_TIMEOUT_SECONDS),
            max_retries=1,
        )

    def stream_response(self, messages):
        stream = None
        try:
            stream = self.client.responses.create(
                model=self.model,
                instructions=SYSTEM_INSTRUCTIONS,
                input=messages,
                max_output_tokens=settings.OPENAI_MAX_OUTPUT_TOKENS,
                store=False,
                stream=True,
            )
            raw_response = getattr(stream, "response", None) or getattr(stream, "_response", None)
            stream_request_id = ""
            if raw_response is not None:
                stream_request_id = getattr(raw_response, "headers", {}).get("x-request-id", "")

            for event in stream:
                if event.type == "response.output_text.delta":
                    if event.delta:
                        yield AIStreamEvent(type="delta", delta=event.delta)
                    continue

                if event.type == "response.completed":
                    response = event.response
                    usage = getattr(response, "usage", None)
                    input_details = getattr(usage, "input_tokens_details", None)
                    yield AIStreamEvent(
                        type="completed",
                        completion=AICompletion(
                            provider_response_id=getattr(response, "id", "") or "",
                            request_id=(
                                getattr(response, "_request_id", "") or stream_request_id
                            ),
                            model=getattr(response, "model", "") or self.model,
                            input_tokens=getattr(usage, "input_tokens", 0) or 0,
                            cached_input_tokens=(
                                getattr(input_details, "cached_tokens", 0) or 0
                            ),
                            output_tokens=getattr(usage, "output_tokens", 0) or 0,
                            total_tokens=getattr(usage, "total_tokens", 0) or 0,
                        ),
                    )
                    return

                if event.type in {"response.failed", "response.incomplete"}:
                    raise AIProviderError(
                        category="incomplete_response",
                        user_message=TEMPORARY_ERROR_MESSAGE,
                        retryable=True,
                    )

            raise AIProviderError(
                category="stream_ended_without_completion",
                user_message=TEMPORARY_ERROR_MESSAGE,
                retryable=True,
            )
        except AIProviderError:
            raise
        except AuthenticationError as exc:
            raise AIProviderError(
                category="authentication",
                user_message="سرویس پاسخ‌گویی هنوز برای این دستگاه آماده نشده است.",
                request_id=getattr(exc, "request_id", "") or "",
            ) from exc
        except RateLimitError as exc:
            raise AIProviderError(
                category="rate_limit",
                user_message="سرویس پاسخ‌گویی فعلاً شلوغ است. لطفاً کمی بعد دوباره تلاش کنید.",
                retryable=True,
                request_id=getattr(exc, "request_id", "") or "",
            ) from exc
        except (APITimeoutError, APIConnectionError) as exc:
            raise AIProviderError(
                category="connection",
                user_message=TEMPORARY_ERROR_MESSAGE,
                retryable=True,
                request_id=getattr(exc, "request_id", "") or "",
            ) from exc
        except BadRequestError as exc:
            raise AIProviderError(
                category="bad_request",
                user_message="امکان پاسخ‌گویی به این پیام وجود ندارد. لطفاً پرسش را کوتاه‌تر و روشن‌تر بنویسید.",
                request_id=getattr(exc, "request_id", "") or "",
            ) from exc
        except APIStatusError as exc:
            raise AIProviderError(
                category=f"api_status_{exc.status_code}",
                user_message=TEMPORARY_ERROR_MESSAGE,
                retryable=exc.status_code >= 500,
                request_id=getattr(exc, "request_id", "") or "",
            ) from exc
        except OpenAIError as exc:
            raise AIProviderError(
                category="provider_error",
                user_message=TEMPORARY_ERROR_MESSAGE,
                request_id=getattr(exc, "request_id", "") or "",
            ) from exc
        finally:
            close = getattr(stream, "close", None)
            if callable(close):
                try:
                    close()
                except Exception:
                    pass
