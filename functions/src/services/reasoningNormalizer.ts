export interface NormalizedTextParts {
  content: string;
  reasoning: string;
}

export interface ResponsesNormalizedEvent {
  content: string;
  reasoning: string;
  done: boolean;
}

interface Marker {
  open: string;
  close: string;
}

const MARKERS: Marker[] = [
  { open: '<thinking>', close: '</thinking>' },
  { open: '<analysis>', close: '</analysis>' },
  { open: '<think>', close: '</think>' },
];

const REASONING_KEYS = [
  'reasoning_content',
  'reasoning',
  'thinking',
  'thought',
  'analysis',
  'reasoning_details',
  'thinking_content',
];

const TEXT_KEYS = [
  'text',
  'content',
  'value',
  'delta',
  'summary',
  'reasoning',
  'reasoning_content',
  'thinking',
  'thought',
  'analysis',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Extracts text from the string and structured text shapes used by model APIs.
 * Unknown object shapes are ignored rather than guessed.
 */
export function textFromValue(value: unknown): string {
  if (typeof value === 'string') return value;

  if (Array.isArray(value)) {
    return value.map((part) => textFromValue(part)).join('');
  }

  if (!isRecord(value)) return '';

  for (const key of TEXT_KEYS) {
    const text = textFromValue(value[key]);
    if (text) return text;
  }

  return '';
}

function appendUnique(target: string[], value: string): void {
  if (value && !target.includes(value)) target.push(value);
}

function extractReasoningText(delta: Record<string, unknown>): string {
  const values: string[] = [];
  for (const key of REASONING_KEYS) {
    appendUnique(values, textFromValue(delta[key]));
  }
  return values.join('');
}

function indexOfIgnoreCase(value: string, search: string): number {
  return value.toLowerCase().indexOf(search.toLowerCase());
}

function findMarker(
  value: string,
  markers: Marker[],
): { marker: Marker; index: number } | null {
  let result: { marker: Marker; index: number } | null = null;

  for (const marker of markers) {
    const index = indexOfIgnoreCase(value, marker.open);
    if (index < 0 || (result && index >= result.index)) continue;
    result = { marker, index };
  }

  return result;
}

function longestPrefixSuffix(value: string, candidates: string[]): number {
  let longest = 0;
  const lowerValue = value.toLowerCase();

  for (const candidate of candidates) {
    const lowerCandidate = candidate.toLowerCase();
    const maxLength = Math.min(lowerValue.length, lowerCandidate.length - 1);
    for (let length = 1; length <= maxLength; length += 1) {
      if (lowerValue.endsWith(lowerCandidate.slice(0, length))) {
        longest = Math.max(longest, length);
      }
    }
  }

  return longest;
}

function emptyParts(): NormalizedTextParts {
  return { content: '', reasoning: '' };
}

/**
 * Splits explicitly marked reasoning from content while retaining state across
 * upstream/network chunks. Only the configured markers are interpreted.
 */
export class ReasoningMarkupParser {
  private pending = '';
  private activeMarker: Marker | null = null;

  push(text: string): NormalizedTextParts {
    if (!text) return emptyParts();
    this.pending += text;
    return this.process();
  }

  flush(): NormalizedTextParts {
    if (!this.pending) return emptyParts();

    const pending = this.pending;
    this.pending = '';

    // An unclosed marker is ambiguous. Preserve the text as content rather
    // than silently dropping it or permanently classifying it as reasoning.
    this.activeMarker = null;
    return { content: pending, reasoning: '' };
  }

  private process(): NormalizedTextParts {
    const result = emptyParts();

    while (this.pending) {
      if (this.activeMarker) {
        const closeIndex = indexOfIgnoreCase(
          this.pending,
          this.activeMarker.close,
        );
        if (closeIndex >= 0) {
          result.reasoning += this.pending.slice(0, closeIndex);
          this.pending = this.pending.slice(
            closeIndex + this.activeMarker.close.length,
          );
          this.activeMarker = null;
          continue;
        }

        const keepLength = longestPrefixSuffix(this.pending, [
          this.activeMarker.close,
        ]);
        const emitLength = this.pending.length - keepLength;
        if (emitLength > 0) {
          result.reasoning += this.pending.slice(0, emitLength);
          this.pending = this.pending.slice(emitLength);
        }
        break;
      }

      const openMatch = findMarker(this.pending, MARKERS);
      if (openMatch) {
        result.content += this.pending.slice(0, openMatch.index);
        this.pending = this.pending.slice(
          openMatch.index + openMatch.marker.open.length,
        );
        this.activeMarker = openMatch.marker;
        continue;
      }

      const keepLength = longestPrefixSuffix(
        this.pending,
        MARKERS.map((marker) => marker.open),
      );
      const emitLength = this.pending.length - keepLength;
      if (emitLength > 0) {
        result.content += this.pending.slice(0, emitLength);
        this.pending = this.pending.slice(emitLength);
      }
      break;
    }

    return result;
  }
}

export function createReasoningMarkupParser(): ReasoningMarkupParser {
  return new ReasoningMarkupParser();
}

export function normalizeChatCompletionDelta(
  delta: unknown,
  markupParser: ReasoningMarkupParser,
): NormalizedTextParts {
  const record = isRecord(delta) ? delta : {};
  const contentParts = markupParser.push(textFromValue(record.content));
  return {
    content: contentParts.content,
    reasoning: extractReasoningText(record) + contentParts.reasoning,
  };
}

export function normalizeResponsesEvent(
  event: unknown,
  markupParser: ReasoningMarkupParser,
): ResponsesNormalizedEvent | null {
  if (!isRecord(event) || typeof event.type !== 'string') return null;

  const eventType = event.type.toLowerCase();
  if (eventType === 'response.completed') {
    return { content: '', reasoning: '', done: true };
  }

  const itemType =
    isRecord(event.item) && typeof event.item.type === 'string'
      ? event.item.type.toLowerCase()
      : '';
  const isReasoningEvent =
    eventType.includes('reasoning') ||
    eventType.includes('thinking') ||
    itemType.includes('reasoning') ||
    itemType.includes('thinking');

  if (isReasoningEvent) {
    const value =
      event.delta ?? event.text ?? event.summary ?? event.content ?? event.item;
    return { content: '', reasoning: textFromValue(value), done: false };
  }

  if (eventType.includes('output_text')) {
    const value = event.delta ?? event.text ?? event.content;
    const contentParts = markupParser.push(textFromValue(value));
    return {
      content: contentParts.content,
      reasoning: contentParts.reasoning,
      done: false,
    };
  }

  return null;
}
