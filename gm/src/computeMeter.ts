/**
 * Compute meter — the "meter GM compute in Flux" sink (CLAUDE.md).
 *
 * At scale, LLM compute is the dominant variable cost, and emission (tile
 * yield) must never exceed sink (burn + GM-compute fee) or the economy is a
 * slow ponzi. This meter measures the operator-borne GM compute — every
 * Hermes call (NL parsing, narration, server-side factions) flows through one
 * usage callback — and prices it in Flux so each tick can check emission≤sink.
 *
 * Note on the public arena: EXTERNAL agents run their OWN Hermes off-server,
 * so their reasoning costs the operator nothing — they only submit a signed
 * intent (a sig-verify + a read). This meter therefore captures exactly the
 * compute the operator pays for, which is what the sink must cover.
 *
 * This is metering + the balance guard. Realising the sink on-chain (actually
 * burning the metered Flux) is a ComputeSink — see makeComputeSink in chain.ts.
 */

/**
 * On-chain realisation of the compute sink: burn the metered Flux so supply
 * genuinely drops (an auditable Burn event), making "emission≤sink" real and
 * not just logged. Best-effort by contract — it runs AFTER settlement and must
 * never reject a settled tick. Testnet funding model: an operator treasury
 * wallet holds Flux and burns from it (chosen 2026-06-13). Where that Flux
 * comes from economically (a protocol skim) is a later, contract-level concern.
 */
export interface ComputeSink {
  /** burn up to `amountWad` Flux from the treasury. Returns the realised burn
   *  (and tx hash), or null if nothing could be burned (e.g. empty treasury). */
  burn(amountWad: bigint): Promise<{ hash: string; burned: bigint } | null>;
  /** lifetime Flux actually burned for compute (WAD) */
  totalBurned(): bigint;
}

export class ComputeMeter {
  private tickTokens = 0;
  private totalTokens = 0;

  /** @param fluxPer1kTokens price of GM compute, in Flux per 1,000 tokens */
  constructor(private readonly fluxPer1kTokens: number) {}

  /** record token usage from one Hermes call (no-op on missing/zero usage) */
  record(tokens: number): void {
    if (tokens > 0) {
      this.tickTokens += tokens;
      this.totalTokens += tokens;
    }
  }

  /** tokens metered since the last reset (this tick) */
  tickTokensUsed(): number {
    return this.tickTokens;
  }

  /** Flux cost of compute since the last reset (this tick) */
  tickFlux(): number {
    return (this.tickTokens / 1000) * this.fluxPer1kTokens;
  }

  /** lifetime Flux cost of GM compute */
  totalFlux(): number {
    return (this.totalTokens / 1000) * this.fluxPer1kTokens;
  }

  /** start a fresh tick window (lifetime totals are kept) */
  reset(): void {
    this.tickTokens = 0;
  }
}
