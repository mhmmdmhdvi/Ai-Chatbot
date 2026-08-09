from django.contrib import admin

from .models import Conversation, Customer, Message


class ReadOnlyAdminMixin:
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return request.user.is_active and request.user.is_superuser

    def has_delete_permission(self, request, obj=None):
        return False

    def get_readonly_fields(self, request, obj=None):
        return tuple(field.name for field in self.model._meta.fields)


@admin.register(Customer)
class CustomerAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ("name", "phone_number", "created_at", "last_seen_at")
    search_fields = ("name", "phone_number")
    ordering = ("-last_seen_at",)


class MessageInline(admin.TabularInline):
    model = Message
    extra = 0
    can_delete = False
    fields = ("role", "content", "created_at")
    readonly_fields = fields
    ordering = ("created_at", "id")
    show_change_link = True

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Conversation)
class ConversationAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ("id", "customer", "status", "created_by", "started_at", "last_activity_at")
    list_filter = ("status", "started_at", "customer")
    search_fields = ("customer__name", "customer__phone_number", "id")
    list_select_related = ("customer", "created_by")
    ordering = ("-started_at",)
    inlines = (MessageInline,)


@admin.register(Message)
class MessageAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ("id", "conversation", "role", "created_at")
    list_filter = ("role", "created_at")
    search_fields = ("content", "conversation__customer__name", "conversation__customer__phone_number")
    list_select_related = ("conversation", "conversation__customer")
    ordering = ("-created_at",)
