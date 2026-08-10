import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone


class Customer(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField("نام", max_length=100)
    phone_number = models.CharField("شماره تلفن", max_length=20, unique=True, db_index=True)
    created_at = models.DateTimeField("زمان ایجاد", auto_now_add=True)
    last_seen_at = models.DateTimeField("آخرین مراجعه", auto_now=True)

    class Meta:
        ordering = ("-last_seen_at",)
        verbose_name = "مشتری"
        verbose_name_plural = "مشتریان"

    def __str__(self):
        return f"{self.name} — {self.phone_number}"


class Conversation(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "فعال"
        CLOSED = "closed", "بسته"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="conversations",
        verbose_name="مشتری",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_conversations",
        verbose_name="کاربر کیوسک",
    )
    status = models.CharField(
        "وضعیت",
        max_length=10,
        choices=Status.choices,
        default=Status.ACTIVE,
        db_index=True,
    )
    language = models.CharField("زبان", max_length=5, default="fa", editable=False)
    kiosk_identifier = models.CharField("شناسه کیوسک", max_length=100, blank=True, null=True)
    started_at = models.DateTimeField("زمان شروع", auto_now_add=True, db_index=True)
    last_activity_at = models.DateTimeField("آخرین فعالیت", auto_now=True)
    closed_at = models.DateTimeField("زمان پایان", blank=True, null=True)

    class Meta:
        ordering = ("-started_at",)
        verbose_name = "گفتگو"
        verbose_name_plural = "گفتگوها"
        indexes = [
            models.Index(fields=("customer", "-started_at"), name="chat_customer_started_idx"),
        ]

    def __str__(self):
        return f"{self.customer.name} — {self.started_at:%Y-%m-%d %H:%M}"

    def close(self):
        if self.status == self.Status.ACTIVE:
            self.status = self.Status.CLOSED
            self.closed_at = timezone.now()
            self.save(update_fields=("status", "closed_at", "last_activity_at"))


class Message(models.Model):
    class Role(models.TextChoices):
        CUSTOMER = "customer", "مشتری"
        ASSISTANT = "assistant", "دستیار"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.PROTECT,
        related_name="messages",
        verbose_name="گفتگو",
    )
    role = models.CharField("فرستنده", max_length=10, choices=Role.choices)
    content = models.TextField("متن")
    created_at = models.DateTimeField("زمان ارسال", auto_now_add=True, db_index=True)

    class Meta:
        ordering = ("created_at", "id")
        verbose_name = "پیام"
        verbose_name_plural = "پیام‌ها"
        constraints = [
            models.CheckConstraint(condition=~Q(content=""), name="chat_message_content_not_empty"),
        ]
        indexes = [
            models.Index(fields=("conversation", "created_at"), name="chat_conversation_msg_idx"),
        ]

    def __str__(self):
        return f"{self.get_role_display()} — {self.created_at:%Y-%m-%d %H:%M}"


class AIResponseLog(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "در حال پردازش"
        COMPLETED = "completed", "تکمیل‌شده"
        FAILED = "failed", "ناموفق"

    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.PROTECT,
        related_name="ai_response_logs",
        verbose_name="گفتگو",
    )
    customer_message = models.OneToOneField(
        Message,
        on_delete=models.PROTECT,
        related_name="ai_request_log",
        verbose_name="پیام مشتری",
    )
    assistant_message = models.OneToOneField(
        Message,
        on_delete=models.PROTECT,
        related_name="ai_response_log",
        verbose_name="پاسخ دستیار",
        blank=True,
        null=True,
    )
    provider = models.CharField("ارائه‌دهنده", max_length=30)
    model = models.CharField("مدل", max_length=100, blank=True)
    status = models.CharField(
        "وضعیت",
        max_length=12,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    provider_response_id = models.CharField("شناسه پاسخ ارائه‌دهنده", max_length=100, blank=True)
    request_id = models.CharField("شناسه درخواست", max_length=100, blank=True)
    input_tokens = models.PositiveIntegerField("توکن ورودی", default=0)
    output_tokens = models.PositiveIntegerField("توکن خروجی", default=0)
    total_tokens = models.PositiveIntegerField("مجموع توکن", default=0)
    latency_ms = models.PositiveIntegerField("زمان پاسخ (میلی‌ثانیه)", default=0)
    error_category = models.CharField("نوع خطا", max_length=50, blank=True)
    created_at = models.DateTimeField("زمان ایجاد", auto_now_add=True, db_index=True)
    completed_at = models.DateTimeField("زمان پایان", blank=True, null=True)

    class Meta:
        ordering = ("-created_at",)
        verbose_name = "گزارش پاسخ هوش مصنوعی"
        verbose_name_plural = "گزارش‌های پاسخ هوش مصنوعی"
        indexes = [
            models.Index(fields=("conversation", "-created_at"), name="chat_ai_log_conversation_idx"),
        ]

    def __str__(self):
        return f"{self.provider} — {self.get_status_display()} — {self.created_at:%Y-%m-%d %H:%M}"
