/** Base class for all AutoAgent errors — carries a machine-readable code. */
export class AutoAgentError extends Error {
  constructor(
    message: string,
    readonly code: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** A configured key/account is missing or malformed. */
export class ConfigError extends AutoAgentError {
  constructor(message: string, cause?: unknown) {
    super(message, 'CONFIG', cause);
  }
}

/** Tool/agent discovery failed (SAP on-chain or Explorer API). */
export class DiscoveryError extends AutoAgentError {
  constructor(message: string, cause?: unknown) {
    super(message, 'DISCOVERY', cause);
  }
}

/** A payment/settlement step failed (x402 or escrow). */
export class PaymentError extends AutoAgentError {
  constructor(message: string, cause?: unknown) {
    super(message, 'PAYMENT', cause);
  }
}

/** A spend guardrail would be exceeded — the agent refuses to pay. */
export class GuardrailError extends AutoAgentError {
  constructor(message: string, cause?: unknown) {
    super(message, 'GUARDRAIL', cause);
  }
}

/** A workflow step the engine could not resolve or that failed at runtime. */
export class WorkflowError extends AutoAgentError {
  constructor(message: string, cause?: unknown) {
    super(message, 'WORKFLOW', cause);
  }
}
