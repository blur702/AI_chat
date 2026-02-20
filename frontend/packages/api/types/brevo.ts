// --- Account ---

export interface BrevoAccount {
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  plan?: Record<string, unknown>[];
}

// --- Contacts ---

export interface BrevoContact {
  id?: number;
  email: string;
  attributes?: Record<string, unknown>;
  email_blacklisted?: boolean;
  sms_blacklisted?: boolean;
  list_ids?: number[];
  created_at?: string;
  modified_at?: string;
}

export interface BrevoContactListResponse {
  contacts: BrevoContact[];
  count: number;
}

export interface BrevoCreateContactRequest {
  email: string;
  attributes?: Record<string, unknown>;
  list_ids?: number[];
  update_enabled?: boolean;
}

// --- Email ---

export interface BrevoEmailRecipient {
  email: string;
  name?: string;
}

export interface BrevoEmailSender {
  email: string;
  name?: string;
}

export interface BrevoSendEmailRequest {
  to: BrevoEmailRecipient[];
  subject: string;
  html_content?: string;
  text_content?: string;
  sender?: BrevoEmailSender;
  template_id?: number;
  params?: Record<string, unknown>;
  tags?: string[];
}

export interface BrevoSendEmailResponse {
  message_id?: string;
}

export interface BrevoTemplate {
  id: number;
  name: string;
  subject?: string;
  is_active?: boolean;
  html_content?: string;
  created_at?: string;
  modified_at?: string;
}

export interface BrevoTemplateListResponse {
  templates: BrevoTemplate[];
  count: number;
}

// --- SMS ---

export interface BrevoSendSMSRequest {
  recipient: string;
  content: string;
  sender: string;
}

export interface BrevoSendSMSResponse {
  reference?: string;
  message_id?: number;
  remaining_credits?: number;
}

// --- Campaigns ---

export interface BrevoCampaign {
  id: number;
  name: string;
  type?: string;
  status?: string;
  subject?: string;
  scheduled_at?: string;
  created_at?: string;
  modified_at?: string;
}

export interface BrevoCampaignListResponse {
  campaigns: BrevoCampaign[];
  count: number;
}
