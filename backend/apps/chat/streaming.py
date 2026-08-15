import json
import logging
import time

from django.db import transaction
from django.utils import timezone

from apps.knowledge.models import MessageSource
from apps.knowledge.retrieval import (
    KnowledgeRetrievalError,
    build_grounding_context,
    extract_product_codes,
    has_active_knowledge,
    retrieve_knowledge,
)

from .ai import AIProviderError, build_conversation_context, get_ai_provider
from .models import AIResponseLog, Message
from .serializers import MessageSerializer
from .usage import estimate_completion_cost_usd


logger = logging.getLogger(__name__)


def build_knowledge_query(conversation, customer_message):
    current_question = customer_message.content
    if extract_product_codes(current_question):
        return current_question

    previous_customer_messages = list(
        Message.objects.filter(
            conversation=conversation,
            role=Message.Role.CUSTOMER,
        )
        .exclude(pk=customer_message.pk)
        .order_by("-created_at", "-id")[:4]
    )
    for previous_message in previous_customer_messages:
        if extract_product_codes(previous_message.content):
            return f"{previous_message.content}\n{current_question}"

    # Brief customer replies such as «سنگ», «نمای عمودی» or «فضای باز» depend
    # on the immediately preceding customer turn. Preserve that context for
    # retrieval even when no specific product code has been mentioned yet.
    if previous_customer_messages and len(current_question.split()) <= 12:
        return f"{previous_customer_messages[0].content}\n{current_question}"
    return current_question


def sse_event(event_name, payload):
    data = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event_name}\ndata: {data}\n\n"


def replay_conversation_response(*, customer_message, response_log):
    """Replay a completed request without contacting the AI provider again."""
    assistant_message = response_log.assistant_message
    if assistant_message is None:
        raise ValueError("A completed AI response log must have an assistant message.")

    yield sse_event(
        "customer",
        {
            "message": MessageSerializer(customer_message).data,
            "ai_status": "completed",
            "replayed": True,
        },
    )
    yield sse_event(
        "completed",
        {
            "customer_message": MessageSerializer(customer_message).data,
            "assistant_message": MessageSerializer(assistant_message).data,
            "ai_status": "completed",
            "replayed": True,
        },
    )


def fail_response_log(response_log, *, category, latency_ms, request_id=""):
    AIResponseLog.objects.filter(
        pk=response_log.pk,
        status=AIResponseLog.Status.PENDING,
    ).update(
        status=AIResponseLog.Status.FAILED,
        error_category=category[:50],
        request_id=request_id[:100],
        latency_ms=min(max(0, latency_ms), 2_147_483_647),
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
        attempt_is_active = AIResponseLog.objects.filter(
            pk=response_log.pk,
            status=AIResponseLog.Status.PENDING,
        ).update(provider=provider.name, model=provider.model)
        if not attempt_is_active:
            yield sse_event(
                "error",
                {
                    "detail": "این تلاش منقضی شده و با تلاش جدیدی جایگزین شده است.",
                    "retryable": True,
                    "ai_status": "error",
                    "code": "request_attempt_superseded",
                },
            )
            return
        response_log.provider = provider.name
        response_log.model = provider.model

        knowledge_is_active = has_active_knowledge()
        retrieval_hits = retrieve_knowledge(
            build_knowledge_query(conversation, customer_message)
        )
        messages = build_conversation_context(conversation)
        if knowledge_is_active:
            messages.insert(
                0,
                {"role": "developer", "content": build_grounding_context(retrieval_hits)},
            )

        for event in provider.stream_response(messages):
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
            estimated_cost_usd = estimate_completion_cost_usd(
                input_tokens=completion.input_tokens,
                cached_input_tokens=completion.cached_input_tokens,
                output_tokens=completion.output_tokens,
            )
            attempt_is_active = True
            with transaction.atomic():
                locked_response_log = AIResponseLog.objects.select_for_update().get(
                    pk=response_log.pk
                )
                if locked_response_log.status != AIResponseLog.Status.PENDING:
                    attempt_is_active = False
                    if (
                        locked_response_log.status == AIResponseLog.Status.FAILED
                        and locked_response_log.error_category
                        == "request_lease_expired"
                    ):
                        locked_response_log.model = completion.model or provider.model
                        locked_response_log.provider_response_id = (
                            completion.provider_response_id
                        )
                        locked_response_log.request_id = completion.request_id
                        locked_response_log.input_tokens = completion.input_tokens
                        locked_response_log.cached_input_tokens = completion.cached_input_tokens
                        locked_response_log.output_tokens = completion.output_tokens
                        locked_response_log.total_tokens = completion.total_tokens
                        locked_response_log.estimated_cost_usd = estimated_cost_usd
                        locked_response_log.save(
                            update_fields=(
                                "model",
                                "provider_response_id",
                                "request_id",
                                "input_tokens",
                                "cached_input_tokens",
                                "output_tokens",
                                "total_tokens",
                                "estimated_cost_usd",
                            )
                        )
                else:
                    assistant_message = Message.objects.create(
                        conversation=conversation,
                        role=Message.Role.ASSISTANT,
                        content=content,
                    )
                    MessageSource.objects.bulk_create(
                        [
                            MessageSource(
                                message=assistant_message,
                                chunk_id=hit.chunk_id,
                                similarity=hit.similarity,
                                rank=rank,
                            )
                            for rank, hit in enumerate(retrieval_hits, start=1)
                        ]
                    )
                    locked_response_log.assistant_message = assistant_message
                    locked_response_log.status = AIResponseLog.Status.COMPLETED
                    locked_response_log.model = completion.model or provider.model
                    locked_response_log.provider_response_id = completion.provider_response_id
                    locked_response_log.request_id = completion.request_id
                    locked_response_log.input_tokens = completion.input_tokens
                    locked_response_log.cached_input_tokens = completion.cached_input_tokens
                    locked_response_log.output_tokens = completion.output_tokens
                    locked_response_log.total_tokens = completion.total_tokens
                    locked_response_log.estimated_cost_usd = estimated_cost_usd
                    locked_response_log.latency_ms = min(
                        max(0, latency_ms),
                        2_147_483_647,
                    )
                    locked_response_log.completed_at = timezone.now()
                    locked_response_log.error_category = ""
                    locked_response_log.save(
                        update_fields=(
                            "assistant_message",
                            "status",
                            "model",
                            "provider_response_id",
                            "request_id",
                            "input_tokens",
                            "cached_input_tokens",
                            "output_tokens",
                            "total_tokens",
                            "estimated_cost_usd",
                            "latency_ms",
                            "completed_at",
                            "error_category",
                        )
                    )
                    conversation.save(update_fields=("last_activity_at",))

            if not attempt_is_active:
                yield sse_event(
                    "error",
                    {
                        "detail": "این تلاش منقضی شده و با تلاش جدیدی جایگزین شده است.",
                        "retryable": True,
                        "ai_status": "error",
                        "code": "request_attempt_superseded",
                    },
                )
                return

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
    except KnowledgeRetrievalError:
        latency_ms = round((time.monotonic() - started_at) * 1000)
        fail_response_log(
            response_log,
            category="knowledge_retrieval",
            latency_ms=latency_ms,
        )
        yield sse_event(
            "error",
            {
                "detail": "بازیابی اطلاعات مگاتایت موقتاً ممکن نیست. لطفاً کمی بعد دوباره تلاش کنید.",
                "retryable": True,
                "ai_status": "error",
            },
        )
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
