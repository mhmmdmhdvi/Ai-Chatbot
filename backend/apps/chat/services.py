from django.db import transaction

from .models import Conversation, Customer


ACTIVE_CONVERSATION_SESSION_KEY = "active_conversation_id"


@transaction.atomic
def start_customer_session(*, request, name="", phone_number="", kiosk_identifier=""):
    active_id = request.session.get(ACTIVE_CONVERSATION_SESSION_KEY)
    if active_id:
        previous = Conversation.objects.filter(
            id=active_id,
            created_by=request.user,
            status=Conversation.Status.ACTIVE,
        ).first()
        if previous:
            previous.close()

    customer = None
    if name and phone_number:
        customer, _ = Customer.objects.update_or_create(
            phone_number=phone_number,
            defaults={"name": name},
        )
    conversation = Conversation.objects.create(
        customer=customer,
        created_by=request.user,
        kiosk_identifier=kiosk_identifier or None,
    )
    request.session[ACTIVE_CONVERSATION_SESSION_KEY] = str(conversation.id)
    request.session.modified = True
    return conversation


def get_active_conversation(request, conversation_id=None):
    active_id = request.session.get(ACTIVE_CONVERSATION_SESSION_KEY)
    if not active_id or (conversation_id and str(conversation_id) != str(active_id)):
        return None
    return (
        Conversation.objects.select_related("customer")
        .prefetch_related("messages")
        .filter(
            id=active_id,
            created_by=request.user,
            status=Conversation.Status.ACTIVE,
        )
        .first()
    )


def clear_active_conversation(request, conversation):
    conversation.close()
    request.session.pop(ACTIVE_CONVERSATION_SESSION_KEY, None)
    request.session.modified = True
