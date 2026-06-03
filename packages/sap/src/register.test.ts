import { describe, expect, it } from 'vitest';
import { Keypair } from '@solana/web3.js';
import { deriveAgentPdas, dryBuildRegisterIx } from './register';

describe('SAP registration', () => {
  it('derives agent + stats PDAs deterministically', () => {
    const kp = Keypair.generate();
    const a = deriveAgentPdas(kp.publicKey);
    const b = deriveAgentPdas(kp.publicKey);
    expect(a.agentPda.toBase58()).toBe(b.agentPda.toBase58());
    expect(a.statsPda.toBase58()).toBe(b.statsPda.toBase58());
    expect(a.agentPda.toBase58()).not.toBe(a.statsPda.toBase58());
  });

  it('refuses to build a tx with >1 capability (SAP IDL coder limit)', async () => {
    const kp = Keypair.generate();
    await expect(
      dryBuildRegisterIx(kp, 'https://api.mainnet-beta.solana.com', {
        name: 'x',
        description: 'y',
        capabilities: [
          { id: 'acedata:chat', protocolId: 'acedata', version: '1.0.0' },
          { id: 'acedata:tts', protocolId: 'acedata', version: '1.0.0' },
        ],
        protocols: ['acedata'],
        x402Endpoint: 'https://e/x402',
      }),
    ).rejects.toThrow(/single on-chain capability/i);
  });
});
