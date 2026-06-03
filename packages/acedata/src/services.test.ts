import { describe, expect, it } from 'vitest';
import { ACE_SERVICES, getService, simulateResult } from './services';

describe('Ace Data Cloud service catalog', () => {
  it('exposes at least 3 distinct services (Cat-2 requirement)', () => {
    expect(Object.keys(ACE_SERVICES).length).toBeGreaterThanOrEqual(3);
    expect(ACE_SERVICES.chat).toBeDefined();
    expect(ACE_SERVICES.search).toBeDefined();
    expect(ACE_SERVICES.tts).toBeDefined();
  });

  it('chat builds an OpenAI-compatible body from a prompt', () => {
    const body = ACE_SERVICES.chat!.buildBody({ prompt: 'hi', max_tokens: 10 }) as any;
    expect(body.model).toBeTruthy();
    expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'hi' });
    expect(body.max_tokens).toBe(10);
  });

  it('tts selects the engine via the model HEADER, never the body', () => {
    const svc = ACE_SERVICES.tts!;
    const headers = svc.buildHeaders!({ engine: 's1' });
    expect(headers.model).toBe('s1');
    expect(JSON.stringify(svc.buildBody({ text: 'x' }))).not.toContain('s1');
  });

  it('search extracts organic results into a trimmed artifact', () => {
    const r = ACE_SERVICES.search!.extractResult({ organic: [{ title: 'T1' }, { title: 'T2' }] });
    expect(r.artifactKind).toBe('json');
    expect(r.summary).toContain('2 results');
  });

  it('chat extracts the assistant message text', () => {
    const r = ACE_SERVICES.chat!.extractResult({ choices: [{ message: { content: 'answer' } }] });
    expect(r.artifactKind).toBe('text');
    expect(r.artifactValue).toBe('answer');
  });

  it('getService throws on an unknown id', () => {
    expect(() => getService('nope')).toThrow(/unknown/i);
  });

  it('simulateResult yields a marked stub for every service', () => {
    for (const svc of Object.values(ACE_SERVICES)) {
      const sim = simulateResult(svc, {});
      expect(sim.summary).toContain('SIMULATED');
    }
  });
});
