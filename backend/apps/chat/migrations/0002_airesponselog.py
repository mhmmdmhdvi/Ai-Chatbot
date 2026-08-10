import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("chat", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="AIResponseLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("provider", models.CharField(max_length=30, verbose_name="ارائه‌دهنده")),
                ("model", models.CharField(blank=True, max_length=100, verbose_name="مدل")),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "در حال پردازش"),
                            ("completed", "تکمیل‌شده"),
                            ("failed", "ناموفق"),
                        ],
                        db_index=True,
                        default="pending",
                        max_length=12,
                        verbose_name="وضعیت",
                    ),
                ),
                ("provider_response_id", models.CharField(blank=True, max_length=100, verbose_name="شناسه پاسخ ارائه‌دهنده")),
                ("request_id", models.CharField(blank=True, max_length=100, verbose_name="شناسه درخواست")),
                ("input_tokens", models.PositiveIntegerField(default=0, verbose_name="توکن ورودی")),
                ("output_tokens", models.PositiveIntegerField(default=0, verbose_name="توکن خروجی")),
                ("total_tokens", models.PositiveIntegerField(default=0, verbose_name="مجموع توکن")),
                ("latency_ms", models.PositiveIntegerField(default=0, verbose_name="زمان پاسخ (میلی‌ثانیه)")),
                ("error_category", models.CharField(blank=True, max_length=50, verbose_name="نوع خطا")),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True, verbose_name="زمان ایجاد")),
                ("completed_at", models.DateTimeField(blank=True, null=True, verbose_name="زمان پایان")),
                (
                    "assistant_message",
                    models.OneToOneField(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="ai_response_log",
                        to="chat.message",
                        verbose_name="پاسخ دستیار",
                    ),
                ),
                (
                    "conversation",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="ai_response_logs",
                        to="chat.conversation",
                        verbose_name="گفتگو",
                    ),
                ),
                (
                    "customer_message",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="ai_request_log",
                        to="chat.message",
                        verbose_name="پیام مشتری",
                    ),
                ),
            ],
            options={
                "verbose_name": "گزارش پاسخ هوش مصنوعی",
                "verbose_name_plural": "گزارش‌های پاسخ هوش مصنوعی",
                "ordering": ("-created_at",),
                "indexes": [
                    models.Index(fields=["conversation", "-created_at"], name="chat_ai_log_conversation_idx"),
                ],
            },
        ),
    ]
