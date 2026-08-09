from axes.models import AccessAttempt
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient


class AuthenticationApiTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="kiosk",
            password="Strong-test-password-123!",
        )
        self.client = APIClient(enforce_csrf_checks=True)
        csrf_response = self.client.get(reverse("accounts:csrf"))
        self.assertEqual(csrf_response.status_code, 200)
        self.csrf_token = self.client.cookies["csrftoken"].value

    def login(self, username="kiosk", password="Strong-test-password-123!"):
        return self.client.post(
            reverse("accounts:login"),
            {"username": username, "password": password},
            format="json",
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )

    def test_csrf_cookie_is_required_for_login(self):
        client = APIClient(enforce_csrf_checks=True)
        response = client.post(
            reverse("accounts:login"),
            {"username": "kiosk", "password": "Strong-test-password-123!"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_valid_login_rotates_session_and_returns_current_user(self):
        self.client.cookies["sessionid"] = "attacker-controlled-session"
        response = self.login()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["username"], "kiosk")
        self.assertFalse(response.data["is_staff"])
        self.assertNotEqual(self.client.cookies["sessionid"].value, "attacker-controlled-session")

        me_response = self.client.get(reverse("accounts:me"))
        self.assertEqual(me_response.status_code, 200)
        self.assertEqual(me_response.data["id"], self.user.id)

    def test_invalid_credentials_return_same_generic_persian_error(self):
        wrong_password = self.login(password="wrong")
        wrong_username = self.login(username="unknown", password="wrong")

        self.assertEqual(wrong_password.status_code, 400)
        self.assertEqual(wrong_username.status_code, 400)
        self.assertEqual(wrong_password.data, wrong_username.data)
        self.assertEqual(wrong_password.data["detail"], "نام کاربری یا رمز عبور نادرست است.")

    def test_failed_logins_are_recorded_and_temporarily_locked(self):
        responses = [self.login(password="wrong") for _ in range(5)]
        locked_response = self.login()

        self.assertTrue(AccessAttempt.objects.filter(username="kiosk").exists())
        self.assertEqual(responses[-1].status_code, 429)
        self.assertEqual(locked_response.status_code, 429)

    def test_logout_ends_authenticated_session(self):
        self.assertEqual(self.login().status_code, 200)
        rotated_csrf_token = self.client.cookies["csrftoken"].value
        response = self.client.post(
            reverse("accounts:logout"),
            format="json",
            HTTP_X_CSRFTOKEN=rotated_csrf_token,
        )
        self.assertEqual(response.status_code, 204)
        self.assertIn(self.client.get(reverse("accounts:me")).status_code, (401, 403))

    def test_no_registration_endpoint_exists(self):
        response = self.client.post(
            "/api/v1/auth/register/",
            {"username": "new", "password": "new"},
            format="json",
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )
        self.assertEqual(response.status_code, 404)


class AdminAccessTests(TestCase):
    def test_normal_kiosk_user_cannot_access_admin(self):
        kiosk_user = get_user_model().objects.create_user(
            username="kiosk",
            password="Strong-test-password-123!",
        )
        self.client.force_login(kiosk_user)
        response = self.client.get(reverse("admin:index"))
        self.assertEqual(response.status_code, 302)

    def test_superuser_can_access_admin(self):
        admin_user = get_user_model().objects.create_superuser(
            username="admin",
            email="admin@example.com",
            password="Strong-test-password-123!",
        )
        self.client.force_login(admin_user)
        response = self.client.get(reverse("admin:index"))
        self.assertEqual(response.status_code, 200)
