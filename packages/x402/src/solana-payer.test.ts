import { describe, expect, it } from 'vitest';
import { Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { USDC_MINT_MAINNET } from '@autoagent/config';
import { buildUsdcTransferIx } from './solana-payer';

const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

describe('buildUsdcTransferIx', () => {
  it('builds an SPL TransferChecked to the token program with payer as the signer', async () => {
    const payer = Keypair.generate();
    const payTo = Keypair.generate().publicKey;
    const ix = await buildUsdcTransferIx({
      payer: payer.publicKey,
      payTo,
      mint: new PublicKey(USDC_MINT_MAINNET),
      amount: 95_215n,
      decimals: 6,
    });
    expect(ix).toBeInstanceOf(TransactionInstruction);
    expect(ix.programId.toBase58()).toBe(TOKEN_PROGRAM);
    // TransferChecked discriminator is 12, amount little-endian u64, then decimals.
    expect(ix.data[0]).toBe(12);
    expect(ix.data[ix.data.length - 1]).toBe(6);
    // The owner/authority (payer) must be a signer on the instruction.
    const signer = ix.keys.find((k) => k.isSigner);
    expect(signer?.pubkey.toBase58()).toBe(payer.publicKey.toBase58());
  });

  it('encodes the amount as little-endian u64', async () => {
    const ix = await buildUsdcTransferIx({
      payer: Keypair.generate().publicKey,
      payTo: Keypair.generate().publicKey,
      mint: new PublicKey(USDC_MINT_MAINNET),
      amount: 1n,
      decimals: 6,
    });
    expect(ix.data[1]).toBe(1); // first byte of the u64 amount
    expect(ix.data[2]).toBe(0);
  });
});
