export type MailType =
  | 'quote'
  | 'contract'
  | 'conti'
  | 'proposal'
  | 'original_files'
  | 'gallery'
  | 'review_form'
  | 'monthly_report';

export interface MailingAttachment {
  filename: string;
  content_type: string;
  content: string; // base64
}

export interface MailingLink {
  label: string;
  url: string;
}

export interface MailingDraftPayload {
  type: MailType;
  source_module: string;
  source_id?: string;
  hospital_name: string;
  contact_name?: string;
  to_email?: string;
  subject: string;
  body: string;
  attachments?: MailingAttachment[];
  links?: MailingLink[];
}

export async function createMailingDraft(
  payload: MailingDraftPayload
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const res = await fetch('/api/mailing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return data;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : '메일링 저장 실패' };
  }
}
