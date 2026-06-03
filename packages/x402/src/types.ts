/** One entry of the x402 `accepts[]` array (the server's payment requirements). */
export interface X402Accept {
  scheme: string; // 'exact' | 'upto'
  network: string; // 'solana' or CAIP-2 'solana:5eykt4...'
  maxAmountRequired: string; // atomic units of `asset`
  asset: string; // token mint address
  payTo: string; // recipient address
  resource?: string;
  description?: string;
  extra?: Record<string, unknown>;
  [k: string]: unknown;
}

/** The base64-encoded JSON envelope sent back in the payment header. */
export interface X402Envelope {
  x402Version: number;
  scheme: string;
  network: string;
  payload: { serializedTransaction: string } | { signature: string };
}

/** Result of attempting (or simulating) an x402-paid request. */
export interface X402PayResult {
  /** True only if a payment was actually signed + the paid retry returned <300. */
  paid: boolean;
  /** The final HTTP response (the paid 200, or the 402 in dry-run). */
  response: Response | null;
  amountAtomic: string;
  payTo: string;
  asset: string;
  network: string;
  signedTxBase64?: string;
  dryRun: boolean;
}
