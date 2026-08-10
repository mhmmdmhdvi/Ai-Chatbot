import phonenumbers
from django.conf import settings
from rest_framework import serializers

from .models import Conversation, Customer, Message


DIGIT_TRANSLATION = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def normalize_iranian_phone(value):
    value = value.translate(DIGIT_TRANSLATION).strip()
    try:
        number = phonenumbers.parse(value, "IR")
    except phonenumbers.NumberParseException as exc:
        raise serializers.ValidationError("شماره تلفن معتبر نیست.") from exc

    if not phonenumbers.is_valid_number(number) or number.country_code != 98:
        raise serializers.ValidationError("یک شماره تلفن معتبر ایران وارد کنید.")

    return phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164)


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ("id", "name", "phone_number")
        read_only_fields = fields


class CustomerSessionSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100, trim_whitespace=True, required=False, allow_blank=True)
    phone_number = serializers.CharField(max_length=30, trim_whitespace=True, required=False, allow_blank=True)
    kiosk_identifier = serializers.CharField(
        max_length=100,
        trim_whitespace=True,
        required=False,
        allow_blank=True,
    )

    def validate_phone_number(self, value):
        if not value:
            return value
        return normalize_iranian_phone(value)

    def validate(self, attrs):
        name = attrs.get("name", "")
        phone_number = attrs.get("phone_number", "")
        if bool(name) != bool(phone_number):
            raise serializers.ValidationError("نام و شماره تلفن باید با هم وارد شوند.")
        return attrs


class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ("id", "role", "content", "created_at")
        read_only_fields = fields


class CreateMessageSerializer(serializers.Serializer):
    content = serializers.CharField(max_length=2000, trim_whitespace=True)

    def validate_content(self, value):
        if not value:
            raise serializers.ValidationError("متن پیام را وارد کنید.")
        return value


class ConversationSerializer(serializers.ModelSerializer):
    customer = CustomerSerializer(read_only=True)
    messages = MessageSerializer(many=True, read_only=True)
    ai_status = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = (
            "id",
            "customer",
            "status",
            "language",
            "kiosk_identifier",
            "started_at",
            "last_activity_at",
            "closed_at",
            "messages",
            "ai_status",
        )
        read_only_fields = fields

    def get_ai_status(self, obj):
        if settings.AI_PROVIDER == "disabled":
            return "disabled"
        if settings.AI_PROVIDER not in {"openai"}:
            return "misconfigured"
        if settings.AI_PROVIDER == "openai" and not settings.OPENAI_API_KEY:
            return "misconfigured"
        return "ready"
