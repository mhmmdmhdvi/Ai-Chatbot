from django.conf import settings
from django.http import Http404, StreamingHttpResponse
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
from .streaming import stream_conversation_response


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

    def post(self, request, conversation_id):
        conversation = self._conversation(request, conversation_id)
        serializer = CreateMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = Message.objects.create(
            conversation=conversation,
            role=Message.Role.CUSTOMER,
            content=serializer.validated_data["content"],
        )
        conversation.save(update_fields=("last_activity_at",))
        response_log = AIResponseLog.objects.create(
            conversation=conversation,
            customer_message=message,
            provider=(settings.AI_PROVIDER or "disabled")[:30],
            model=settings.OPENAI_MODEL if settings.AI_PROVIDER == "openai" else "",
        )
        response = StreamingHttpResponse(
            stream_conversation_response(
                conversation=conversation,
                customer_message=message,
                response_log=response_log,
            ),
            status=status.HTTP_201_CREATED,
            content_type="text/event-stream; charset=utf-8",
        )
        response["Cache-Control"] = "no-cache, no-transform"
        response["X-Accel-Buffering"] = "no"
        return response


class CloseConversationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, conversation_id):
        conversation = get_active_conversation(request, conversation_id)
        if conversation is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        clear_active_conversation(request, conversation)
        return Response(status=status.HTTP_204_NO_CONTENT)
