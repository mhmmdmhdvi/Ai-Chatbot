from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("chat", "0005_airesponselog_customer_message_attempts"),
    ]

    operations = [
        migrations.AddField(
            model_name="airesponselog",
            name="cached_input_tokens",
            field=models.PositiveIntegerField(default=0, verbose_name="توکن ورودی کش‌شده"),
        ),
        migrations.AddField(
            model_name="airesponselog",
            name="estimated_cost_usd",
            field=models.DecimalField(
                decimal_places=6,
                default=0,
                max_digits=14,
                verbose_name="هزینه تخمینی (دلار)",
            ),
        ),
    ]
