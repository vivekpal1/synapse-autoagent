/**
 * Ace Data Cloud service catalog. Each descriptor is a self-contained,
 * data-driven definition of one AI capability: where it lives, how to build the
 * request, how to read the result, and a dry-run price estimate. Adding a new
 * AceData service is just appending one descriptor — no other code changes.
 *
 * Endpoints/shapes are from docs/INTEGRATION-GUIDE.md §7 (source-verified).
 * `estimatedAtomic` is a DRY-RUN fallback only (USDC base units on Solana); the
 * live path always reads the real price from the 402 `accepts[]`.
 */
export interface AceServiceResult {
  summary: string; // short human description of the output
  data: unknown; // the raw parsed payload
  artifactKind?: string; // 'text' | 'json' | 'audio-url' | 'image-url' | 'video-url'
  artifactValue?: unknown;
  taskId?: string; // present for task-based services awaiting polling
}

export interface AceServiceDescriptor {
  id: string;
  label: string;
  /** SAP tool-category alignment, for the "selling" side (publishing on SAP). */
  category: 'Data' | 'Analytics' | 'Custom';
  path: string;
  method: 'POST';
  taskBased: boolean;
  /** Dry-run price estimate, USDC base units (6 decimals) on Solana. */
  estimatedAtomic: number;
  buildBody(input: Record<string, any>): unknown;
  buildHeaders?(input: Record<string, any>): Record<string, string>;
  extractResult(json: any): AceServiceResult;
}

const text = (s: unknown): string => (typeof s === 'string' ? s : JSON.stringify(s));

export const ACE_SERVICES: Record<string, AceServiceDescriptor> = {
  // 1) LLM chat — OpenAI-compatible, synchronous
  chat: {
    id: 'chat',
    label: 'LLM Chat (openai/chat/completions)',
    category: 'Custom',
    path: '/openai/chat/completions',
    method: 'POST',
    taskBased: false,
    estimatedAtomic: 95_215, // ~0.095 USDC on Solana (Solana carries a markup)
    buildBody(input) {
      const messages =
        input.messages ??
        [
          input.system ? { role: 'system', content: input.system } : null,
          { role: 'user', content: input.prompt ?? 'Say hello in three words.' },
        ].filter(Boolean);
      return {
        model: input.model ?? 'gpt-4o-mini',
        messages,
        max_tokens: input.max_tokens ?? 512,
        temperature: input.temperature ?? 0.7,
      };
    },
    extractResult(json) {
      const content = json?.choices?.[0]?.message?.content ?? '';
      return {
        summary: `chat → ${text(content).slice(0, 80)}`,
        data: json,
        artifactKind: 'text',
        artifactValue: content,
      };
    },
  },

  // 2) Web search — Google SERP, synchronous
  search: {
    id: 'search',
    label: 'Web Search (serp/google)',
    category: 'Data',
    path: '/serp/google',
    method: 'POST',
    taskBased: false,
    estimatedAtomic: 30_000,
    buildBody(input) {
      return {
        query: input.query ?? input.prompt ?? 'Solana x402 autonomous agents',
        type: input.type ?? 'search',
        number: input.number ?? 10,
        country: input.country ?? 'us',
        language: input.language ?? 'en',
      };
    },
    extractResult(json) {
      const organic = Array.isArray(json?.organic) ? json.organic : [];
      const titles = organic.slice(0, 5).map((o: any) => o?.title).filter(Boolean);
      return {
        summary: `search → ${organic.length} results: ${titles.join(' · ').slice(0, 80)}`,
        data: json,
        artifactKind: 'json',
        artifactValue: { organic: organic.slice(0, 10), knowledge_graph: json?.knowledge_graph },
      };
    },
  },

  // 3) Text-to-speech — Fish Audio (engine via `model` HEADER, not body)
  tts: {
    id: 'tts',
    label: 'Text-to-Speech (fish/tts)',
    category: 'Custom',
    path: '/fish/tts',
    method: 'POST',
    taskBased: false,
    estimatedAtomic: 40_000,
    buildHeaders(input) {
      return { model: input.engine ?? 's2-pro', accept: 'application/x-ndjson' };
    },
    buildBody(input) {
      return {
        text: input.text ?? input.prompt ?? 'Hello from an autonomous Solana agent.',
        format: input.format ?? 'mp3',
      };
    },
    extractResult(json) {
      const url = json?.audio_url ?? json?.url;
      return {
        summary: `tts → ${url ? 'audio ready' : 'queued'}`,
        data: json,
        artifactKind: 'audio-url',
        artifactValue: url,
        taskId: json?.task_id,
      };
    },
  },

  // 4) Image generation — Midjourney (task-based)
  image: {
    id: 'image',
    label: 'Image Generation (midjourney/imagine)',
    category: 'Custom',
    path: '/midjourney/imagine',
    method: 'POST',
    taskBased: true,
    estimatedAtomic: 180_000,
    buildHeaders() {
      return { accept: 'application/x-ndjson' };
    },
    buildBody(input) {
      return { prompt: input.prompt ?? 'a glowing autonomous robot on a Solana circuit board', mode: input.mode ?? 'fast' };
    },
    extractResult(json) {
      const url = json?.image_url ?? json?.raw_image_url;
      return {
        summary: `image → ${url ? 'image ready' : `task ${json?.task_id ?? '?'}`}`,
        data: json,
        artifactKind: 'image-url',
        artifactValue: url,
        taskId: json?.task_id,
      };
    },
  },

  // 5) Video generation — Google Veo (task-based)
  video: {
    id: 'video',
    label: 'Video Generation (veo/videos)',
    category: 'Custom',
    path: '/veo/videos',
    method: 'POST',
    taskBased: true,
    estimatedAtomic: 200_000,
    buildBody(input) {
      return { model: input.model ?? 'veo', prompt: input.prompt ?? 'a drone shot over a neon city', image_url: input.image_url ?? null };
    },
    extractResult(json) {
      const url = json?.video_url;
      return {
        summary: `video → ${url ? 'video ready' : `task ${json?.task_id ?? '?'}`}`,
        data: json,
        artifactKind: 'video-url',
        artifactValue: url,
        taskId: json?.task_id,
      };
    },
  },
};

export type AceServiceId = keyof typeof ACE_SERVICES;

export function getService(id: string): AceServiceDescriptor {
  const svc = ACE_SERVICES[id];
  if (!svc) {
    throw new Error(
      `Unknown Ace Data Cloud service "${id}". Known: [${Object.keys(ACE_SERVICES).join(', ')}].`,
    );
  }
  return svc;
}

/** A dry-run simulated payload so workflows complete end-to-end without spending. */
export function simulateResult(svc: AceServiceDescriptor, input: Record<string, any>): AceServiceResult {
  switch (svc.id) {
    case 'chat':
      return {
        summary: 'chat → [SIMULATED] concise answer',
        data: { simulated: true },
        artifactKind: 'text',
        artifactValue: `[SIMULATED] Answer to: ${text(input.prompt ?? input.messages ?? 'prompt')}`,
      };
    case 'search':
      return {
        summary: 'search → [SIMULATED] 10 results',
        data: { simulated: true },
        artifactKind: 'json',
        artifactValue: { organic: [{ title: '[SIMULATED] top result', link: 'https://example.com' }] },
      };
    case 'tts':
      return { summary: 'tts → [SIMULATED] audio', data: { simulated: true }, artifactKind: 'audio-url', artifactValue: 'https://example.com/simulated.mp3' };
    case 'image':
      return { summary: 'image → [SIMULATED] image', data: { simulated: true }, artifactKind: 'image-url', artifactValue: 'https://example.com/simulated.png' };
    case 'video':
      return { summary: 'video → [SIMULATED] video', data: { simulated: true }, artifactKind: 'video-url', artifactValue: 'https://example.com/simulated.mp4' };
    default:
      return { summary: `${svc.id} → [SIMULATED]`, data: { simulated: true } };
  }
}
