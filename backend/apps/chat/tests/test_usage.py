from decimal import Decimal

from django.test import SimpleTestCase, override_settings

from apps.chat.usage import estimate_completion_cost_usd, openai_cost_rates_configured


class CompletionCostTests(SimpleTestCase):
    @override_settings(
        OPENAI_INPUT_PRICE_PER_MILLION_USD=Decimal("2"),
        OPENAI_CACHED_INPUT_PRICE_PER_MILLION_USD=Decimal("0.5"),
        OPENAI_OUTPUT_PRICE_PER_MILLION_USD=Decimal("8"),
    )
    def test_estimate_separates_cached_input_tokens(self):
        self.assertEqual(
            estimate_completion_cost_usd(
                input_tokens=1_000_000,
                cached_input_tokens=250_000,
                output_tokens=100_000,
            ),
            Decimal("2.425000"),
        )
        self.assertTrue(openai_cost_rates_configured())

    @override_settings(
        OPENAI_INPUT_PRICE_PER_MILLION_USD=Decimal("0"),
        OPENAI_CACHED_INPUT_PRICE_PER_MILLION_USD=Decimal("0"),
        OPENAI_OUTPUT_PRICE_PER_MILLION_USD=Decimal("0"),
    )
    def test_unconfigured_rates_produce_zero_estimate(self):
        self.assertEqual(
            estimate_completion_cost_usd(
                input_tokens=100,
                cached_input_tokens=200,
                output_tokens=50,
            ),
            Decimal("0.000000"),
        )
        self.assertFalse(openai_cost_rates_configured())
