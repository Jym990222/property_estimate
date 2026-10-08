// src/api/deepseek.ts
// AI 模块：/api/ai/v1（POST 新建对话补全；stream=true 时按 SSE 增量返回）
import { API_ORIGIN, ApiError, buildUrl } from './http';

const BASE = `${API_ORIGIN}/api/ai/v1`;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface CompletionData {
  content: string;
  role: string;
  model: string;
  finish_reason: string | null;
  usage?: Record<string, unknown> | null;
}

interface StreamEvent {
  delta?: { content?: string };
  done?: boolean;
  error?: { code?: string; message?: string };
}

/**
 * 调用对话补全接口。
 * - 不传 onChunk：非流式，返回完整文本（取自信封的 data.content）
 * - 传 onChunk：流式，逐段回调增量文本
 */
export async function askDeepSeek(
  messages: ChatMessage[],
  onChunk?: (text: string) => void,
): Promise<string> {
  const stream = !!onChunk;
  const response = await fetch(buildUrl(`${BASE}/chat-completions`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      stream,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    let payload: { error?: { code?: string; message?: string; status?: number; details?: { field?: string | null; message: string }[]; request_id?: string } } | null = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    const error = payload?.error;
    throw new ApiError(
      error?.message || `后端 API 错误: ${response.status}`,
      error?.code || 'HTTP_ERROR',
      error?.status ?? response.status,
      error?.details ?? [],
      error?.request_id,
    );
  }

  // ---------- 非流式 ----------
  if (!onChunk) {
    const envelope = await response.json();
    const data = (envelope?.data ?? {}) as CompletionData;
    return data.content ?? '';
  }

  // ---------- 流式 ----------
  // SSE 事件：data: {"delta":{"content":"..."}} … data: {"done":true,...} … data: [DONE]
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const pushChunk = onChunk;
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payloadText = trimmed.slice(5).trim();
      if (!payloadText || payloadText === '[DONE]') continue;
      let event: StreamEvent;
      try {
        event = JSON.parse(payloadText) as StreamEvent;
      } catch {
        continue;
      }
      if (event.error) {
        throw new ApiError(event.error.message || 'AI 流式返回失败', event.error.code || 'UPSTREAM_ERROR', 502);
      }
      if (event.done) continue;
      const content = event.delta?.content;
      if (content) {
        fullText += content;
        pushChunk(content);
      }
    }
  }

  return fullText;
}
