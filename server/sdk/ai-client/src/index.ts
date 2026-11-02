export type GenerateInput = { input: string; model?: string; temperature?: number; maxOutputTokens?: number };
export type ChatInput = { messages: Array<{ role: 'user' | 'assistant'; content: string }>; model?: string };
export type GenerateResult = { requestId: string; text: string; provider: string; model: string; usage: { inputTokens: number; outputTokens: number; totalTokens: number; estimatedCostUsd?: number | null }; latencyMs: number };
export type ClientOptions = { apiKey: string; baseUrl?: string; fetch?: typeof fetch };

export class KenoraAI {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: ClientOptions) {
    if (!options.apiKey) throw new Error('A Kenora project API key is required.');
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? 'http://localhost:4000').replace(/\/$/, '');
    this.fetcher = options.fetch ?? fetch;
  }

  generate(input: GenerateInput) { return this.request<GenerateResult>('/v1/generate', { method: 'POST', body: JSON.stringify(input) }); }
  chat(input: ChatInput) { return this.request<GenerateResult>('/v1/chat', { method: 'POST', body: JSON.stringify(input) }); }
  models() { return this.request<Array<{ provider: string; modelId: string; displayName: string; capabilities: string[] }>>('/v1/models'); }
  project() { return this.request<{ name: string; slug: string; status: string; environment: string; aiEnabled: boolean; provider: string; model: string }>('/v1/projects/me'); }
  usage() { return this.request<{ requests: number; tokens: number; estimatedCostUsd: number | null }>('/v1/usage/me'); }
  embeddings(input: { input: string | string[]; model?: string }) { return this.request<{ model: string; embeddings: Array<{ values?: number[] }>; usage: { inputTokens: number; estimatedCostUsd: number | null } }>('/v1/embeddings', { method: 'POST', body: JSON.stringify(input) }); }

  async *stream(input: GenerateInput): AsyncIterable<string> {
    const response = await this.fetcher(`${this.baseUrl}/v1/generate/stream`, { method: 'POST', headers: this.headers(), body: JSON.stringify(input) });
    if (!response.ok || !response.body) throw new Error(await this.errorMessage(response));
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
    while (true) {
      const { done, value } = await reader.read(); buffer += decoder.decode(value, { stream: !done });
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
        const event = frame.split(/\r?\n/).find((line) => line.startsWith('event: '))?.slice(7);
        const data = frame.split(/\r?\n/).find((line) => line.startsWith('data: '))?.slice(6);
        if (!data) continue;
        const payload = JSON.parse(data) as { text?: string; message?: string };
        if (event === 'delta' && payload.text) yield payload.text;
        if (event === 'error') throw new Error(payload.message ?? 'The streaming request failed.');
      }
      if (done) break;
    }
  }

  private headers() { return { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' }; }
  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, { ...init, headers: { ...this.headers(), ...init.headers } });
    const payload = await response.json() as { data?: T; error?: { message?: string } };
    if (!response.ok) throw new Error(payload.error?.message ?? `Kenora AI Hub request failed (${response.status}).`);
    return payload.data as T;
  }
  private async errorMessage(response: Response) { try { const payload = await response.json() as { error?: { message?: string } }; return payload.error?.message ?? `Kenora AI Hub request failed (${response.status}).`; } catch { return `Kenora AI Hub request failed (${response.status}).`; } }
}
