from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.http import Http404, StreamingHttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AIResponseLog, Message
from .serializers import (
    ConversationSerializer,
    CreateMessageSerializer,
    CustomerSessionSerializer,
    MessageSerializer,
)
from .services import clear_active_conversation, get_active_conversation, start_customer_session
from .streaming import replay_conversation_response, stream_conversation_response


class CustomerSessionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CustomerSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        conversation = start_customer_session(request=request, **serializer.validated_data)
        conversation = get_active_conversation(request, conversation.id)
        return Response(ConversationSerializer(conversation).data, status=status.HTTP_201_CREATED)


class CurrentCustomerSessionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        conversation = get_active_conversation(request)
        if conversation is None:
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response(ConversationSerializer(conversation).data)


class ConversationMessagesView(APIView):
    permission_classes = [IsAuthenticated]

    def _conversation(self, request, conversation_id):
        conversation = get_active_conversation(request, conversation_id)
        if conversation is None:
            raise Http404
        return conversation

    def get(self, request, conversation_id):
        conversation = self._conversation(request, conversation_id)
        return Response(MessageSerializer(conversation.messages.all(), many=True).data)

    @staticmethod
    def _provider_defaults():
        return {
            "provider": (settings.AI_PROVIDER or "disabled")[:30],
            "model": settings.OPENAI_MODEL if settings.AI_PROVIDER == "openai" else "",
        }

    @staticmethod
    def _stream_response(stream, *, response_status):
        response = StreamingHttpResponse(
            stream,
            status=response_status,
            content_type="text/event-stream; charset=utf-8",
        )
        response["Cache-Control"] = "no-cache, no-transform"
        response["X-Accel-Buffering"] = "no"
        return response

    @staticmethod
    def _create_response_log(*, conversation, customer_message):
        return AIResponseLog.objects.create(
            conversation=conversation,
            customer_message=customer_message,
            **ConversationMessagesView._provider_defaults(),
        )

    @staticmethod
    def _expire_stale_response_log(response_log, *, expired_at):
        elapsed_ms = round(
            max(0, (expired_at - response_log.created_at).total_seconds()) * 1000
        )
        response_log.status = AIResponseLog.Status.FAILED
        response_log.error_category = "request_lease_expired"
        response_log.latency_ms = min(elapsed_ms, 2_147_483_647)
        response_log.completed_at = expired_at
        response_log.save(
            update_fields=("status", "error_category", "latency_ms", "completed_at")
        )

    def post(self, request, conversation_id):
        conversation = self._conversation(request, conversation_id)
        serializer = CreateMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        content = serializer.validated_data["content"]
        client_request_id = serializer.validated_data["client_request_id"]

        with transaction.atomic():
            message, created = Message.objects.get_or_create(
                conversation=conversation,
                client_request_id=client_request_id,
                defaults={
                    "role": Message.Role.CUSTOMER,
                    "content": content,
                },
            )
            message = Message.objects.select_for_update().get(pk=message.pk)

            if not created and (
                message.role != Message.Role.CUSTOMER or message.content != content
            ):
                return Response(
                    {
                        "detail": "این شناسه درخواست قبلاً برای پیام دیگری استفاده شده است.",
                        "code": "request_content_conflict",
                        "retryable": False,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            if created:
                response_log = self._create_response_log(
                    conversation=conversation,
                    customer_message=message,
                )
                response_status = status.HTTP_201_CREATED
                replay = False
            else:
                response_log = (
                    AIResponseLog.objects.select_for_update()
                    .filter(customer_message=message)
                    .order_by("-created_at", "-pk")
                    .first()
                )
                if response_log is None:
                    return Response(
                        {
                            "detail": "وضعیت درخواست قبلی قابل بازیابی نیست. لطفاً پیام را دوباره ارسال کنید.",
                            "code": "request_state_unavailable",
                            "retryable": False,
                        },
                        status=status.HTTP_409_CONFLICT,
                    )

                if response_log.status == AIResponseLog.Status.PENDING:
                    now = timezone.now()
                    lease_expires_at = response_log.created_at + timedelta(
                        seconds=settings.AI_RESPONSE_PENDING_LEASE_SECONDS
                    )
                    if now < lease_expires_at:
                        return Response(
                            {
                                "detail": "این درخواست هنوز در حال پردازش است. چند لحظه دیگر دوباره تلاش کنید.",
                                "code": "request_in_progress",
                                "retryable": True,
                            },
                            status=status.HTTP_409_CONFLICT,
                        )
                    self._expire_stale_response_log(response_log, expired_at=now)
                    response_log = self._create_response_log(
                        conversation=conversation,
                        customer_message=message,
                    )
                    response_status = status.HTTP_200_OK
                    replay = False

                elif response_log.status == AIResponseLog.Status.COMPLETED:
                    if response_log.assistant_message is None:
                        return Response(
                            {
                                "detail": "پاسخ ذخیره‌شده کامل نیست. لطفاً پیام را دوباره ارسال کنید.",
                                "code": "completed_response_unavailable",
                                "retryable": False,
                            },
                            status=status.HTTP_409_CONFLICT,
                        )
                    response_status = status.HTTP_200_OK
                    replay = True
                else:
                    response_log = self._create_response_log(
                        conversation=conversation,
                        customer_message=message,
                    )
                    response_status = status.HTTP_200_OK
                    replay = False

            conversation.save(update_fields=("last_activity_at",))

        if replay:
            stream = replay_conversation_response(
                customer_message=message,
                response_log=response_log,
            )
        else:
            stream = stream_conversation_response(
                conversation=conversation,
                customer_message=message,
                response_log=response_log,
            )
        return self._stream_response(stream, response_status=response_status)


class CloseConversationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, conversation_id):
        conversation = get_active_conversation(request, conversation_id)
        if conversation is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        clear_active_conversation(request, conversation)
        return Response(status=status.HTTP_204_NO_CONTENT)
