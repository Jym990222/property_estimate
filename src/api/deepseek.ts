// src/api/deepseek.ts


const BASE = `${import.meta.env.VITE_API_BASE_URL}/api`;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function askDeepSeek(
  messages: ChatMessage[],
  onChunk?: (text: string) => void
): Promise<string> {
  const response = await fetch(`${BASE}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',

    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      stream: !!onChunk,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`后端 API 错误: ${response.status} - ${errText}`);
  }

  if (!onChunk) {
    const data = await response.json();
    return data.choices[0].message.content;
  }

  // 流式处理（保持不变）
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
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
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const dataStr = trimmed.slice(6);
      if (dataStr === '[DONE]') continue;
      try {
        const json = JSON.parse(dataStr);
        const content = json.choices?.[0]?.delta?.content;
        if (content) {
          fullText += content;
          onChunk(content);
        }
      } catch {
        // 忽略
      }
    }
  }

  return fullText;
}