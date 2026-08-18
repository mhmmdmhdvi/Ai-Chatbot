import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("chat", "0004_message_client_request_id"),
    ]

    operations = [
        migrations.AlterField(
            model_name="airesponselog",
            name="customer_message",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="ai_request_logs",
                to="chat.message",
                verbose_name="پیام مشتری",
            ),
        ),
    ]
