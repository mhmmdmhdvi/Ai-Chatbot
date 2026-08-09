from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.chat.models import Conversation, Customer, Message


class ChatApiTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="kiosk",
            password="Strong-test-password-123!",
        )
        self.client = APIClient()
        self.client.force_login(self.user)

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

    def test_customer_message_is_saved_while_ai_is_disabled(self):
        conversation_id = self.create_session().data["id"]
        response = self.client.post(
            reverse("chat:conversation-messages", args=(conversation_id,)),
            {"content": "ساعت کاری شما چیست؟"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["ai_status"], "disabled")
        self.assertEqual(response.data["message"]["role"], Message.Role.CUSTOMER)
        self.assertEqual(Message.objects.get().content, "ساعت کاری شما چیست؟")

        messages = self.client.get(
            reverse("chat:conversation-messages", args=(conversation_id,))
        )
        self.assertEqual(messages.status_code, 200)
        self.assertEqual(len(messages.data), 1)

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
