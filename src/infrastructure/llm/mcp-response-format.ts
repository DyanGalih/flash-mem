import { encodeToon } from './toon';

export type McpToolResponseFormat = 'json' | 'toon' | 'markdown';

type TextContent = {
  type: 'text';
  text: string;
};

type ToolContentResponse = {
  content: TextContent[];
  isError?: boolean;
};

function hasContentResponse(value: unknown): value is ToolContentResponse {
  return !!value
    && typeof value === 'object'
    && Array.isArray((value as ToolContentResponse).content)
    && (value as ToolContentResponse).content.every((item) => item && item.type === 'text' && typeof item.text === 'string');
}

function extractMarkdownText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object') {
    const candidate = (value as { markdown?: unknown; text?: unknown }).markdown;
    if (typeof candidate === 'string') {
      return candidate;
    }

    const textCandidate = (value as { text?: unknown }).text;
    if (typeof textCandidate === 'string') {
      return textCandidate;
    }
  }

  return typeof value === 'undefined' ? 'null' : JSON.stringify(value, null, 2);
}

function stringifyJson(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  return typeof value === 'undefined' ? 'null' : JSON.stringify(value, null, 2);
}

export async function formatMcpToolResult(
  value: unknown,
  responseFormat: McpToolResponseFormat = 'json'
): Promise<ToolContentResponse> {
  if (hasContentResponse(value)) {
    return value;
  }

  let text: string;
  if (responseFormat === 'toon') {
    text = await encodeToon(value);
  } else if (responseFormat === 'markdown') {
    text = extractMarkdownText(value);
  } else {
    text = stringifyJson(value);
  }

  return {
    content: [
      {
        type: 'text',
        text
      }
    ]
  };
}
