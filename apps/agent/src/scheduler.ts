import type { WorkflowDef } from '@autoagent/core';
import { getLogger } from '@autoagent/core';
import type { Runtime } from './runtime';

/**
 * Drives interval-triggered workflows forever. Each workflow fires on its own
 * `trigger.everyMs` (falling back to the global SCHEDULER_INTERVAL_MS). This is
 * the "trigger" end of the autonomous loop — once started, no human input occurs.
 */
export class Scheduler {
  private timers: NodeJS.Timeout[] = [];
  private running = false;
  private readonly log = getLogger().child({ component: 'scheduler' });

  constructor(private readonly rt: Runtime) {}

  start(workflows: WorkflowDef[]): void {
    const interval = workflows.filter((w) => w.trigger.type === 'interval');
    if (interval.length === 0) {
      this.log.warn('no interval-triggered workflows found; nothing to schedule');
      return;
    }
    this.running = true;
    for (const wf of interval) {
      const everyMs = wf.trigger.everyMs ?? this.rt.env.SCHEDULER_INTERVAL_MS;
      this.log.info({ workflow: wf.name, everyMs }, `scheduled "${wf.name}"`);
      const tick = async (): Promise<void> => {
        if (!this.running) return;
        try {
          await this.rt.engine.run(wf);
        } catch (err) {
          this.log.error({ err: (err as Error).message, workflow: wf.name }, 'run failed');
        }
      };
      void tick(); // fire immediately on start
      this.timers.push(setInterval(() => void tick(), everyMs));
    }
    this.log.info(`scheduler running ${interval.length} workflow(s) — Ctrl+C to stop`);
  }

  stop(): void {
    this.running = false;
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    this.log.info('scheduler stopped');
  }
}
