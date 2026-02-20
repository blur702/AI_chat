"""API endpoints for Brevo email/SMS marketing integration."""

import logging
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.context_deps import get_current_user_payload, get_brevo_client
from app.schemas.brevo import (
    BrevoAccountResponse,
    BrevoCampaignListResponse,
    BrevoCampaignResponse,
    BrevoContactListResponse,
    BrevoContactResponse,
    BrevoCreateContactRequest,
    BrevoSendEmailRequest,
    BrevoSendEmailResponse,
    BrevoSendSMSRequest,
    BrevoSendSMSResponse,
    BrevoTemplateListResponse,
)
from app.services.brevo_client import BrevoClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/brevo")


# --- Account ---


@router.get("/account", response_model=BrevoAccountResponse)
async def get_account(
    payload: dict = Depends(get_current_user_payload),
    brevo: BrevoClient = Depends(get_brevo_client),
):
    """Get Brevo account info."""
    try:
        data = await brevo.get_account()
        return BrevoAccountResponse(
            email=data.get("email", ""),
            first_name=data.get("firstName"),
            last_name=data.get("lastName"),
            company_name=data.get("companyName"),
            plan=data.get("plan"),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Brevo API error: {e}",
        )


# --- Contacts ---


@router.get("/contacts", response_model=BrevoContactListResponse)
async def list_contacts(
    limit: int = Query(default=50, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    payload: dict = Depends(get_current_user_payload),
    brevo: BrevoClient = Depends(get_brevo_client),
):
    """List Brevo contacts (paginated)."""
    try:
        data = await brevo.list_contacts(limit=limit, offset=offset)
        contacts = [
            BrevoContactResponse(
                id=c.get("id"),
                email=c.get("email", ""),
                attributes=c.get("attributes"),
                email_blacklisted=c.get("emailBlacklisted"),
                sms_blacklisted=c.get("smsBlacklisted"),
                list_ids=c.get("listIds"),
                created_at=c.get("createdAt"),
                modified_at=c.get("modifiedAt"),
            )
            for c in data.get("contacts", [])
        ]
        return BrevoContactListResponse(
            contacts=contacts,
            count=data.get("count", len(contacts)),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Brevo API error: {e}",
        )


@router.post("/contacts", response_model=BrevoContactResponse, status_code=status.HTTP_201_CREATED)
async def create_contact(
    body: BrevoCreateContactRequest,
    payload: dict = Depends(get_current_user_payload),
    brevo: BrevoClient = Depends(get_brevo_client),
):
    """Create a new Brevo contact."""
    try:
        result = await brevo.create_contact(
            email=body.email,
            attributes=body.attributes,
            list_ids=body.list_ids,
            update_enabled=body.update_enabled,
        )
        # Fetch the created contact to return full details
        contact = await brevo.get_contact(body.email)
        return BrevoContactResponse(
            id=contact.get("id"),
            email=contact.get("email", body.email),
            attributes=contact.get("attributes"),
            email_blacklisted=contact.get("emailBlacklisted"),
            sms_blacklisted=contact.get("smsBlacklisted"),
            list_ids=contact.get("listIds"),
            created_at=contact.get("createdAt"),
            modified_at=contact.get("modifiedAt"),
        )
    except httpx.HTTPStatusError as e:
        detail = ""
        try:
            detail = e.response.text
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Brevo API error: {detail or e}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Brevo API error: {e}",
        )


# --- Email ---


@router.post("/email/send", response_model=BrevoSendEmailResponse)
async def send_email(
    body: BrevoSendEmailRequest,
    payload: dict = Depends(get_current_user_payload),
    brevo: BrevoClient = Depends(get_brevo_client),
):
    """Send a transactional email via Brevo."""
    try:
        to_list = [{"email": r.email, "name": r.name} if r.name else {"email": r.email} for r in body.to]
        sender = None
        if body.sender:
            sender = {"email": body.sender.email}
            if body.sender.name:
                sender["name"] = body.sender.name

        result = await brevo.send_transactional_email(
            to=to_list,
            subject=body.subject,
            html_content=body.html_content,
            text_content=body.text_content,
            sender=sender,
            template_id=body.template_id,
            params=body.params,
            tags=body.tags,
        )
        return BrevoSendEmailResponse(message_id=result.get("messageId"))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Brevo API error: {e}",
        )


@router.get("/templates", response_model=BrevoTemplateListResponse)
async def list_templates(
    limit: int = Query(default=50, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    payload: dict = Depends(get_current_user_payload),
    brevo: BrevoClient = Depends(get_brevo_client),
):
    """List Brevo email templates."""
    try:
        data = await brevo.list_templates(limit=limit, offset=offset)
        templates = []
        for t in data.get("templates", []):
            templates.append({
                "id": t.get("id"),
                "name": t.get("name", ""),
                "subject": t.get("subject"),
                "is_active": t.get("isActive"),
                "html_content": t.get("htmlContent"),
                "created_at": t.get("createdAt"),
                "modified_at": t.get("modifiedAt"),
            })
        return BrevoTemplateListResponse(
            templates=templates,
            count=data.get("count", len(templates)),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Brevo API error: {e}",
        )


# --- SMS ---


@router.post("/sms/send", response_model=BrevoSendSMSResponse)
async def send_sms(
    body: BrevoSendSMSRequest,
    payload: dict = Depends(get_current_user_payload),
    brevo: BrevoClient = Depends(get_brevo_client),
):
    """Send a transactional SMS via Brevo."""
    try:
        result = await brevo.send_sms(
            content=body.content,
            recipient=body.recipient,
            sender=body.sender,
        )
        return BrevoSendSMSResponse(
            reference=result.get("reference"),
            message_id=result.get("messageId"),
            remaining_credits=result.get("remainingCredits"),
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Brevo API error: {e}",
        )


# --- Campaigns ---


@router.get("/campaigns", response_model=BrevoCampaignListResponse)
async def list_campaigns(
    campaign_type: str = Query(default="email", pattern="^(email|sms)$"),
    campaign_status: Optional[str] = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    payload: dict = Depends(get_current_user_payload),
    brevo: BrevoClient = Depends(get_brevo_client),
):
    """List Brevo campaigns."""
    try:
        data = await brevo.list_campaigns(
            campaign_type=campaign_type,
            status=campaign_status,
            limit=limit,
            offset=offset,
        )
        campaigns = [
            BrevoCampaignResponse(
                id=c.get("id"),
                name=c.get("name", ""),
                type=c.get("type"),
                status=c.get("status"),
                subject=c.get("subject"),
                scheduled_at=c.get("scheduledAt"),
                created_at=c.get("createdAt"),
                modified_at=c.get("modifiedAt"),
            )
            for c in data.get("campaigns", [])
        ]
        return BrevoCampaignListResponse(
            campaigns=campaigns,
            count=data.get("count", len(campaigns)),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Brevo API error: {e}",
        )


@router.get("/campaigns/{campaign_id}", response_model=BrevoCampaignResponse)
async def get_campaign(
    campaign_id: int,
    campaign_type: str = Query(default="email", pattern="^(email|sms)$"),
    payload: dict = Depends(get_current_user_payload),
    brevo: BrevoClient = Depends(get_brevo_client),
):
    """Get a specific Brevo campaign."""
    try:
        data = await brevo.get_campaign(campaign_id, campaign_type=campaign_type)
        return BrevoCampaignResponse(
            id=data.get("id", campaign_id),
            name=data.get("name", ""),
            type=data.get("type"),
            status=data.get("status"),
            subject=data.get("subject"),
            scheduled_at=data.get("scheduledAt"),
            created_at=data.get("createdAt"),
            modified_at=data.get("modifiedAt"),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Brevo API error: {e}",
        )
