from django.conf import settings

from apps.chat.models import Message

from .base import AIProviderError


def build_conversation_context(conversation):
    recent_messages = list(
        Message.objects.filter(conversation=conversation).order_by("-created_at", "-id")[
            : settings.AI_CONTEXT_MESSAGE_LIMIT
        ]
    )

    selected_messages = []
    character_count = 0
    for message in recent_messages:
        next_count = character_count + len(message.content)
        if selected_messages and next_count > settings.AI_CONTEXT_CHARACTER_LIMIT:
            break
        selected_messages.append(message)
        character_count = next_count

    role_map = {
        Message.Role.CUSTOMER: "user",
        Message.Role.ASSISTANT: "assistant",
    }
    return [
        {"role": role_map[message.role], "content": message.content}
        for message in reversed(selected_messages)
    ]


def get_ai_provider():
    if settings.AI_PROVIDER == "disabled":
        raise AIProviderError(
            category="provider_disabled",
            user_message="پاسخ‌گویی هوشمند هنوز برای این دستگاه فعال نشده است.",
        )

    if settings.AI_PROVIDER == "openai":
        from .openai_provider import OpenAIProvider

        return OpenAIProvider()

    raise AIProviderError(
        category="unsupported_provider",
        user_message="سرویس پاسخ‌گویی هنوز برای این دستگاه آماده نشده است.",
    )
