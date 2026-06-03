import { describe, expect, it } from 'vitest';
import { resolveTemplates } from './template';

const scope = {
  steps: { search: { organic: [{ title: 'A' }], count: 3 }, plan: { text: 'do X' } },
  state: { topic: 'Solana x402' },
  env: { FOO: 'bar' },
};

describe('resolveTemplates', () => {
  it('interpolates references inside strings', () => {
    expect(resolveTemplates('topic: ${state.topic}', scope)).toBe('topic: Solana x402');
  });

  it('preserves type for a whole-string reference', () => {
    const out = resolveTemplates('${steps.search.organic}', scope) as unknown[];
    expect(Array.isArray(out)).toBe(true);
    expect(out).toHaveLength(1);
  });

  it('stringifies objects when embedded in a larger string', () => {
    const out = resolveTemplates('results=${steps.search.organic}', scope) as string;
    expect(out).toContain('results=[');
    expect(out).toContain('"title":"A"');
  });

  it('resolves env and nested step paths', () => {
    expect(resolveTemplates('${env.FOO}/${steps.plan.text}', scope)).toBe('bar/do X');
  });

  it('replaces unknown references with empty string', () => {
    expect(resolveTemplates('x=${steps.missing.field}', scope)).toBe('x=');
  });

  it('recurses into objects and arrays', () => {
    const out = resolveTemplates({ a: '${state.topic}', b: ['${env.FOO}'] }, scope) as any;
    expect(out.a).toBe('Solana x402');
    expect(out.b[0]).toBe('bar');
  });

  it('leaves non-string scalars untouched', () => {
    expect(resolveTemplates({ n: 42, ok: true }, scope)).toEqual({ n: 42, ok: true });
  });
});
