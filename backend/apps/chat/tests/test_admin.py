from decimal import Decimal

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.test import RequestFactory, TestCase
from django.urls import reverse

from apps.chat.admin import AIResponseLogInline, MessageInline
from apps.chat.models import AIResponseLog, Conversation, Customer, Message


class ChatAdminConfigurationTests(TestCase):
    def setUp(self):
        self.request = RequestFactory().get("/admin/")
        self.request.user = get_user_model().objects.create_superuser(
            username="admin",
            email="admin@example.com",
            password="Strong-test-password-123!",
        )

    def test_customer_admin_supports_search_and_is_read_only(self):
        model_admin = admin.site._registry[Customer]

        self.assertEqual(model_admin.search_fields, ("name", "phone_number"))
        self.assertEqual(
            set(model_admin.get_readonly_fields(self.request)),
            {field.name for field in Customer._meta.fields},
        )
        self.assertFalse(model_admin.has_add_permission(self.request))
        self.assertFalse(model_admin.has_delete_permission(self.request))

    def test_conversation_admin_has_filters_search_and_ordered_messages(self):
        model_admin = admin.site._registry[Conversation]
        message_inline = MessageInline(Conversation, admin.site)
        ai_log_inline = AIResponseLogInline(Conversation, admin.site)

        self.assertEqual(model_admin.list_filter, ("status", "started_at", "customer"))
        self.assertIn("customer__phone_number", model_admin.search_fields)
        self.assertEqual(message_inline.ordering, ("created_at", "id"))
        self.assertEqual(message_inline.readonly_fields, ("role", "content", "created_at"))
        self.assertIn("latency_ms", ai_log_inline.readonly_fields)
        self.assertIn("estimated_cost_usd", ai_log_inline.readonly_fields)
        self.assertFalse(model_admin.has_delete_permission(self.request))

    def test_message_admin_is_registered_and_content_is_searchable(self):
        model_admin = admin.site._registry[Message]

        self.assertIn("content", model_admin.search_fields)
        self.assertEqual(
            set(model_admin.get_readonly_fields(self.request)),
            {field.name for field in Message._meta.fields},
        )

    def test_ai_response_log_is_registered_and_read_only(self):
        model_admin = admin.site._registry[AIResponseLog]

        self.assertIn("provider_response_id", model_admin.search_fields)
        self.assertIn("status", model_admin.list_filter)
        self.assertIn("total_tokens", model_admin.list_display)
        self.assertIn("estimated_cost_usd", model_admin.list_display)
        self.assertEqual(
            set(model_admin.get_readonly_fields(self.request)),
            {field.name for field in AIResponseLog._meta.fields},
        )

    def test_ai_response_log_changelist_shows_filtered_usage_summary(self):
        customer = Customer.objects.create(name="محمد", phone_number="+989121234567")
        conversation = Conversation.objects.create(
            customer=customer,
            created_by=self.request.user,
        )
        customer_message = Message.objects.create(
            conversation=conversation,
            role=Message.Role.CUSTOMER,
            content="مگاتایت S چیست؟",
        )
        AIResponseLog.objects.create(
            conversation=conversation,
            customer_message=customer_message,
            provider="openai",
            model="test-model",
            status=AIResponseLog.Status.COMPLETED,
            input_tokens=120,
            cached_input_tokens=20,
            output_tokens=30,
            total_tokens=150,
            estimated_cost_usd=Decimal("0.001250"),
        )
        self.client.force_login(self.request.user)

        response = self.client.get(reverse("admin:chat_airesponselog_changelist"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "مصرف API در نتایج فعلی")
        self.assertEqual(response.context["usage_totals"]["total_tokens"], 150)
        self.assertEqual(
            response.context["usage_totals"]["estimated_cost_usd"],
            Decimal("0.001250"),
        )
