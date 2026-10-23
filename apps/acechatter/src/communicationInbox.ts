export type InboxRecord = Record<string, unknown>;

const pick = (row: InboxRecord, ...keys: string[]): unknown =>
  keys.map(key => row[key]).find(value => value !== undefined && value !== null);

const stringValue = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : value == null ? '' : String(value);

export const normalizeChatNumber = (value: unknown): string =>
  stringValue(value).replace(/\D/g, '');

const directionOf = (row: InboxRecord): string =>
  stringValue(pick(row, 'Direction', 'MessageDirection')).toLowerCase();

const isWhatsAppCommunication = (row: InboxRecord): boolean =>
  stringValue(pick(row, 'Channel')).toLowerCase() === 'whatsapp';

/** Communication records describe the business as Sender on outbound rows, so the
 * customer thread key must come from Recipient for outbound and Sender for inbound. */
export function communicationSenderPhone(row: InboxRecord): string {
  const direction = directionOf(row);
  const participant = direction.includes('out')
    ? pick(row, 'Recipient')
    : direction.includes('in')
      ? pick(row, 'Sender')
      : pick(row, 'Sender') ?? pick(row, 'Recipient');
  const digits = normalizeChatNumber(participant);
  return /^\d{7,15}$/.test(digits) ? digits : '';
}

export function communicationSenderName(row: InboxRecord): string {
  const direction = directionOf(row);
  const participant = stringValue(direction.includes('out')
    ? pick(row, 'Recipient')
    : pick(row, 'Sender') ?? pick(row, 'Recipient'));
  const wrapped = participant.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  const name = wrapped?.[1]?.trim() ?? participant;
  const phone = communicationSenderPhone(row);
  return !name || normalizeChatNumber(name) === phone ? phone : name;
}

const occurredAt = (row: InboxRecord): string => {
  const direction = directionOf(row);
  const value = direction.includes('out')
    ? pick(row, '__lastMessageAt', 'SentAt', 'ReceivedAt', 'CreatedAt', 'CreatedDate', 'LastModifiedDate')
    : pick(row, '__lastMessageAt', 'ReceivedAt', 'SentAt', 'CreatedAt', 'CreatedDate', 'LastModifiedDate');
  return stringValue(value);
};

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
    if (!isWhatsAppCommunication(row)) continue;
    const phone = communicationSenderPhone(row);
    if (!phone) continue;
    const timestamp = occurredAt(row);
    const senderName = communicationSenderName(row);
    const previous = byPhone.get(phone);
    const isLatest = !previous || Date.parse(timestamp) >= timeValue(previous);

    if (previous) {
      byPhone.set(phone, {
        ...previous,
        Name: stringValue(pick(previous, 'Name')) || senderName,
        PhoneNumber: phone,
        __isCommunicationBacked: true,
        __communicationName: senderName,
        __lastMessageAt: isLatest ? timestamp : stringValue(previous.__lastMessageAt),
        __lastMessageBody: isLatest
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
        __communicationName: senderName,
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
      const communicationName = stringValue(row.__communicationName).toLowerCase();
      return (digits.length >= 3 && phone.includes(digits)) || name.includes(term) || communicationName.includes(term);
    })
    .sort((a, b) => timeValue(b) - timeValue(a) ||
      stringValue(pick(a, 'Name')).localeCompare(stringValue(pick(b, 'Name'))));
}

/** Communication is authoritative for both directions. Keep legacy Flow-created
 * ChatMessage rows only when they aren't already represented by a provider message ID. */
export function mergeCommunicationMessages(
  communications: readonly InboxRecord[],
  chatMessages: readonly InboxRecord[],
  phoneNumber: unknown
): InboxRecord[] {
  const phone = normalizeChatNumber(phoneNumber);
  const matching = communications.filter(row =>
    isWhatsAppCommunication(row) && communicationSenderPhone(row) === phone);
  const seen = new Set<string>();
  const unique: InboxRecord[] = [];

  for (const row of [...matching, ...chatMessages]) {
    const externalId = stringValue(pick(row, 'ExternalMessageId'));
    if (externalId && seen.has(externalId)) continue;
    if (externalId) seen.add(externalId);
    unique.push(row);
  }

  return unique.sort((a, b) => timeValue(a) - timeValue(b));
}
