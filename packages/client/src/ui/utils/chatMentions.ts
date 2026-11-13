export interface MentionToken {
  start: number;
  end: number;
  query: string;
}

export interface MentionCandidate {
  handle: string;
  label: string;
  team: string;
}

export interface ChatSegment {
  kind: 'text' | 'mention';
  value: string;
  isSelf: boolean;
  isAll: boolean;
}

/**
 * Detects an active `@query` mention token immediately preceding the caret.
 */
export function findActiveMentionToken(text: string, cursorIndex: number): MentionToken | null {
  const safeCursor = Math.max(0, Math.min(text.length, cursorIndex));
  const before = text.slice(0, safeCursor);
  // Find last '@' that is either at start of input or preceded by whitespace
  const atIndex = before.lastIndexOf('@');
  if (atIndex === -1) return null;
  if (atIndex > 0 && !/\s/.test(before[atIndex - 1]!)) return null;

  const query = before.slice(atIndex + 1);
  // Stop autocomplete once user types any whitespace (closes immediately after picking @Handle )
  if (/\s/.test(query)) return null;
  // Keep single-word or nickname queries concise
  if (query.length > 24) return null;

  return {
    start: atIndex,
    end: safeCursor,
    query
  };
}

/**
 * Builds the autocomplete candidate list (`@all` + matching roster players).
 */
export function getMentionCandidates(
  query: string,
  rosterPlayers: ReadonlyArray<{ name?: string; nickname?: string; team?: string }>,
  excludeNickname?: string
): MentionCandidate[] {
  const normalized = query.trim().toLowerCase();
  const normalizedExclude = (excludeNickname ?? '').trim().toLowerCase();
  const candidates: MentionCandidate[] = [];

  if (!normalized || 'all'.startsWith(normalized) || 'todos'.startsWith(normalized)) {
    candidates.push({
      handle: 'all',
      label: 'Todos en la sala',
      team: 'all'
    });
  }

  const seen = new Set<string>(['all']);
  if (normalizedExclude) {
    seen.add(normalizedExclude);
  }
  for (const player of rosterPlayers) {
    const cleanName = (player.name ?? player.nickname ?? '').trim();
    if (!cleanName) continue;
    const key = cleanName.toLowerCase();
    if (seen.has(key)) continue;
    if (!normalized || key.includes(normalized)) {
      seen.add(key);
      candidates.push({
        handle: cleanName,
        label: cleanName,
        team: player.team ?? 'spec'
      });
    }
  }

  return candidates.slice(0, 8);
}

/**
 * Replaces the active `@query` token with `@handle ` and returns the new cursor offset.
 */
export function applyMentionCandidate(
  text: string,
  token: MentionToken,
  handle: string
): { nextText: string; nextCursor: number } {
  const prefix = text.slice(0, token.start);
  const suffix = text.slice(token.end);
  const insertion = `@${handle} `;
  const cleanedSuffix = suffix.startsWith(' ') ? suffix.slice(1) : suffix;
  const nextText = `${prefix}${insertion}${cleanedSuffix}`;
  return {
    nextText,
    nextCursor: prefix.length + insertion.length
  };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Splits a chat message into plain text and highlighted `@mention` segments.
 */
export function segmentChatMentions(
  text: string,
  localNickname: string,
  knownNames: ReadonlyArray<string | undefined> = [],
  senderNickname?: string
): ChatSegment[] {
  if (!text) return [{ kind: 'text', value: '', isSelf: false, isAll: false }];

  const selfLower = (localNickname || '').trim().toLowerCase();
  const senderLower = (senderNickname ?? '').trim().toLowerCase();
  const isOwnMessage = selfLower.length > 0 && senderLower === selfLower;
  const sortedNames = [...knownNames]
    .filter((n): n is string => typeof n === 'string')
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex);

  const nameAlternation = sortedNames.length > 0 ? `${sortedNames.join('|')}|` : '';
  const pattern = new RegExp(
    `(^|\\s)(@(?:all|${nameAlternation}[A-Za-z0-9_.-]{2,24}))(?=\\s|[.,!?:;)]|$)`,
    'gi'
  );

  const segments: ChatSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const leadingSpace = match[1] ?? '';
    const mentionText = match[2] ?? '';
    const mentionStart = match.index + leadingSpace.length;

    if (mentionStart > lastIndex) {
      segments.push({
        kind: 'text',
        value: text.slice(lastIndex, mentionStart),
        isSelf: false,
        isAll: false
      });
    }

    const rawHandle = mentionText.slice(1).toLowerCase();
    const isAll = rawHandle === 'all';
    const isSelf = !isOwnMessage && (isAll || (selfLower.length > 0 && rawHandle === selfLower));

    segments.push({
      kind: 'mention',
      value: mentionText,
      isSelf,
      isAll
    });

    lastIndex = mentionStart + mentionText.length;
  }

  if (lastIndex < text.length) {
    segments.push({
      kind: 'text',
      value: text.slice(lastIndex),
      isSelf: false,
      isAll: false
    });
  }

  return segments.length > 0 ? segments : [{ kind: 'text', value: text, isSelf: false, isAll: false }];
}
