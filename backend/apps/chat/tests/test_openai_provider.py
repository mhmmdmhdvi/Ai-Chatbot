from types import SimpleNamespace
from unittest.mock import Mock, patch

import httpx
from django.test import SimpleTestCase, override_settings
from openai import APITimeoutError

from apps.chat.ai import AIProviderError
from apps.chat.ai.openai_provider import OpenAIProvider


class FakeOpenAIStream:
    def __init__(self, events):
        self.events = events
        self.response = SimpleNamespace(headers={"x-request-id": "request-from-header"})
        self.closed = False

    def __iter__(self):
        return iter(self.events)

    def close(self):
        self.closed = True


@override_settings(
    OPENAI_API_KEY="test-key",
    OPENAI_MODEL="test-model",
    OPENAI_TIMEOUT_SECONDS=15,
    OPENAI_MAX_OUTPUT_TOKENS=500,
)
class OpenAIProviderTests(SimpleTestCase):
    @patch("apps.chat.ai.openai_provider.OpenAI")
    def test_stream_uses_private_bounded_responses_request(self, openai_client_class):
        response = SimpleNamespace(
            id="response-1",
            model="test-model",
            usage=SimpleNamespace(input_tokens=12, output_tokens=8, total_tokens=20),
        )
        stream = FakeOpenAIStream(
            [
                SimpleNamespace(type="response.output_text.delta", delta="سلام"),
                SimpleNamespace(type="response.completed", response=response),
            ]
        )
        client = Mock()
        client.responses.create.return_value = stream
        openai_client_class.return_value = client

        provider = OpenAIProvider()
        events = list(provider.stream_response([{"role": "user", "content": "سلام"}]))

        openai_client_class.assert_called_once_with(
            api_key="test-key",
            timeout=15.0,
            max_retries=1,
        )
        request = client.responses.create.call_args.kwargs
        self.assertEqual(request["model"], "test-model")
        self.assertEqual(request["max_output_tokens"], 500)
        self.assertIn("مشاور هوشمند مگاتایت", request["instructions"])
        self.assertIn("فروشنده حرفه‌ای", request["instructions"])
        self.assertIn("فارسی روان", request["instructions"])
        self.assertIn("نه فشار برای فروش", request["instructions"])
        self.assertIn("کاشت میلگرد", request["instructions"])
        self.assertIn("مهندس سازه", request["instructions"])
        self.assertFalse(request["store"])
        self.assertTrue(request["stream"])
        self.assertEqual(events[0].delta, "سلام")
        self.assertEqual(events[-1].completion.request_id, "request-from-header")
        self.assertTrue(stream.closed)

    @patch("apps.chat.ai.openai_provider.OpenAI")
    def test_timeout_is_translated_without_exposing_provider_details(self, openai_client_class):
        client = Mock()
        client.responses.create.side_effect = APITimeoutError(
            request=httpx.Request("POST", "https://api.openai.com/v1/responses")
        )
        openai_client_class.return_value = client
        provider = OpenAIProvider()

        with self.assertRaises(AIProviderError) as context:
            list(provider.stream_response([{"role": "user", "content": "سلام"}]))

        self.assertEqual(context.exception.category, "connection")
        self.assertTrue(context.exception.retryable)
        self.assertIn("موقتاً", context.exception.user_message)
