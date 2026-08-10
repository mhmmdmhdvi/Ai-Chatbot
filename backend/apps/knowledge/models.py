import uuid
from pathlib import Path

from django.db import models
from django.db.models import Q
from pgvector.django import HnswIndex, VectorField


def document_upload_path(instance, filename):
    safe_name = Path(filename).name
    return f"knowledge/{instance.document_id}/{instance.version_number}/{safe_name}"


class Document(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField("عنوان", max_length=255)
    source_key = models.CharField("شناسه منبع", max_length=255, unique=True)
    is_active = models.BooleanField("فعال", default=True, db_index=True)
    created_at = models.DateTimeField("زمان ایجاد", auto_now_add=True)
    updated_at = models.DateTimeField("آخرین تغییر", auto_now=True)

    class Meta:
        ordering = ("title",)
        verbose_name = "سند دانش"
        verbose_name_plural = "اسناد دانش"

    def __str__(self):
        return self.title


class DocumentVersion(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "در انتظار پردازش"
        READY = "ready", "آماده"
        NEEDS_OCR = "needs_ocr", "نیازمند OCR"
        FAILED = "failed", "ناموفق"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(
        Document,
        on_delete=models.PROTECT,
        related_name="versions",
        verbose_name="سند",
    )
    version_number = models.PositiveIntegerField("نسخه")
    file = models.FileField("فایل", upload_to=document_upload_path, max_length=500)
    original_filename = models.CharField("نام فایل اصلی", max_length=255)
    sha256 = models.CharField("SHA-256", max_length=64, unique=True)
    file_size = models.PositiveBigIntegerField("حجم فایل", default=0)
    page_count = models.PositiveIntegerField("تعداد صفحه", default=0)
    extracted_character_count = models.PositiveIntegerField("تعداد نویسه استخراج‌شده", default=0)
    ocr_used = models.BooleanField("استخراج با OCR", default=False)
    status = models.CharField(
        "وضعیت",
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    is_active = models.BooleanField("نسخه فعال", default=False, db_index=True)
    error_message = models.TextField("خطای پردازش", blank=True)
    embedding_model = models.CharField("مدل بردارسازی", max_length=100, blank=True)
    embedding_dimensions = models.PositiveIntegerField("ابعاد بردار", default=0)
    created_at = models.DateTimeField("زمان ایجاد", auto_now_add=True)
    indexed_at = models.DateTimeField("زمان ایندکس", blank=True, null=True)

    class Meta:
        ordering = ("document", "-version_number")
        verbose_name = "نسخه سند"
        verbose_name_plural = "نسخه‌های اسناد"
        constraints = [
            models.UniqueConstraint(
                fields=("document", "version_number"),
                name="knowledge_document_version_unique",
            ),
            models.UniqueConstraint(
                fields=("document",),
                condition=Q(is_active=True),
                name="knowledge_one_active_version",
            ),
        ]

    def __str__(self):
        return f"{self.document.title} — نسخه {self.version_number}"

class DocumentChunk(models.Model):
    version = models.ForeignKey(
        DocumentVersion,
        on_delete=models.CASCADE,
        related_name="chunks",
        verbose_name="نسخه سند",
    )
    page_number = models.PositiveIntegerField("شماره صفحه")
    chunk_index = models.PositiveIntegerField("شماره بخش")
    content = models.TextField("متن")
    content_hash = models.CharField("هش متن", max_length=64)
    character_count = models.PositiveIntegerField("تعداد نویسه")
    embedding = VectorField(dimensions=1024, blank=True, null=True)
    created_at = models.DateTimeField("زمان ایجاد", auto_now_add=True)

    class Meta:
        ordering = ("version", "page_number", "chunk_index")
        verbose_name = "بخش سند"
        verbose_name_plural = "بخش‌های اسناد"
        constraints = [
            models.UniqueConstraint(
                fields=("version", "page_number", "chunk_index"),
                name="knowledge_chunk_position_unique",
            ),
        ]
        indexes = [
            models.Index(fields=("version", "page_number"), name="know_chunk_page_idx"),
            HnswIndex(
                name="know_chunk_embed_hnsw",
                fields=("embedding",),
                m=16,
                ef_construction=64,
                opclasses=("vector_cosine_ops",),
            ),
        ]

    def __str__(self):
        return f"{self.version.document.title} — صفحه {self.page_number} — بخش {self.chunk_index}"


class MessageSource(models.Model):
    message = models.ForeignKey(
        "chat.Message",
        on_delete=models.PROTECT,
        related_name="knowledge_sources",
        verbose_name="پیام پاسخ",
    )
    chunk = models.ForeignKey(
        DocumentChunk,
        on_delete=models.PROTECT,
        related_name="answer_sources",
        verbose_name="بخش منبع",
    )
    similarity = models.FloatField("امتیاز شباهت")
    rank = models.PositiveSmallIntegerField("رتبه")
    created_at = models.DateTimeField("زمان ایجاد", auto_now_add=True)

    class Meta:
        ordering = ("message", "rank")
        verbose_name = "منبع پاسخ"
        verbose_name_plural = "منابع پاسخ‌ها"
        constraints = [
            models.UniqueConstraint(
                fields=("message", "chunk"),
                name="knowledge_message_chunk_unique",
            ),
        ]
        indexes = [
            models.Index(fields=("message", "rank"), name="know_source_rank_idx"),
        ]

    def __str__(self):
        return f"{self.message_id} — {self.chunk_id}"
