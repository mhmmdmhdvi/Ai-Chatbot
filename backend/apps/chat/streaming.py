import json
import logging
import time

from django.db import transaction
from django.utils import timezone

from .ai import AIProviderError, build_conversation_context, get_ai_provider
from .models import AIResponseLog, Message
from .serializers import MessageSerializer


logger = logging.getLogger(__name__)


def sse_event(event_name, payload):
    data = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event_name}\ndata: {data}\n\n"


def fail_response_log(response_log, *, category, latency_ms, request_id=""):
    AIResponseLog.objects.filter(pk=response_log.pk).update(
        status=AIResponseLog.Status.FAILED,
        error_category=category[:50],
        request_id=request_id[:100],
        latency_ms=max(0, latency_ms),
        completed_at=timezone.now(),
    )


def stream_conversation_response(*, conversation, customer_message, response_log):
    yield sse_event(
        "customer",
        {
            "message": MessageSerializer(customer_message).data,
            "ai_status": "thinking",
        },
    )

    started_at = time.monotonic()
    completed = False
    assistant_chunks = []

    try:
        provider = get_ai_provider()
        response_log.provider = provider.name
        response_log.model = provider.model
        response_log.save(update_fields=("provider", "model"))

        for event in provider.stream_response(build_conversation_context(conversation)):
            if event.type == "delta":
                assistant_chunks.append(event.delta)
                yield sse_event("delta", {"delta": event.delta})
                continue

            if event.type != "completed" or event.completion is None:
                continue

            content = "".join(assistant_chunks).strip()
            if not content:
                raise AIProviderError(
                    category="empty_response",
                    user_message="پاسخی دریافت نشد. لطفاً کمی بعد دوباره تلاش کنید.",
                    retryable=True,
                )

            latency_ms = round((time.monotonic() - started_at) * 1000)
            completion = event.completion
            with transaction.atomic():
                assistant_message = Message.objects.create(
                    conversation=conversation,
                    role=Message.Role.ASSISTANT,
                    content=content,
                )
                response_log.assistant_message = assistant_message
                response_log.status = AIResponseLog.Status.COMPLETED
                response_log.model = completion.model or provider.model
                response_log.provider_response_id = completion.provider_response_id
                response_log.request_id = completion.request_id
                response_log.input_tokens = completion.input_tokens
                response_log.output_tokens = completion.output_tokens
                response_log.total_tokens = completion.total_tokens
                response_log.latency_ms = max(0, latency_ms)
                response_log.completed_at = timezone.now()
                response_log.error_category = ""
                response_log.save(
                    update_fields=(
                        "assistant_message",
                        "status",
                        "model",
                        "provider_response_id",
                        "request_id",
                        "input_tokens",
                        "output_tokens",
                        "total_tokens",
                        "latency_ms",
                        "completed_at",
                        "error_category",
                    )
                )
                conversation.save(update_fields=("last_activity_at",))

            completed = True
            yield sse_event(
                "completed",
                {
                    "customer_message": MessageSerializer(customer_message).data,
                    "assistant_message": MessageSerializer(assistant_message).data,
                    "ai_status": "completed",
                },
            )
            return

        raise AIProviderError(
            category="stream_ended_without_completion",
            user_message="پاسخی دریافت نشد. لطفاً کمی بعد دوباره تلاش کنید.",
            retryable=True,
        )
    except GeneratorExit:
        if not completed:
            latency_ms = round((time.monotonic() - started_at) * 1000)
            fail_response_log(
                response_log,
                category="client_disconnected",
                latency_ms=latency_ms,
            )
        raise
    except AIProviderError as exc:
        latency_ms = round((time.monotonic() - started_at) * 1000)
        fail_response_log(
            response_log,
            category=exc.category,
            latency_ms=latency_ms,
            request_id=exc.request_id,
        )
        yield sse_event(
            "error",
            {
                "detail": exc.user_message,
                "retryable": exc.retryable,
                "ai_status": "error",
            },
        )
    except Exception as exc:
        latency_ms = round((time.monotonic() - started_at) * 1000)
        category = type(exc).__name__
        logger.error(
            "Unexpected AI streaming failure conversation=%s category=%s",
            conversation.id,
            category,
        )
        fail_response_log(response_log, category=category, latency_ms=latency_ms)
        yield sse_event(
            "error",
            {
                "detail": "در پاسخ‌گویی مشکلی پیش آمد. پیام شما ذخیره شده است؛ لطفاً کمی بعد دوباره تلاش کنید.",
                "retryable": True,
                "ai_status": "error",
            },
        )
