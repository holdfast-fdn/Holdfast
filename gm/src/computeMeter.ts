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
 * This is metering + the balance guard. Realising the sink on-chain (burning
 * the metered Flux, or charging it) is the next boundary, not this file.
 */

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
