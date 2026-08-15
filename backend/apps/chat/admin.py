from django.contrib import admin
from django.db.models import Count, Q, Sum

from .models import AIResponseLog, Conversation, Customer, Message
from .usage import openai_cost_rates_configured


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


class AIResponseLogInline(admin.TabularInline):
    model = AIResponseLog
    extra = 0
    can_delete = False
    fields = (
        "status",
        "provider",
        "model",
        "input_tokens",
        "cached_input_tokens",
        "output_tokens",
        "total_tokens",
        "estimated_cost_usd",
        "latency_ms",
        "error_category",
        "created_at",
    )
    readonly_fields = fields
    ordering = ("-created_at",)

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Conversation)
class ConversationAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ("id", "customer", "status", "created_by", "started_at", "last_activity_at")
    list_filter = ("status", "started_at", "customer")
    search_fields = ("customer__name", "customer__phone_number", "id")
    list_select_related = ("customer", "created_by")
    ordering = ("-started_at",)
    inlines = (MessageInline, AIResponseLogInline)


@admin.register(Message)
class MessageAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ("id", "conversation", "role", "created_at")
    list_filter = ("role", "created_at")
    search_fields = ("content", "conversation__customer__name", "conversation__customer__phone_number")
    list_select_related = ("conversation", "conversation__customer")
    ordering = ("-created_at",)


@admin.register(AIResponseLog)
class AIResponseLogAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    change_list_template = "admin/chat/airesponselog/change_list.html"
    list_display = (
        "id",
        "conversation",
        "status",
        "provider",
        "model",
        "input_tokens",
        "cached_input_tokens",
        "output_tokens",
        "total_tokens",
        "estimated_cost_usd",
        "latency_ms",
        "created_at",
    )
    list_filter = ("status", "provider", "model", "created_at")
    search_fields = (
        "conversation__customer__name",
        "conversation__customer__phone_number",
        "provider_response_id",
        "request_id",
    )
    list_select_related = ("conversation", "conversation__customer")
    ordering = ("-created_at",)

    def changelist_view(self, request, extra_context=None):
        response = super().changelist_view(request, extra_context=extra_context)
        if not hasattr(response, "context_data"):
            return response

        changelist = response.context_data.get("cl")
        if changelist is None:
            return response
        totals = changelist.queryset.aggregate(
            request_count=Count("id"),
            completed_count=Count("id", filter=Q(status=AIResponseLog.Status.COMPLETED)),
            failed_count=Count("id", filter=Q(status=AIResponseLog.Status.FAILED)),
            input_tokens=Sum("input_tokens"),
            cached_input_tokens=Sum("cached_input_tokens"),
            output_tokens=Sum("output_tokens"),
            total_tokens=Sum("total_tokens"),
            estimated_cost_usd=Sum("estimated_cost_usd"),
        )
        for key, value in totals.items():
            if value is None:
                totals[key] = 0
        response.context_data["usage_totals"] = totals
        response.context_data["cost_rates_configured"] = openai_cost_rates_configured()
        return response
