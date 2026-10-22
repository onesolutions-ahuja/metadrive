export type InboxRecord = Record<string, unknown>;

const pick = (row: InboxRecord, ...keys: string[]): unknown =>
  keys.map(key => row[key]).find(value => value !== undefined && value !== null);

const stringValue = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : value == null ? '' : String(value);

export const normalizeChatNumber = (value: unknown): string =>
  stringValue(value).replace(/\D/g, '');

export function communicationSenderPhone(row: InboxRecord): string {
  const sender = stringValue(pick(row, 'Sender'));
  const wrapped = sender.match(/\(([^()]*)\)\s*$/);
  const digits = normalizeChatNumber(wrapped?.[1] ?? sender);
  return /^\d{7,15}$/.test(digits) ? digits : '';
}

export function communicationSenderName(row: InboxRecord): string {
  const sender = stringValue(pick(row, 'Sender'));
  const wrapped = sender.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  const name = wrapped?.[1]?.trim() ?? sender;
  const phone = communicationSenderPhone(row);
  return !name || normalizeChatNumber(name) === phone ? phone : name;
}

const occurredAt = (row: InboxRecord): string =>
  stringValue(pick(row, '__lastMessageAt', 'ReceivedAt', 'SentAt', 'CreatedAt', 'CreatedDate', 'LastModifiedDate'));

const timeValue = (row: InboxRecord): number => {
  const value = Date.parse(occurredAt(row));
  return Number.isFinite(value) ? value : 0;
};

/** Merge Flow-authorised ChatConversation records with WhatsApp Communication records.
 * A phone number is the stable inbox key; missing conversations remain sendable by
 * creating the normal ChatConversation through its authorised Flow before sending. */
export function buildCommunicationInbox(
  conversations: readonly InboxRecord[],
  communications: readonly InboxRecord[],
  searchTerm = ''
): InboxRecord[] {
  const byPhone = new Map<string, InboxRecord>();

  for (const row of conversations) {
    const phone = normalizeChatNumber(pick(row, 'PhoneNumber'));
    if (!/^\d{7,15}$/.test(phone) || byPhone.has(phone)) continue;
    byPhone.set(phone, { ...row, PhoneNumber: phone, __syntheticConversation: false });
  }

  for (const row of communications) {
    const phone = communicationSenderPhone(row);
    if (!phone) continue;
    const timestamp = occurredAt(row);
    const senderName = communicationSenderName(row);
    const previous = byPhone.get(phone);

    if (previous) {
      const priorTime = stringValue(previous.__lastMessageAt);
      byPhone.set(phone, {
        ...previous,
        Name: stringValue(pick(previous, 'Name')) || senderName,
        PhoneNumber: phone,
        __isCommunicationBacked: true,
        __lastMessageAt: timestamp >= priorTime ? timestamp : priorTime,
        __lastMessageBody: timestamp >= priorTime
          ? stringValue(pick(row, 'Body'))
          : stringValue(previous.__lastMessageBody)
      });
    } else {
      byPhone.set(phone, {
        Id: 'communication:' + phone,
        Name: senderName,
        PhoneNumber: phone,
        Status: 'WhatsApp',
        __syntheticConversation: true,
        __isCommunicationBacked: true,
        __lastMessageAt: timestamp,
        __lastMessageBody: stringValue(pick(row, 'Body'))
      });
    }
  }

  const term = stringValue(searchTerm).toLowerCase();
  const digits = normalizeChatNumber(searchTerm);
  return [...byPhone.values()]
    .filter(row => {
      if (!term) return true;
      const phone = normalizeChatNumber(pick(row, 'PhoneNumber'));
      const name = stringValue(pick(row, 'Name')).toLowerCase();
      return (digits.length >= 3 && phone.includes(digits)) || name.includes(term);
    })
    .sort((a, b) => timeValue(b) - timeValue(a) ||
      stringValue(pick(a, 'Name')).localeCompare(stringValue(pick(b, 'Name'))));
}

/** Prefer the durable Communication record when the same provider message was also
 * copied into a legacy ChatMessage record; preserve the Flow-created outbound rows. */
export function mergeCommunicationMessages(
  communications: readonly InboxRecord[],
  chatMessages: readonly InboxRecord[],
  phoneNumber: unknown
): InboxRecord[] {
  const phone = normalizeChatNumber(phoneNumber);
  const incoming = communications.filter(row => communicationSenderPhone(row) === phone);
  const seen = new Set<string>();
  const unique: InboxRecord[] = [];

  for (const row of [...incoming, ...chatMessages]) {
    const externalId = stringValue(pick(row, 'ExternalMessageId'));
    if (externalId && seen.has(externalId)) continue;
    if (externalId) seen.add(externalId);
    unique.push(row);
  }

  return unique.sort((a, b) => timeValue(a) - timeValue(b));
}
