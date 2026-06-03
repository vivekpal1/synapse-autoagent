import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { SAP_GLOBAL_REGISTRY, SAP_PROGRAM_ID } from '@autoagent/config';
import { ConfigError } from '@autoagent/core';

/**
 * SAP mainnet agent registration.
 *
 * The published `@oobe-protocol-labs/synapse-sap-sdk@0.19.8` has a broken dual
 * package: it is `"type": "module"` but its `require`-condition files are CJS with
 * extensionless `require('./constants')` calls, and its ESM barrel has a circular
 * `PROGRAM_ID` re-export that esbuild/tsx rejects. So importing the package ROOT
 * fails under both Node-ESM and tsx.
 *
 * The robust path (verified on this machine): the `./instructions` subpath loads
 * cleanly, exporting `AgentModule`. We build the `register_agent` instruction with
 * it + an Anchor `Program` constructed from the SDK's bundled IDL (read off disk),
 * derive the PDAs ourselves from the documented seeds, and send the tx directly.
 * This never touches the broken barrel.
 */
export interface RegisterCapability {
  id: string; // e.g. 'acedata:chat'
  protocolId: string; // e.g. 'acedata'
  version: string; // e.g. '1.0.0'
  description?: string;
}

export interface RegisterAgentParams {
  name: string;
  description: string;
  capabilities: RegisterCapability[];
  protocols: string[];
  x402Endpoint: string;
  agentId?: string | null;
  agentUri?: string | null;
}

export interface RegisterResult {
  signature: string;
  agentPda: string;
  wallet: string;
}

export interface SapClientProbe {
  instructionsOk: boolean;
  hasAgentModule: boolean;
  idlFound: boolean;
  idlVersion?: string;
  error?: string;
}

const SAP_SDK = '@oobe-protocol-labs/synapse-sap-sdk';

/** Read the SDK's bundled IDL JSON off disk (the package exports map blocks importing it). */
function loadIdl(): any {
  const req = createRequire(import.meta.url);
  // './instructions' is an allowed export and resolves to dist/cjs/instructions/index.js.
  const instrEntry = req.resolve(`${SAP_SDK}/instructions`);
  const idlPath = join(dirname(instrEntry), '..', 'idl', 'synapse_agent_sap.json');
  return JSON.parse(readFileSync(idlPath, 'utf8'));
}

/** Build an Anchor Program for the SAP program from the bundled IDL (Anchor 0.30, reads idl.address). */
async function buildProgram(keypair: Keypair, connection: Connection): Promise<any> {
  const anchor: any = await import('@coral-xyz/anchor');
  const idl = loadIdl();
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(keypair), {
    commitment: 'confirmed',
  });
  return new anchor.Program(idl, provider);
}

/** Derive the agent + agent-stats PDAs (seeds: 'sap_agent', 'sap_stats'). */
export function deriveAgentPdas(wallet: PublicKey): { agentPda: PublicKey; statsPda: PublicKey } {
  const program = new PublicKey(SAP_PROGRAM_ID);
  const [agentPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('sap_agent'), wallet.toBuffer()],
    program,
  );
  const [statsPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('sap_stats'), agentPda.toBuffer()],
    program,
  );
  return { agentPda, statsPda };
}

/** Build the register_agent instruction (offline — no network). */
async function buildRegisterIx(
  keypair: Keypair,
  connection: Connection,
  params: RegisterAgentParams,
): Promise<{ ix: any; agentPda: PublicKey }> {
  // Hard SDK limit (validate BEFORE loading the SDK): anchor 0.30.1's borsh coder throws
  // "indeterminate span" encoding a vec<Capability> with ≥2 elements. Register ONE
  // representative capability; advertise the rest via the `protocols` array + x402 endpoint.
  if (params.capabilities.length > 1) {
    throw new ConfigError(
      `SAP register supports a single on-chain capability (got ${params.capabilities.length}). ` +
        'Pass one representative capability; advertise others via `protocols`.',
    );
  }

  const instr: any = await import(`${SAP_SDK}/instructions`);
  if (typeof instr.AgentModule !== 'function') {
    throw new ConfigError('SAP SDK /instructions did not export AgentModule — check the installed version.');
  }
  const program = await buildProgram(keypair, connection);
  const { agentPda, statsPda } = deriveAgentPdas(keypair.publicKey);

  const agentModule = new instr.AgentModule(program);
  const ix = await agentModule.registerAgent({
    signer: keypair,
    wallet: keypair.publicKey,
    agent: agentPda,
    agentStats: statsPda,
    globalRegistry: new PublicKey(SAP_GLOBAL_REGISTRY),
    name: params.name,
    description: params.description,
    capabilities: params.capabilities.map((c) => ({
      id: c.id,
      // The SAP IDL coder (anchor 0.30.1 + buffer-layout) throws "indeterminate span"
      // when all three optional Capability fields are Some at once. We keep protocol_id
      // + version (the discovery-relevant metadata) and drop the cosmetic description.
      description: null,
      protocol_id: c.protocolId,
      version: c.version,
    })),
    pricing: [],
    protocols: params.protocols,
    agentId: params.agentId ?? null,
    agentUri: params.agentUri ?? null,
    x402Endpoint: params.x402Endpoint,
  });
  return { ix, agentPda };
}

/** Inspect whether the SAP SDK can be loaded the way registration needs. */
export async function probeSapSdk(): Promise<SapClientProbe> {
  try {
    const instr: any = await import(`${SAP_SDK}/instructions`);
    let idlFound = false;
    let idlVersion: string | undefined;
    try {
      const idl = loadIdl();
      idlFound = true;
      idlVersion = idl?.metadata?.version;
    } catch {
      /* idl not found */
    }
    return {
      instructionsOk: true,
      hasAgentModule: typeof instr.AgentModule === 'function',
      idlFound,
      idlVersion,
    };
  } catch (err) {
    return { instructionsOk: false, hasAgentModule: false, idlFound: false, error: (err as Error).message };
  }
}

/** Build-only (no send) — used by tests/preflight to validate the whole chain offline. */
export async function dryBuildRegisterIx(
  keypair: Keypair,
  rpcUrl: string,
  params: RegisterAgentParams,
): Promise<{ agentPda: string; programDataLen: number }> {
  const connection = new Connection(rpcUrl, 'confirmed');
  const { ix, agentPda } = await buildRegisterIx(keypair, connection, params);
  return { agentPda: agentPda.toBase58(), programDataLen: ix.data?.length ?? 0 };
}

/**
 * Register the agent on SAP mainnet. Costs ~0.1 SOL. Check {@link probeSapSdk} and
 * existing registration (via ExplorerClient.getAgent) before calling.
 */
export async function registerAgent(
  keypair: Keypair,
  rpcUrl: string,
  params: RegisterAgentParams,
): Promise<RegisterResult> {
  const connection = new Connection(rpcUrl, 'confirmed');
  const { ix, agentPda } = await buildRegisterIx(keypair, connection, params);

  // Send + confirm over HTTP only. Synapse gateway RPCs may not expose a WebSocket,
  // which makes sendAndConfirmTransaction's WS-based confirmation hang ("ws error 404").
  const tx = new Transaction().add(ix);
  tx.feePayer = keypair.publicKey;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.sign(keypair);
  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 5,
  });
  await confirmByPolling(connection, signature, lastValidBlockHeight);
  return { signature, agentPda: agentPda.toBase58(), wallet: keypair.publicKey.toBase58() };
}

/** Confirm a signature by polling getSignatureStatuses — no WebSocket required. */
async function confirmByPolling(
  connection: Connection,
  signature: string,
  lastValidBlockHeight: number,
  timeoutMs = 90_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const st = value[0];
    if (st) {
      if (st.err) throw new Error(`register tx failed on-chain: ${JSON.stringify(st.err)}`);
      if (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized') return;
    }
    const height = await connection.getBlockHeight('confirmed').catch(() => 0);
    if (height > lastValidBlockHeight) throw new Error('register tx expired (blockhash no longer valid).');
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(`register tx not confirmed within ${timeoutMs}ms (sig ${signature}).`);
}
