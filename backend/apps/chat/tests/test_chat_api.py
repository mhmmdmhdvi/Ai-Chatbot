from datetime import timedelta
import json
import uuid
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.chat.ai import AICompletion, AIProviderError, AIStreamEvent
from apps.chat.models import AIResponseLog, Conversation, Customer, Message
from apps.chat.streaming import build_knowledge_query
from apps.knowledge.models import Document, DocumentChunk, DocumentVersion, MessageSource
from apps.knowledge.retrieval import RetrievalHit


def read_sse_events(response):
    content = b"".join(response.streaming_content).decode("utf-8")
    events = []
    for block in content.strip().split("\n\n"):
        event_name = "message"
        data_lines = []
        for line in block.splitlines():
            if line.startswith("event:"):
                event_name = line.removeprefix("event:").strip()
            elif line.startswith("data:"):
                data_lines.append(line.removeprefix("data:").strip())
        if data_lines:
            events.append((event_name, json.loads("\n".join(data_lines))))
    return events


class SuccessfulAIProvider:
    name = "test-provider"
    model = "test-persian-model"

    def __init__(self):
        self.messages = None

    def stream_response(self, messages):
        self.messages = messages
        yield AIStreamEvent(type="delta", delta="ساعت کاری ما ")
        yield AIStreamEvent(type="delta", delta="هر روز از ۹ تا ۱۸ است.")
        yield AIStreamEvent(
            type="completed",
            completion=AICompletion(
                provider_response_id="response-test-1",
                request_id="request-test-1",
                model=self.model,
                input_tokens=20,
                cached_input_tokens=5,
                output_tokens=10,
                total_tokens=30,
            ),
        )


class FailingAIProvider:
    name = "test-provider"
    model = "test-persian-model"

    def stream_response(self, messages):
        yield AIStreamEvent(type="delta", delta="پاسخ ناقص")
        raise AIProviderError(
            category="connection",
            user_message="سرویس پاسخ‌گویی موقتاً در دسترس نیست.",
            retryable=True,
        )


class SupersededAIProvider:
    name = "test-provider"
    model = "test-persian-model"

    def __init__(self):
        self.expired_at = None

    def stream_response(self, messages):
        yield AIStreamEvent(type="delta", delta="پاسخ دیرهنگام")
        self.expired_at = timezone.now()
        AIResponseLog.objects.filter(status=AIResponseLog.Status.PENDING).update(
            status=AIResponseLog.Status.FAILED,
            error_category="request_lease_expired",
            latency_ms=180_000,
            completed_at=self.expired_at,
        )
        yield AIStreamEvent(
            type="completed",
            completion=AICompletion(
                provider_response_id="response-superseded-1",
                request_id="request-superseded-1",
                model=self.model,
                input_tokens=31,
                output_tokens=11,
                total_tokens=42,
            ),
        )


class ChatApiTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="kiosk",
            password="Strong-test-password-123!",
        )
        self.client = APIClient()
        self.client.force_login(self.user)

    def test_follow_up_retrieval_keeps_the_recent_product_context(self):
        conversation_id = self.create_session().data["id"]
        conversation = Conversation.objects.get(pk=conversation_id)
        previous = Message.objects.create(
            conversation=conversation,
            role=Message.Role.CUSTOMER,
            content="حداقل زمان پخت اولیه Megatite S چقدر است؟",
        )
        Message.objects.create(
            conversation=conversation,
            role=Message.Role.ASSISTANT,
            content="در دمای ۲۵ درجه، ۱۲ ساعت است.",
        )
        follow_up = Message.objects.create(
            conversation=conversation,
            role=Message.Role.CUSTOMER,
            content="در دمای ۱۰ درجه چقدر زمان لازم است؟",
        )

        query = build_knowledge_query(conversation, follow_up)

        self.assertEqual(query, f"{previous.content}\n{follow_up.content}")

    def test_new_explicit_product_replaces_previous_retrieval_context(self):
        conversation_id = self.create_session().data["id"]
        conversation = Conversation.objects.get(pk=conversation_id)
        Message.objects.create(
            conversation=conversation,
            role=Message.Role.CUSTOMER,
            content="Megatite S چه کاربردی دارد؟",
        )
        current = Message.objects.create(
            conversation=conversation,
            role=Message.Role.CUSTOMER,
            content="حالا Megatite C را توضیح بده.",
        )

        self.assertEqual(build_knowledge_query(conversation, current), current.content)

    def test_short_generic_follow_up_keeps_recent_customer_context(self):
        conversation_id = self.create_session().data["id"]
        conversation = Conversation.objects.get(pk=conversation_id)
        previous = Message.objects.create(
            conversation=conversation,
            role=Message.Role.CUSTOMER,
            content="برای انتخاب چسب مناسب سنگ راهنمایی می‌خواهم.",
        )
        Message.objects.create(
            conversation=conversation,
            role=Message.Role.ASSISTANT,
            content="سنگ برای نمای عمودی، کف یا ترمیم استفاده می‌شود؟",
        )
        current = Message.objects.create(
            conversation=conversation,
            role=Message.Role.CUSTOMER,
            content="نمای عمودی",
        )

        self.assertEqual(
            build_knowledge_query(conversation, current),
            f"{previous.content}\n{current.content}",
        )

    def test_explicit_compound_products_replace_stale_product_context(self):
        cases = (
            (
                "Megatite CT چه کاربردی دارد؟",
                "زمان پخت اولیه LTM و LTC در دمای ۲۵ درجه چقدر است؟",
            ),
            (
                "Megatite LT چه کاربردی دارد؟",
                "ترتیب افزودن پیگمنت به اجزای A و B چیست؟",
            ),
            (
                "Megatite C چه کاربردی دارد؟",
                "حداقل دمای اجرای HC3000 چقدر است؟",
            ),
            (
                "Megatite C چه کاربردی دارد؟",
                "حداقل دمای اجرای اچ سی ۳۰۰۰ چقدر است؟",
            ),
            (
                "Megatite C چه کاربردی دارد؟",
                "حالا مگاتایت HC را توضیح بده.",
            ),
        )

        for previous_content, current_content in cases:
            with self.subTest(current=current_content):
                conversation_id = self.create_session().data["id"]
                conversation = Conversation.objects.get(pk=conversation_id)
                Message.objects.create(
                    conversation=conversation,
                    role=Message.Role.CUSTOMER,
                    content=previous_content,
                )
                current = Message.objects.create(
                    conversation=conversation,
                    role=Message.Role.CUSTOMER,
                    content=current_content,
                )

                self.assertEqual(
                    build_knowledge_query(conversation, current),
                    current.content,
                )

    def test_hc3000_follow_up_keeps_the_recent_product_context(self):
        conversation_id = self.create_session().data["id"]
        conversation = Conversation.objects.get(pk=conversation_id)
        previous = Message.objects.create(
            conversation=conversation,
            role=Message.Role.CUSTOMER,
            content="Megatite HC3000 برای کاشت میلگرد چه کاربردی دارد؟",
        )
        current = Message.objects.create(
            conversation=conversation,
            role=Message.Role.CUSTOMER,
            content="عمق کاشت چقدر باشد؟",
        )

        self.assertEqual(
            build_knowledge_query(conversation, current),
            f"{previous.content}\n{current.content}",
        )

    def create_session(self, name="محمد رضایی", phone_number="09121234567"):
        return self.client.post(
            reverse("chat:session-create"),
            {"name": name, "phone_number": phone_number},
            format="json",
        )

    def test_customer_endpoints_require_authentication(self):
        client = APIClient()
        response = client.post(
            reverse("chat:session-create"),
            {"name": "محمد", "phone_number": "09121234567"},
            format="json",
        )
        self.assertIn(response.status_code, (401, 403))

    def test_anonymous_session_starts_without_creating_fake_customer_data(self):
        response = self.client.post(reverse("chat:session-create"), {}, format="json")

        self.assertEqual(response.status_code, 201)
        self.assertIsNone(response.data["customer"])
        self.assertEqual(Customer.objects.count(), 0)
        self.assertIsNone(Conversation.objects.get(id=response.data["id"]).customer)

    @override_settings(AI_PROVIDER="disabled", OPENAI_API_KEY="")
    def test_first_message_can_generate_before_customer_details_are_saved(self):
        conversation_id = self.create_session(name="", phone_number="").data["id"]

        response = self.client.post(
            reverse("chat:conversation-messages", args=(conversation_id,)),
            {"content": "مگاتایت S چه کاربردی دارد؟"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        events = read_sse_events(response)
        self.assertEqual(events[0][0], "customer")
        self.assertEqual(events[-1][0], "error")
        self.assertEqual(Message.objects.count(), 1)
        self.assertEqual(AIResponseLog.objects.count(), 1)

    def test_customer_details_are_attached_with_normalized_persian_phone(self):
        conversation_id = self.create_session(name="", phone_number="").data["id"]

        response = self.client.patch(
            reverse("chat:conversation-customer", args=(conversation_id,)),
            {"name": "محمد رضایی", "phone_number": "۰۹۱۲۱۲۳۴۵۶۷"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["customer"]["name"], "محمد رضایی")
        self.assertEqual(response.data["customer"]["phone_number"], "+989121234567")
        conversation = Conversation.objects.get(pk=conversation_id)
        self.assertEqual(conversation.customer.phone_number, "+989121234567")

    def test_customer_details_reuse_phone_but_cannot_replace_conversation_customer(self):
        Customer.objects.create(name="نام قبلی", phone_number="+989121234567")
        conversation_id = self.create_session(name="", phone_number="").data["id"]
        url = reverse("chat:conversation-customer", args=(conversation_id,))

        first = self.client.patch(
            url,
            {"name": "نام جدید", "phone_number": "09121234567"},
            format="json",
        )
        conflict = self.client.patch(
            url,
            {"name": "مشتری دیگر", "phone_number": "09351234567"},
            format="json",
        )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(Customer.objects.count(), 1)
        self.assertEqual(Customer.objects.get().name, "نام جدید")
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(conflict.data["code"], "conversation_customer_conflict")

    def test_partial_customer_details_are_rejected(self):
        response = self.client.post(
            reverse("chat:session-create"),
            {"name": "محمد"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Conversation.objects.count(), 0)

    def test_new_session_normalizes_persian_phone_digits(self):
        response = self.create_session(phone_number="۰۹۱۲۱۲۳۴۵۶۷")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["customer"]["phone_number"], "+989121234567")
        self.assertEqual(response.data["status"], Conversation.Status.ACTIVE)
        self.assertEqual(response.data["language"], "fa")
        self.assertEqual(response.data["ai_status"], "disabled")

    def test_invalid_or_non_iranian_phone_is_rejected(self):
        invalid = self.create_session(phone_number="123")
        non_iranian = self.create_session(phone_number="+14155552671")

        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(non_iranian.status_code, 400)
        self.assertEqual(Customer.objects.count(), 0)

    def test_same_phone_reuses_customer_but_starts_fresh_conversation(self):
        first = self.create_session(name="محمد")
        second = self.create_session(name="محمد رضایی")

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(Customer.objects.count(), 1)
        self.assertEqual(Conversation.objects.count(), 2)
        self.assertNotEqual(first.data["id"], second.data["id"])
        self.assertEqual(
            Conversation.objects.get(id=first.data["id"]).status,
            Conversation.Status.CLOSED,
        )
        self.assertEqual(Customer.objects.get().name, "محمد رضایی")

    @override_settings(AI_PROVIDER="disabled", OPENAI_API_KEY="")
    def test_customer_message_is_saved_while_ai_is_disabled(self):
        conversation_id = self.create_session().data["id"]
        response = self.client.post(
            reverse("chat:conversation-messages", args=(conversation_id,)),
            {"content": "ساعت کاری شما چیست؟"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.streaming)
        events = read_sse_events(response)
        self.assertEqual(events[0][0], "customer")
        self.assertEqual(events[0][1]["message"]["role"], Message.Role.CUSTOMER)
        self.assertEqual(events[-1][0], "error")
        self.assertEqual(events[-1][1]["ai_status"], "error")
        self.assertEqual(Message.objects.get().content, "ساعت کاری شما چیست؟")
        response_log = AIResponseLog.objects.get()
        self.assertEqual(response_log.status, AIResponseLog.Status.FAILED)
        self.assertEqual(response_log.error_category, "provider_disabled")

        messages = self.client.get(
            reverse("chat:conversation-messages", args=(conversation_id,))
        )
        self.assertEqual(messages.status_code, 200)
        self.assertEqual(len(messages.data), 1)

    @override_settings(AI_PROVIDER="openai", OPENAI_API_KEY="test-key")
    def test_ai_response_streams_and_is_saved_once_with_usage(self):
        conversation_id = self.create_session().data["id"]
        provider = SuccessfulAIProvider()

        with patch("apps.chat.streaming.get_ai_provider", return_value=provider):
            response = self.client.post(
                reverse("chat:conversation-messages", args=(conversation_id,)),
                {"content": "ساعت کاری شما چیست؟"},
                format="json",
                HTTP_ACCEPT="text/event-stream, application/json",
            )
            events = read_sse_events(response)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response["Content-Type"], "text/event-stream; charset=utf-8")
        self.assertEqual(response["X-Accel-Buffering"], "no")
        self.assertEqual([name for name, _ in events], ["customer", "delta", "delta", "completed"])
        self.assertEqual(provider.messages[-1], {"role": "user", "content": "ساعت کاری شما چیست؟"})

        assistant_messages = Message.objects.filter(role=Message.Role.ASSISTANT)
        self.assertEqual(assistant_messages.count(), 1)
        self.assertEqual(assistant_messages.get().content, "ساعت کاری ما هر روز از ۹ تا ۱۸ است.")
        self.assertEqual(events[-1][1]["assistant_message"]["content"], assistant_messages.get().content)

        response_log = AIResponseLog.objects.get()
        self.assertEqual(response_log.status, AIResponseLog.Status.COMPLETED)
        self.assertEqual(response_log.assistant_message, assistant_messages.get())
        self.assertEqual(response_log.input_tokens, 20)
        self.assertEqual(response_log.cached_input_tokens, 5)
        self.assertEqual(response_log.output_tokens, 10)
        self.assertEqual(response_log.total_tokens, 30)
        self.assertEqual(response_log.provider_response_id, "response-test-1")

    @override_settings(AI_PROVIDER="openai", OPENAI_API_KEY="test-key")
    def test_grounded_ai_response_saves_answer_sources(self):
        conversation_id = self.create_session().data["id"]
        provider = SuccessfulAIProvider()
        document = Document.objects.create(title="Megatite S", source_key="megatite s")
        version = DocumentVersion.objects.create(
            document=document,
            version_number=1,
            file="knowledge/test.pdf",
            original_filename="Megatite S.pdf",
            sha256="c" * 64,
            status=DocumentVersion.Status.READY,
            is_active=True,
            embedding_model="text-embedding-3-large",
            embedding_dimensions=1024,
        )
        chunk = DocumentChunk.objects.create(
            version=version,
            page_number=2,
            chunk_index=0,
            content="متن مرجع مگاتایت اس",
            content_hash="d" * 64,
            character_count=22,
        )
        hit = RetrievalHit(
            chunk_id=chunk.id,
            document_title=document.title,
            original_filename=version.original_filename,
            page_number=2,
            content=chunk.content,
            similarity=0.91,
            ocr_used=True,
        )

        with (
            patch("apps.chat.streaming.get_ai_provider", return_value=provider),
            patch("apps.chat.streaming.has_active_knowledge", return_value=True),
            patch("apps.chat.streaming.retrieve_knowledge", return_value=[hit]),
        ):
            response = self.client.post(
                reverse("chat:conversation-messages", args=(conversation_id,)),
                {"content": "مگاتایت اس چیست؟"},
                format="json",
            )
            read_sse_events(response)

        self.assertEqual(provider.messages[0]["role"], "developer")
        self.assertIn("Megatite S.pdf", provider.messages[0]["content"])
        source = MessageSource.objects.get()
        self.assertEqual(source.chunk, chunk)
        self.assertEqual(source.rank, 1)
        self.assertAlmostEqual(source.similarity, 0.91)

    @override_settings(AI_PROVIDER="openai", OPENAI_API_KEY="test-key")
    def test_partial_ai_response_is_not_saved_when_stream_fails(self):
        conversation_id = self.create_session().data["id"]

        with patch("apps.chat.streaming.get_ai_provider", return_value=FailingAIProvider()):
            response = self.client.post(
                reverse("chat:conversation-messages", args=(conversation_id,)),
                {"content": "یک پرسش آزمایشی"},
                format="json",
            )
            events = read_sse_events(response)

        self.assertEqual([name for name, _ in events], ["customer", "delta", "error"])
        self.assertTrue(events[-1][1]["retryable"])
        self.assertEqual(Message.objects.filter(role=Message.Role.ASSISTANT).count(), 0)
        response_log = AIResponseLog.objects.get()
        self.assertEqual(response_log.status, AIResponseLog.Status.FAILED)
        self.assertEqual(response_log.error_category, "connection")

    @override_settings(AI_PROVIDER="openai", OPENAI_API_KEY="test-key")
    def test_failed_request_retry_keeps_immutable_attempt_logs(self):
        conversation_id = self.create_session().data["id"]
        client_request_id = uuid.uuid4()
        url = reverse("chat:conversation-messages", args=(conversation_id,))
        payload = {
            "content": "یک پرسش قابل تلاش دوباره",
            "client_request_id": str(client_request_id),
        }

        with patch("apps.chat.streaming.get_ai_provider", return_value=FailingAIProvider()):
            first_response = self.client.post(url, payload, format="json")
            first_events = read_sse_events(first_response)

        customer_message = Message.objects.get(role=Message.Role.CUSTOMER)
        first_attempt = AIResponseLog.objects.get()
        original_message_id = customer_message.id
        first_attempt_snapshot = (
            first_attempt.status,
            first_attempt.error_category,
            first_attempt.completed_at,
        )

        self.assertEqual(first_response.status_code, 201)
        self.assertEqual(first_events[-1][0], "error")
        self.assertEqual(first_attempt.status, AIResponseLog.Status.FAILED)
        self.assertEqual(customer_message.client_request_id, client_request_id)

        with patch(
            "apps.chat.streaming.get_ai_provider",
            return_value=SuccessfulAIProvider(),
        ):
            retry_response = self.client.post(url, payload, format="json")
            retry_events = read_sse_events(retry_response)

        self.assertEqual(retry_response.status_code, 200)
        self.assertEqual(
            [name for name, _ in retry_events],
            ["customer", "delta", "delta", "completed"],
        )
        self.assertEqual(Message.objects.filter(role=Message.Role.CUSTOMER).count(), 1)
        self.assertEqual(AIResponseLog.objects.count(), 2)
        self.assertEqual(Message.objects.get(role=Message.Role.CUSTOMER).id, original_message_id)
        first_attempt.refresh_from_db()
        self.assertEqual(
            (
                first_attempt.status,
                first_attempt.error_category,
                first_attempt.completed_at,
            ),
            first_attempt_snapshot,
        )
        completed_attempt = AIResponseLog.objects.get(
            status=AIResponseLog.Status.COMPLETED
        )
        self.assertNotEqual(completed_attempt.id, first_attempt.id)
        self.assertEqual(completed_attempt.error_category, "")
        self.assertEqual(completed_attempt.total_tokens, 30)

    @override_settings(AI_PROVIDER="openai", OPENAI_API_KEY="test-key")
    def test_completed_request_is_replayed_without_another_provider_call(self):
        conversation_id = self.create_session().data["id"]
        client_request_id = uuid.uuid4()
        url = reverse("chat:conversation-messages", args=(conversation_id,))
        payload = {
            "content": "پاسخ این درخواست فقط یک بار ساخته شود",
            "client_request_id": str(client_request_id),
        }

        with patch(
            "apps.chat.streaming.get_ai_provider",
            return_value=SuccessfulAIProvider(),
        ):
            first_response = self.client.post(url, payload, format="json")
            first_events = read_sse_events(first_response)

        with patch("apps.chat.streaming.get_ai_provider") as get_provider:
            replay_response = self.client.post(url, payload, format="json")
            replay_events = read_sse_events(replay_response)

        get_provider.assert_not_called()
        self.assertEqual(first_response.status_code, 201)
        self.assertEqual(replay_response.status_code, 200)
        self.assertEqual(first_events[-1][0], "completed")
        self.assertEqual(
            [name for name, _ in replay_events],
            ["customer", "completed"],
        )
        self.assertTrue(replay_events[0][1]["replayed"])
        self.assertTrue(replay_events[-1][1]["replayed"])
        self.assertEqual(Message.objects.filter(role=Message.Role.CUSTOMER).count(), 1)
        self.assertEqual(Message.objects.filter(role=Message.Role.ASSISTANT).count(), 1)
        self.assertEqual(AIResponseLog.objects.count(), 1)
        self.assertEqual(AIResponseLog.objects.get().total_tokens, 30)

    @override_settings(AI_PROVIDER="disabled", OPENAI_API_KEY="")
    def test_reusing_request_id_with_different_content_is_rejected(self):
        conversation_id = self.create_session().data["id"]
        client_request_id = uuid.uuid4()
        url = reverse("chat:conversation-messages", args=(conversation_id,))

        first_response = self.client.post(
            url,
            {
                "content": "پیام اصلی",
                "client_request_id": str(client_request_id),
            },
            format="json",
        )
        read_sse_events(first_response)
        conflict_response = self.client.post(
            url,
            {
                "content": "متن متفاوت",
                "client_request_id": str(client_request_id),
            },
            format="json",
        )

        self.assertEqual(conflict_response.status_code, 409)
        self.assertEqual(conflict_response.data["code"], "request_content_conflict")
        self.assertFalse(conflict_response.data["retryable"])
        self.assertEqual(Message.objects.filter(role=Message.Role.CUSTOMER).count(), 1)
        self.assertEqual(AIResponseLog.objects.count(), 1)

    @override_settings(AI_PROVIDER="disabled", OPENAI_API_KEY="")
    def test_same_content_with_different_request_ids_creates_two_requests(self):
        conversation_id = self.create_session().data["id"]
        url = reverse("chat:conversation-messages", args=(conversation_id,))
        content = "این پرسش عمداً دوبار ارسال می‌شود"

        for client_request_id in (uuid.uuid4(), uuid.uuid4()):
            response = self.client.post(
                url,
                {
                    "content": content,
                    "client_request_id": str(client_request_id),
                },
                format="json",
            )
            self.assertEqual(response.status_code, 201)
            read_sse_events(response)

        self.assertEqual(Message.objects.filter(role=Message.Role.CUSTOMER).count(), 2)
        self.assertEqual(AIResponseLog.objects.count(), 2)

    @override_settings(AI_PROVIDER="openai", OPENAI_API_KEY="test-key")
    def test_pending_duplicate_request_returns_retryable_conflict(self):
        conversation_id = self.create_session().data["id"]
        conversation = Conversation.objects.get(pk=conversation_id)
        client_request_id = uuid.uuid4()
        message = Message.objects.create(
            conversation=conversation,
            client_request_id=client_request_id,
            role=Message.Role.CUSTOMER,
            content="درخواست در حال پردازش",
        )
        AIResponseLog.objects.create(
            conversation=conversation,
            customer_message=message,
            provider="test-provider",
            model="test-model",
        )

        response = self.client.post(
            reverse("chat:conversation-messages", args=(conversation_id,)),
            {
                "content": message.content,
                "client_request_id": str(client_request_id),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "request_in_progress")
        self.assertTrue(response.data["retryable"])
        self.assertEqual(Message.objects.filter(role=Message.Role.CUSTOMER).count(), 1)
        self.assertEqual(AIResponseLog.objects.count(), 1)

    @override_settings(
        AI_PROVIDER="openai",
        OPENAI_API_KEY="test-key",
        AI_RESPONSE_PENDING_LEASE_SECONDS=180,
    )
    def test_stale_pending_request_is_failed_and_retried_with_new_attempt(self):
        conversation_id = self.create_session().data["id"]
        conversation = Conversation.objects.get(pk=conversation_id)
        client_request_id = uuid.uuid4()
        message = Message.objects.create(
            conversation=conversation,
            client_request_id=client_request_id,
            role=Message.Role.CUSTOMER,
            content="درخواست رهاشده",
        )
        stale_attempt = AIResponseLog.objects.create(
            conversation=conversation,
            customer_message=message,
            provider="test-provider",
            model="test-model",
        )
        stale_created_at = timezone.now() - timedelta(seconds=181)
        AIResponseLog.objects.filter(pk=stale_attempt.pk).update(
            created_at=stale_created_at
        )

        with patch(
            "apps.chat.streaming.get_ai_provider",
            return_value=SuccessfulAIProvider(),
        ):
            response = self.client.post(
                reverse("chat:conversation-messages", args=(conversation_id,)),
                {
                    "content": message.content,
                    "client_request_id": str(client_request_id),
                },
                format="json",
            )
            events = read_sse_events(response)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(events[-1][0], "completed")
        self.assertEqual(Message.objects.filter(role=Message.Role.CUSTOMER).count(), 1)
        self.assertEqual(Message.objects.filter(role=Message.Role.ASSISTANT).count(), 1)
        self.assertEqual(AIResponseLog.objects.count(), 2)
        stale_attempt.refresh_from_db()
        self.assertEqual(stale_attempt.status, AIResponseLog.Status.FAILED)
        self.assertEqual(stale_attempt.error_category, "request_lease_expired")
        self.assertIsNotNone(stale_attempt.completed_at)
        self.assertGreaterEqual(stale_attempt.latency_ms, 181_000)
        fresh_attempt = AIResponseLog.objects.exclude(pk=stale_attempt.pk).get()
        self.assertEqual(fresh_attempt.status, AIResponseLog.Status.COMPLETED)
        self.assertEqual(fresh_attempt.total_tokens, 30)

    @override_settings(AI_PROVIDER="openai", OPENAI_API_KEY="test-key")
    def test_superseded_completion_preserves_failure_and_records_billed_usage(self):
        conversation_id = self.create_session().data["id"]
        provider = SupersededAIProvider()

        with patch("apps.chat.streaming.get_ai_provider", return_value=provider):
            response = self.client.post(
                reverse("chat:conversation-messages", args=(conversation_id,)),
                {
                    "content": "پاسخی که پس از انقضای تلاش می‌رسد",
                    "client_request_id": str(uuid.uuid4()),
                },
                format="json",
            )
            events = read_sse_events(response)

        self.assertEqual(
            [name for name, _ in events],
            ["customer", "delta", "error"],
        )
        self.assertEqual(events[-1][1]["code"], "request_attempt_superseded")
        self.assertEqual(Message.objects.filter(role=Message.Role.ASSISTANT).count(), 0)
        response_log = AIResponseLog.objects.get()
        self.assertEqual(response_log.status, AIResponseLog.Status.FAILED)
        self.assertEqual(response_log.error_category, "request_lease_expired")
        self.assertEqual(response_log.completed_at, provider.expired_at)
        self.assertEqual(response_log.latency_ms, 180_000)
        self.assertEqual(response_log.provider_response_id, "response-superseded-1")
        self.assertEqual(response_log.request_id, "request-superseded-1")
        self.assertEqual(response_log.input_tokens, 31)
        self.assertEqual(response_log.output_tokens, 11)
        self.assertEqual(response_log.total_tokens, 42)

    def test_old_conversation_cannot_be_read_after_new_customer_starts(self):
        old_id = self.create_session().data["id"]
        self.create_session(name="علی", phone_number="09351234567")

        response = self.client.get(reverse("chat:conversation-messages", args=(old_id,)))
        self.assertEqual(response.status_code, 404)

    def test_another_authenticated_session_cannot_access_conversation(self):
        conversation_id = self.create_session().data["id"]
        other_user = get_user_model().objects.create_user(username="other", password="test")
        other_client = APIClient()
        other_client.force_login(other_user)

        response = other_client.get(
            reverse("chat:conversation-messages", args=(conversation_id,))
        )
        self.assertEqual(response.status_code, 404)

    def test_close_clears_customer_session_but_keeps_kiosk_logged_in(self):
        conversation_id = self.create_session().data["id"]
        close_response = self.client.post(
            reverse("chat:conversation-close", args=(conversation_id,)),
            format="json",
        )

        self.assertEqual(close_response.status_code, 204)
        self.assertEqual(
            Conversation.objects.get(id=conversation_id).status,
            Conversation.Status.CLOSED,
        )
        self.assertEqual(
            self.client.get(reverse("chat:session-current")).status_code,
            204,
        )
        self.assertEqual(self.client.get(reverse("accounts:me")).status_code, 200)

    def test_message_length_limit_is_enforced(self):
        conversation_id = self.create_session().data["id"]
        response = self.client.post(
            reverse("chat:conversation-messages", args=(conversation_id,)),
            {"content": "ا" * 2001},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Message.objects.count(), 0)
