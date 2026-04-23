import type { Lead } from './types';

export function isPrivateContact(lead: Pick<Lead, 'phone' | 'whatsapp_jid'>): boolean {
  if (typeof lead.phone === 'string' && lead.phone.startsWith('lid:')) return true;
  if (typeof lead.whatsapp_jid === 'string' && lead.whatsapp_jid.endsWith('@lid')) return true;
  return false;
}

export function leadPhoneLabel(lead: Pick<Lead, 'phone' | 'whatsapp_jid'>): string {
  if (isPrivateContact(lead)) return 'Número oculto';
  return lead.phone || '';
}

export function leadDisplayName(lead: Pick<Lead, 'name' | 'phone' | 'whatsapp_jid'>): string {
  if (lead.name && lead.name.trim()) return lead.name;
  if (isPrivateContact(lead)) return 'Contato WhatsApp';
  return lead.phone || '';
}
