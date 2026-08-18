from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def health(request):
    return JsonResponse({"status": "ok", "service": "backend"})


admin.site.site_header = "مدیریت دستیار هوشمند"
admin.site.site_title = "پنل مدیریت"
admin.site.index_title = "مدیریت سامانه"

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/health/", health, name="health"),
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/", include("apps.chat.urls")),
]
