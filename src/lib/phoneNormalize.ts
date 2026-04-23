function onlyDigits(raw: string): string {
  return (raw || '').replace(/\D/g, '');
}

export function normalizeBrPhone(raw: string): string {
  const digits = onlyDigits(raw);
  if (!digits) return '';
  if (digits.startsWith('55')) {
    const rest = digits.slice(2);
    if (rest.length === 10) {
      const ddd = rest.slice(0, 2);
      const first = rest.charAt(2);
      const subscriber = rest.slice(2);
      if (/[6-9]/.test(first)) return `55${ddd}9${subscriber}`;
    }
    return digits;
  }
  if (digits.length === 11) {
    const first = digits.charAt(2);
    if (/[6-9]/.test(first)) return `55${digits}`;
  }
  if (digits.length === 10) {
    const ddd = digits.slice(0, 2);
    const first = digits.charAt(2);
    const subscriber = digits.slice(2);
    if (/[6-9]/.test(first)) return `55${ddd}9${subscriber}`;
    return `55${digits}`;
  }
  return digits;
}
