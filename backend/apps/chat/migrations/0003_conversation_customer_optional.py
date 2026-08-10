from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("chat", "0002_airesponselog"),
    ]

    operations = [
        migrations.AlterField(
            model_name="conversation",
            name="customer",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="conversations",
                to="chat.customer",
                verbose_name="مشتری",
            ),
        ),
    ]
