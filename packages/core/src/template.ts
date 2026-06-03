/**
 * Minimal, dependency-free `${...}` template resolution for workflow step params.
 *
 * Supported references inside a string value:
 *   ${steps.<stepId>.<path>}  — output of an earlier step
 *   ${state.<path>}           — anything on the run blackboard
 *   ${env.<KEY>}              — a process env var
 *
 * If a string is EXACTLY one reference (e.g. "${steps.search.organic}"), the
 * resolved value is returned with its original type (array/object/number).
 * Otherwise references are stringified and interpolated.
 */
export interface TemplateScope {
  steps: Record<string, unknown>;
  state: Record<string, unknown>;
  env: Record<string, string | undefined>;
}

const REF = /\$\{([^}]+)\}/g;
const WHOLE = /^\$\{([^}]+)\}$/;

function getByPath(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    if (Array.isArray(acc)) return acc[Number(key)];
    return (acc as Record<string, unknown>)[key];
  }, root);
}

function resolveRef(ref: string, scope: TemplateScope): unknown {
  const dot = ref.indexOf('.');
  const head = dot === -1 ? ref : ref.slice(0, dot);
  const rest = dot === -1 ? '' : ref.slice(dot + 1);
  switch (head) {
    case 'steps':
      return getByPath(scope.steps, rest);
    case 'state':
      return getByPath(scope.state, rest);
    case 'env':
      return scope.env[rest];
    default:
      return undefined;
  }
}

function resolveString(input: string, scope: TemplateScope): unknown {
  const whole = input.match(WHOLE);
  if (whole) return resolveRef(whole[1]!.trim(), scope);
  return input.replace(REF, (_m, ref: string) => {
    const v = resolveRef(ref.trim(), scope);
    if (v == null) return '';
    return typeof v === 'string' ? v : JSON.stringify(v);
  });
}

/** Recursively resolve templates in any params structure. */
export function resolveTemplates<T>(value: T, scope: TemplateScope): T {
  if (typeof value === 'string') return resolveString(value, scope) as T;
  if (Array.isArray(value)) return value.map((v) => resolveTemplates(v, scope)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveTemplates(v, scope);
    return out as T;
  }
  return value;
}
