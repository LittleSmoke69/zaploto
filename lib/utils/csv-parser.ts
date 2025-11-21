/**
 * Utilitário para parsing de arquivos CSV
 */

export interface ParsedContact {
  name?: string;
  telefone: string;
  status?: string;
  status_disparo?: boolean;
  status_add_gp?: boolean;
}

/**
 * Parse um arquivo CSV e retorna array de contatos
 */
export function parseCSV(raw: string): ParsedContact[] {
  const firstLine = raw.split(/\r?\n/)[0] || '';
  const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';

  const lines = raw
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length === 0) return [];

  const header = lines[0].split(delimiter).map(h => h.trim().toLowerCase());

  const phoneCandidates = [
    'telefone',
    'phone',
    'phone_number',
    'number',
    'phone_numbwer_number',
    'phonenumber',
  ];
  const telIdx = header.findIndex(h => phoneCandidates.includes(h));
  const nameIdx = header.findIndex(h => h === 'name' || h === 'nome');

  const parsed: ParsedContact[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter);
    const telefoneRaw = telIdx >= 0 ? (cols[telIdx] || '').replace(/\D/g, '') : '';
    if (!telefoneRaw) continue;

    parsed.push({
      name: nameIdx >= 0 ? (cols[nameIdx] || '').trim() : undefined,
      telefone: telefoneRaw,
      status: 'pending',
      status_disparo: false,
      status_add_gp: false,
    });
  }
  return parsed;
}

/**
 * Valida se um CSV tem formato válido
 */
export function validateCSV(parsed: ParsedContact[], maxContacts: number = 10000): {
  valid: boolean;
  error?: string;
} {
  if (parsed.length === 0) {
    return { valid: false, error: 'Nenhum contato válido encontrado' };
  }

  if (parsed.length > maxContacts) {
    return { valid: false, error: `Limite de ${maxContacts} contatos excedido` };
  }

  return { valid: true };
}

