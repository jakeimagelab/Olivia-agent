export type MailType =
  | 'quote'
  | 'contract'
  | 'conti'
  | 'proposal'
  | 'original_files'
  | 'gallery'
  | 'select_gallery'
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
  client_id?: string | null;
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
    const text = await res.text();
    let data: { ok: boolean; id?: string; error?: string };
    try {
      data = JSON.parse(text);
    } catch {
      console.error('[mailingQueue] 응답 파싱 실패:', text.slice(0, 300));
      return { ok: false, error: `응답 파싱 실패: ${text.slice(0, 100)}` };
    }
    if (!data.ok) {
      console.error('[mailingQueue] 저장 실패:', data.error, '| payload:', payload.type, payload.hospital_name);
    } else {
      console.log('[mailingQueue] 저장 성공:', data.id, '|', payload.type, payload.hospital_name);
    }
    return data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : '메일링 저장 실패';
    console.error('[mailingQueue] 네트워크 오류:', msg);
    return { ok: false, error: msg };
  }
}
