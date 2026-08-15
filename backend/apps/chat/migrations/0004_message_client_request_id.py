from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):
    dependencies = [
        ("chat", "0003_conversation_customer_optional"),
    ]

    operations = [
        migrations.AddField(
            model_name="message",
            name="client_request_id",
            field=models.UUIDField(blank=True, editable=False, null=True),
        ),
        migrations.AddConstraint(
            model_name="message",
            constraint=models.UniqueConstraint(
                condition=Q(client_request_id__isnull=False),
                fields=("conversation", "client_request_id"),
                name="chat_conversation_request_unique",
            ),
        ),
    ]
