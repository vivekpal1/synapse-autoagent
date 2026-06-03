import { EXPLORER_API_BASE } from '@autoagent/config';
import { DiscoveryError, type DiscoveredTool } from '@autoagent/core';

/** Loosely-typed Explorer agent record (the API mixes enriched/unenriched rows). */
export interface ExplorerAgent {
  pda?: string;
  wallet: string;
  name?: string;
  description?: string;
  x402Endpoint?: string;
  isActive?: boolean;
  reputationScore?: number;
  totalCallsServed?: string;
  capabilities?: string[];
  [k: string]: unknown;
}

export interface ExplorerTx {
  signature: string;
  slot?: number;
  blockTime?: number;
  fee?: number;
  programs?: string[];
  signer?: string | null;
  [k: string]: unknown;
}

/**
 * Read-only client over the public Synapse Explorer REST API (no key needed for
 * reads). Used for tool/agent discovery and — crucially — as the public proof
 * surface: anyone can verify your agent and its activity here.
 *
 * Verified-live endpoints (2026-06-02). `/metrics` was flaky and some tx rows are
 * unenriched, so every call degrades gracefully rather than throwing mid-workflow.
 */
export class ExplorerClient {
  constructor(private readonly base: string = EXPLORER_API_BASE) {}

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`, { headers: { accept: 'application/json' } });
    if (!res.ok) {
      throw new DiscoveryError(`Explorer GET ${path} failed: ${res.status}`);
    }
    return (await res.json()) as T;
  }

  /** Fetch one agent by wallet. Returns null if not found. */
  async getAgent(wallet: string): Promise<ExplorerAgent | null> {
    try {
      return await this.get<ExplorerAgent>(`/agents/${wallet}`);
    } catch {
      return null;
    }
  }

  /** Search agents, optionally filtered by capability/protocol. */
  async listAgents(opts: { capability?: string; protocol?: string; limit?: number } = {}): Promise<ExplorerAgent[]> {
    const q = new URLSearchParams();
    if (opts.capability) q.set('capability', opts.capability);
    if (opts.protocol) q.set('protocol', opts.protocol);
    q.set('limit', String(opts.limit ?? 20));
    const data = await this.get<ExplorerAgent[] | { agents: ExplorerAgent[] }>(`/agents?${q}`);
    return Array.isArray(data) ? data : (data.agents ?? []);
  }

  /** Recent SAP program transactions — proof-of-activity feed. */
  async recentTransactions(limit = 50): Promise<ExplorerTx[]> {
    const data = await this.get<ExplorerTx[] | { transactions: ExplorerTx[] }>(`/transactions?limit=${limit}`);
    return Array.isArray(data) ? data : (data.transactions ?? []);
  }

  /** Discover agents exposing a capability, normalized to DiscoveredTool. */
  async discoverTools(opts: { capability?: string; protocol?: string; limit?: number } = {}): Promise<DiscoveredTool[]> {
    const agents = await this.listAgents(opts);
    const tools: DiscoveredTool[] = [];
    for (const a of agents) {
      for (const cap of a.capabilities ?? []) {
        tools.push({
          agentWallet: a.wallet,
          agentName: a.name ?? a.wallet.slice(0, 8),
          toolName: cap,
          x402Endpoint: a.x402Endpoint,
          source: 'explorer',
        });
      }
    }
    return tools;
  }
}
