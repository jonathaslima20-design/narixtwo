import { normalizeBrPhone } from './phoneNormalize';

export interface ParsedContact {
  phone: string;
  name: string;
  line: number;
}

export interface RejectedLine {
  line: number;
  raw: string;
  reason: string;
}

export interface ParseResult {
  contacts: ParsedContact[];
  rejected: RejectedLine[];
  truncated: boolean;
}

const MAX_CONTACTS = 1000;
const MIN_PHONE_DIGITS = 8;

export function parseContacts(raw: string): ParseResult {
  const lines = raw.split(/\r?\n/);
  const contacts: ParsedContact[] = [];
  const rejected: RejectedLine[] = [];
  const seen = new Set<string>();
  let truncated = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    const parts = trimmed.split(/[,;\t]+/).map((s) => s.trim());
    const phonePart = parts[0] || '';
    const namePart = parts[1] || '';

    const normalized = normalizeBrPhone(phonePart);

    if (!normalized || normalized.replace(/\D/g, '').length < MIN_PHONE_DIGITS) {
      rejected.push({ line: i + 1, raw: trimmed, reason: 'Numero invalido ou muito curto' });
      continue;
    }

    if (seen.has(normalized)) {
      rejected.push({ line: i + 1, raw: trimmed, reason: 'Duplicado no lote' });
      continue;
    }

    seen.add(normalized);

    if (contacts.length >= MAX_CONTACTS) {
      truncated = true;
      break;
    }

    contacts.push({ phone: normalized, name: namePart, line: i + 1 });
  }

  return { contacts, rejected, truncated };
}
