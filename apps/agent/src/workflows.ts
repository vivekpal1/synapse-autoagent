import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { validateWorkflow, WorkflowError, type WorkflowDef } from '@autoagent/core';

const EXTS = new Set(['.yaml', '.yml', '.json']);

/** Load and validate every workflow definition in a directory (YAML or JSON). */
export function loadWorkflows(dir: string): WorkflowDef[] {
  const root = resolve(dir);
  if (!existsSync(root)) return [];
  const defs: WorkflowDef[] = [];
  for (const f of readdirSync(root)) {
    if (!EXTS.has(extname(f))) continue;
    const raw = readFileSync(join(root, f), 'utf8');
    let parsed: unknown;
    try {
      parsed = extname(f) === '.json' ? JSON.parse(raw) : parseYaml(raw);
    } catch (err) {
      throw new WorkflowError(`Failed to parse workflow ${f}: ${(err as Error).message}`);
    }
    const wf = parsed as WorkflowDef;
    validateWorkflow(wf);
    defs.push(wf);
  }
  return defs.sort((a, b) => a.name.localeCompare(b.name));
}

/** Find one workflow by exact or case-insensitive name. */
export function findWorkflow(dir: string, name: string): WorkflowDef | undefined {
  const all = loadWorkflows(dir);
  return (
    all.find((w) => w.name === name) ??
    all.find((w) => w.name.toLowerCase() === name.toLowerCase())
  );
}
