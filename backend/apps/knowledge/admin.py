from django.contrib import admin

from .models import Document, DocumentChunk, DocumentVersion, MessageSource


class ReadOnlyAdminMixin:
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


class DocumentVersionInline(ReadOnlyAdminMixin, admin.TabularInline):
    model = DocumentVersion
    extra = 0
    fields = (
        "version_number",
        "original_filename",
        "status",
        "is_active",
        "page_count",
        "extracted_character_count",
        "ocr_used",
        "content_verified",
        "indexed_at",
    )
    readonly_fields = fields
    ordering = ("-version_number",)
    show_change_link = True


@admin.register(Document)
class DocumentAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ("title", "source_key", "is_active", "active_version", "updated_at")
    list_filter = ("is_active", "updated_at")
    search_fields = ("title", "source_key", "versions__original_filename")
    ordering = ("title",)
    inlines = (DocumentVersionInline,)

    @admin.display(description="نسخه فعال")
    def active_version(self, obj):
        return obj.versions.filter(is_active=True).values_list("version_number", flat=True).first()


@admin.register(DocumentVersion)
class DocumentVersionAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = (
        "document",
        "version_number",
        "status",
        "is_active",
        "page_count",
        "ocr_used",
        "content_verified",
        "chunk_count",
        "indexed_at",
    )
    list_filter = (
        "status",
        "is_active",
        "ocr_used",
        "content_verified",
        "embedding_model",
        "created_at",
    )
    search_fields = ("document__title", "original_filename", "sha256")
    list_select_related = ("document",)
    ordering = ("-created_at",)

    @admin.display(description="تعداد بخش")
    def chunk_count(self, obj):
        return obj.chunks.count()


@admin.register(DocumentChunk)
class DocumentChunkAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ("id", "document_title", "page_number", "chunk_index", "character_count")
    list_filter = ("version__document", "page_number")
    search_fields = ("content", "version__document__title")
    list_select_related = ("version", "version__document")
    ordering = ("version", "page_number", "chunk_index")

    @admin.display(description="سند", ordering="version__document__title")
    def document_title(self, obj):
        return obj.version.document.title


@admin.register(MessageSource)
class MessageSourceAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ("message", "document_title", "page_number", "rank", "similarity", "created_at")
    search_fields = ("message__content", "chunk__content", "chunk__version__document__title")
    list_select_related = ("message", "chunk", "chunk__version", "chunk__version__document")
    ordering = ("-created_at", "rank")

    @admin.display(description="سند", ordering="chunk__version__document__title")
    def document_title(self, obj):
        return obj.chunk.version.document.title

    @admin.display(description="صفحه", ordering="chunk__page_number")
    def page_number(self, obj):
        return obj.chunk.page_number
