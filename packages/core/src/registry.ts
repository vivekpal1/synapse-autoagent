import { WorkflowError } from './errors';
import type { StepHandler } from './types';

/**
 * Maps step `kind` strings (as written in workflow YAML) to their handler
 * implementations. The app registers concrete handlers (discover, sentinel-call,
 * acedata-call, ai-synthesize, settle, ...) so the engine itself stays free of
 * any dependency on the integration packages.
 */
export class StepRegistry {
  private readonly handlers = new Map<string, StepHandler>();

  register(kind: string, handler: StepHandler): this {
    if (this.handlers.has(kind)) {
      throw new WorkflowError(`Step kind "${kind}" is already registered.`);
    }
    this.handlers.set(kind, handler);
    return this;
  }

  get(kind: string): StepHandler {
    const h = this.handlers.get(kind);
    if (!h) {
      throw new WorkflowError(
        `Unknown step kind "${kind}". Registered: [${[...this.handlers.keys()].join(', ')}].`,
      );
    }
    return h;
  }

  has(kind: string): boolean {
    return this.handlers.has(kind);
  }

  kinds(): string[] {
    return [...this.handlers.keys()];
  }
}
