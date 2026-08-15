from django.urls import path

from .views import (
    CloseConversationView,
    ConversationCustomerView,
    ConversationMessagesView,
    CurrentCustomerSessionView,
    CustomerSessionView,
)


app_name = "chat"

urlpatterns = [
    path("sessions/", CustomerSessionView.as_view(), name="session-create"),
    path("sessions/current/", CurrentCustomerSessionView.as_view(), name="session-current"),
    path(
        "conversations/<uuid:conversation_id>/customer/",
        ConversationCustomerView.as_view(),
        name="conversation-customer",
    ),
    path(
        "conversations/<uuid:conversation_id>/messages/",
        ConversationMessagesView.as_view(),
        name="conversation-messages",
    ),
    path(
        "conversations/<uuid:conversation_id>/close/",
        CloseConversationView.as_view(),
        name="conversation-close",
    ),
]
