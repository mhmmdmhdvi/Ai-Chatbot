from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings


USD_QUANTUM = Decimal("0.000001")
TOKENS_PER_MILLION = Decimal("1000000")


def estimate_completion_cost_usd(*, input_tokens, cached_input_tokens, output_tokens):
    cached_tokens = min(max(0, cached_input_tokens), max(0, input_tokens))
    uncached_tokens = max(0, input_tokens - cached_tokens)
    cost = (
        Decimal(uncached_tokens) * settings.OPENAI_INPUT_PRICE_PER_MILLION_USD
        + Decimal(cached_tokens) * settings.OPENAI_CACHED_INPUT_PRICE_PER_MILLION_USD
        + Decimal(max(0, output_tokens)) * settings.OPENAI_OUTPUT_PRICE_PER_MILLION_USD
    ) / TOKENS_PER_MILLION
    return cost.quantize(USD_QUANTUM, rounding=ROUND_HALF_UP)


def openai_cost_rates_configured():
    return any(
        rate > 0
        for rate in (
            settings.OPENAI_INPUT_PRICE_PER_MILLION_USD,
            settings.OPENAI_CACHED_INPUT_PRICE_PER_MILLION_USD,
            settings.OPENAI_OUTPUT_PRICE_PER_MILLION_USD,
        )
    )
