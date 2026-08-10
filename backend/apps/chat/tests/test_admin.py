from django.contrib import admin
from django.contrib.auth import get_user_model
from django.test import RequestFactory, TestCase

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
        self.assertEqual(
            set(model_admin.get_readonly_fields(self.request)),
            {field.name for field in AIResponseLog._meta.fields},
        )
