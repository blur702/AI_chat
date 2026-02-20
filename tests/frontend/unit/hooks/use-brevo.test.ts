import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mockClient = {
  get: vi.fn(),
  post: vi.fn(),
};
vi.mock("@workstation/api/client", () => ({ getClient: () => mockClient }));

import { useBrevo } from "@workstation/api/hooks/use-brevo";

const sampleAccount = { email: "test@example.com", plan: "free" };
const sampleContacts = {
  contacts: [{ id: 1, email: "user@example.com" }],
  count: 1,
};
const sampleTemplates = {
  templates: [{ id: 1, name: "Welcome" }],
};
const sampleCampaigns = {
  campaigns: [{ id: 1, name: "Campaign 1" }],
  count: 1,
};

describe("useBrevo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.get.mockImplementation((url: string) => {
      if (url.includes("/brevo/account")) return Promise.resolve({ data: sampleAccount });
      if (url.includes("/brevo/contacts")) return Promise.resolve({ data: sampleContacts });
      if (url.includes("/brevo/templates")) return Promise.resolve({ data: sampleTemplates });
      if (url.includes("/brevo/campaigns")) return Promise.resolve({ data: sampleCampaigns });
      return Promise.resolve({ data: null });
    });
    mockClient.post.mockImplementation((url: string) => {
      if (url.includes("/brevo/contacts"))
        return Promise.resolve({ data: { id: 2, email: "new@example.com" } });
      if (url.includes("/brevo/email/send"))
        return Promise.resolve({ data: { messageId: "msg1" } });
      if (url.includes("/brevo/sms/send"))
        return Promise.resolve({ data: { reference: "sms1" } });
      return Promise.resolve({ data: null });
    });
  });

  it("initial state is empty and not loading", () => {
    const { result } = renderHook(() => useBrevo());
    expect(result.current.account).toBeNull();
    expect(result.current.accountLoading).toBe(false);
    expect(result.current.contacts).toEqual([]);
    expect(result.current.templates).toEqual([]);
    expect(result.current.campaigns).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("fetchAccount loads account info", async () => {
    const { result } = renderHook(() => useBrevo());

    await act(async () => {
      await result.current.fetchAccount();
    });

    expect(mockClient.get).toHaveBeenCalledWith("/brevo/account");
    expect(result.current.account).toEqual(sampleAccount);
  });

  it("fetchAccount sets error on failure", async () => {
    mockClient.get.mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => useBrevo());

    await act(async () => {
      await result.current.fetchAccount();
    });

    expect(result.current.error).toBeTruthy();
  });

  it("fetchContacts loads contacts with pagination", async () => {
    const { result } = renderHook(() => useBrevo());

    await act(async () => {
      await result.current.fetchContacts(25, 10);
    });

    expect(mockClient.get).toHaveBeenCalledWith("/brevo/contacts?limit=25&offset=10");
    expect(result.current.contacts).toEqual(sampleContacts.contacts);
    expect(result.current.contactsCount).toBe(1);
  });

  it("createContact calls API and refreshes contacts", async () => {
    const { result } = renderHook(() => useBrevo());

    const contactData = { email: "new@example.com" };
    let created: unknown;
    await act(async () => {
      created = await result.current.createContact(contactData as never);
    });

    expect(mockClient.post).toHaveBeenCalledWith("/brevo/contacts", contactData);
    expect(created).toEqual({ id: 2, email: "new@example.com" });
  });

  it("createContact throws on error", async () => {
    mockClient.post.mockRejectedValue(new Error("Create failed"));
    const { result } = renderHook(() => useBrevo());

    await act(async () => {
      try {
        await result.current.createContact({ email: "fail@test.com" } as never);
      } catch {
        // expected
      }
    });

    expect(result.current.error).toBeTruthy();
  });

  it("sendEmail calls API and returns response", async () => {
    const { result } = renderHook(() => useBrevo());

    const emailData = { to: [{ email: "user@test.com" }], subject: "Test", htmlContent: "<p>Hi</p>" };
    let emailResult: unknown;
    await act(async () => {
      emailResult = await result.current.sendEmail(emailData as never);
    });

    expect(mockClient.post).toHaveBeenCalledWith("/brevo/email/send", emailData);
    expect(emailResult).toEqual({ messageId: "msg1" });
  });

  it("sendEmail throws on error", async () => {
    mockClient.post.mockRejectedValue(new Error("Send failed"));
    const { result } = renderHook(() => useBrevo());

    await act(async () => {
      try {
        await result.current.sendEmail({ to: [] } as never);
      } catch {
        // expected
      }
    });

    expect(result.current.error).toBeTruthy();
  });

  it("fetchTemplates loads templates", async () => {
    const { result } = renderHook(() => useBrevo());

    await act(async () => {
      await result.current.fetchTemplates();
    });

    expect(mockClient.get).toHaveBeenCalledWith("/brevo/templates");
    expect(result.current.templates).toEqual(sampleTemplates.templates);
  });

  it("sendSMS calls API and returns response", async () => {
    const { result } = renderHook(() => useBrevo());

    const smsData = { recipient: "+1234567890", content: "Hello" };
    let smsResult: unknown;
    await act(async () => {
      smsResult = await result.current.sendSMS(smsData as never);
    });

    expect(mockClient.post).toHaveBeenCalledWith("/brevo/sms/send", smsData);
    expect(smsResult).toEqual({ reference: "sms1" });
  });

  it("sendSMS throws on error", async () => {
    mockClient.post.mockRejectedValue(new Error("SMS failed"));
    const { result } = renderHook(() => useBrevo());

    await act(async () => {
      try {
        await result.current.sendSMS({ recipient: "+1" } as never);
      } catch {
        // expected
      }
    });

    expect(result.current.error).toBeTruthy();
  });

  it("fetchCampaigns loads campaigns with type and status", async () => {
    const { result } = renderHook(() => useBrevo());

    await act(async () => {
      await result.current.fetchCampaigns("email", "sent");
    });

    expect(mockClient.get).toHaveBeenCalledWith("/brevo/campaigns?campaign_type=email&status=sent");
    expect(result.current.campaigns).toEqual(sampleCampaigns.campaigns);
    expect(result.current.campaignsCount).toBe(1);
  });

  it("fetchCampaigns uses default type when not specified", async () => {
    const { result } = renderHook(() => useBrevo());

    await act(async () => {
      await result.current.fetchCampaigns();
    });

    expect(mockClient.get).toHaveBeenCalledWith("/brevo/campaigns?campaign_type=email");
  });
});
