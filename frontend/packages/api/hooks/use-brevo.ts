"use client";

import { useState, useCallback } from "react";
import { getClient } from "../client";
import type {
  BrevoAccount,
  BrevoContact,
  BrevoContactListResponse,
  BrevoCreateContactRequest,
  BrevoSendEmailRequest,
  BrevoSendEmailResponse,
  BrevoSendSMSRequest,
  BrevoSendSMSResponse,
  BrevoTemplate,
  BrevoTemplateListResponse,
  BrevoCampaign,
  BrevoCampaignListResponse,
} from "../types";

export interface UseBrevoReturn {
  // Account
  account: BrevoAccount | null;
  accountLoading: boolean;
  fetchAccount: () => Promise<void>;
  // Contacts
  contacts: BrevoContact[];
  contactsCount: number;
  contactsLoading: boolean;
  fetchContacts: (limit?: number, offset?: number) => Promise<void>;
  createContact: (data: BrevoCreateContactRequest) => Promise<BrevoContact>;
  creatingContact: boolean;
  // Email
  sendEmail: (data: BrevoSendEmailRequest) => Promise<BrevoSendEmailResponse>;
  sendingEmail: boolean;
  // Templates
  templates: BrevoTemplate[];
  templatesLoading: boolean;
  fetchTemplates: () => Promise<void>;
  // SMS
  sendSMS: (data: BrevoSendSMSRequest) => Promise<BrevoSendSMSResponse>;
  sendingSMS: boolean;
  // Campaigns
  campaigns: BrevoCampaign[];
  campaignsCount: number;
  campaignsLoading: boolean;
  fetchCampaigns: (type?: string, status?: string) => Promise<void>;
  // General
  error: string | null;
}

export function useBrevo(): UseBrevoReturn {
  const [account, setAccount] = useState<BrevoAccount | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [contacts, setContacts] = useState<BrevoContact[]>([]);
  const [contactsCount, setContactsCount] = useState(0);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [creatingContact, setCreatingContact] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [templates, setTemplates] = useState<BrevoTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [sendingSMS, setSendingSMS] = useState(false);
  const [campaigns, setCampaigns] = useState<BrevoCampaign[]>([]);
  const [campaignsCount, setCampaignsCount] = useState(0);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAccount = useCallback(async () => {
    try {
      setAccountLoading(true);
      setError(null);
      const { data } = await getClient().get<BrevoAccount>("/brevo/account");
      setAccount(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch account");
    } finally {
      setAccountLoading(false);
    }
  }, []);

  const fetchContacts = useCallback(async (limit = 50, offset = 0) => {
    try {
      setContactsLoading(true);
      setError(null);
      const { data } = await getClient().get<BrevoContactListResponse>(
        `/brevo/contacts?limit=${limit}&offset=${offset}`
      );
      setContacts(data.contacts);
      setContactsCount(data.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch contacts");
    } finally {
      setContactsLoading(false);
    }
  }, []);

  const createContact = useCallback(
    async (req: BrevoCreateContactRequest): Promise<BrevoContact> => {
      try {
        setCreatingContact(true);
        setError(null);
        const { data } = await getClient().post<BrevoContact>("/brevo/contacts", req);
        await fetchContacts();
        return data;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create contact");
        throw err;
      } finally {
        setCreatingContact(false);
      }
    },
    [fetchContacts]
  );

  const sendEmail = useCallback(
    async (req: BrevoSendEmailRequest): Promise<BrevoSendEmailResponse> => {
      try {
        setSendingEmail(true);
        setError(null);
        const { data } = await getClient().post<BrevoSendEmailResponse>("/brevo/email/send", req);
        return data;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send email");
        throw err;
      } finally {
        setSendingEmail(false);
      }
    },
    []
  );

  const fetchTemplates = useCallback(async () => {
    try {
      setTemplatesLoading(true);
      setError(null);
      const { data } = await getClient().get<BrevoTemplateListResponse>("/brevo/templates");
      setTemplates(data.templates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch templates");
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  const sendSMS = useCallback(
    async (req: BrevoSendSMSRequest): Promise<BrevoSendSMSResponse> => {
      try {
        setSendingSMS(true);
        setError(null);
        const { data } = await getClient().post<BrevoSendSMSResponse>("/brevo/sms/send", req);
        return data;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send SMS");
        throw err;
      } finally {
        setSendingSMS(false);
      }
    },
    []
  );

  const fetchCampaigns = useCallback(async (type = "email", status?: string) => {
    try {
      setCampaignsLoading(true);
      setError(null);
      let url = `/brevo/campaigns?campaign_type=${type}`;
      if (status) url += `&status=${status}`;
      const { data } = await getClient().get<BrevoCampaignListResponse>(url);
      setCampaigns(data.campaigns);
      setCampaignsCount(data.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch campaigns");
    } finally {
      setCampaignsLoading(false);
    }
  }, []);

  return {
    account,
    accountLoading,
    fetchAccount,
    contacts,
    contactsCount,
    contactsLoading,
    fetchContacts,
    createContact,
    creatingContact,
    sendEmail,
    sendingEmail,
    templates,
    templatesLoading,
    fetchTemplates,
    sendSMS,
    sendingSMS,
    campaigns,
    campaignsCount,
    campaignsLoading,
    fetchCampaigns,
    error,
  };
}
