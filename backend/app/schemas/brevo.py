"""Pydantic schemas for Brevo email/SMS marketing integration."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# --- Account ---


class BrevoAccountResponse(BaseModel):
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    company_name: Optional[str] = None
    plan: Optional[List[Dict[str, Any]]] = None


# --- Contacts ---


class BrevoContactAttributes(BaseModel):
    """Flexible contact attributes (FIRSTNAME, LASTNAME, SMS, etc.)."""
    FIRSTNAME: Optional[str] = None
    LASTNAME: Optional[str] = None
    SMS: Optional[str] = None


class BrevoCreateContactRequest(BaseModel):
    email: str = Field(..., min_length=1, max_length=320)
    attributes: Optional[Dict[str, Any]] = None
    list_ids: Optional[List[int]] = None
    update_enabled: bool = Field(default=True, description="Update contact if already exists")


class BrevoContactResponse(BaseModel):
    id: Optional[int] = None
    email: str
    attributes: Optional[Dict[str, Any]] = None
    email_blacklisted: Optional[bool] = None
    sms_blacklisted: Optional[bool] = None
    list_ids: Optional[List[int]] = None
    created_at: Optional[str] = None
    modified_at: Optional[str] = None


class BrevoContactListResponse(BaseModel):
    contacts: List[BrevoContactResponse] = Field(default_factory=list)
    count: int = 0


# --- Email ---


class BrevoEmailRecipient(BaseModel):
    email: str
    name: Optional[str] = None


class BrevoEmailSender(BaseModel):
    email: str
    name: Optional[str] = None


class BrevoSendEmailRequest(BaseModel):
    to: List[BrevoEmailRecipient] = Field(..., min_length=1)
    subject: str = Field(..., min_length=1, max_length=998)
    html_content: Optional[str] = None
    text_content: Optional[str] = None
    sender: Optional[BrevoEmailSender] = None
    template_id: Optional[int] = None
    params: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None


class BrevoSendEmailResponse(BaseModel):
    message_id: Optional[str] = None


class BrevoTemplateResponse(BaseModel):
    id: int
    name: str
    subject: Optional[str] = None
    is_active: Optional[bool] = None
    html_content: Optional[str] = None
    created_at: Optional[str] = None
    modified_at: Optional[str] = None


class BrevoTemplateListResponse(BaseModel):
    templates: List[BrevoTemplateResponse] = Field(default_factory=list)
    count: int = 0


# --- SMS ---


class BrevoSendSMSRequest(BaseModel):
    recipient: Optional[str] = Field(None, description="Phone number (E.164). Defaults to SMS_DEFAULT_RECIPIENT env.")
    content: str = Field(..., min_length=1, max_length=160)
    sender: Optional[str] = Field(None, max_length=11, description="Sender name (max 11 chars). Defaults to SMS_SENDER env.")


class BrevoSendSMSResponse(BaseModel):
    reference: Optional[str] = None
    message_id: Optional[int] = None
    remaining_credits: Optional[float] = None


# --- Campaigns ---


class BrevoCampaignResponse(BaseModel):
    id: int
    name: str
    type: Optional[str] = None
    status: Optional[str] = None
    subject: Optional[str] = None
    scheduled_at: Optional[str] = None
    created_at: Optional[str] = None
    modified_at: Optional[str] = None


class BrevoCampaignListResponse(BaseModel):
    campaigns: List[BrevoCampaignResponse] = Field(default_factory=list)
    count: int = 0


class BrevoCampaignStatsResponse(BaseModel):
    campaign_id: int
    stats: Optional[Dict[str, Any]] = None
