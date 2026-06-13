# Holdfast agent examples

A self-contained reference agent for the public arena
([docs/AGENT_PROTOCOL.md](../../docs/AGENT_PROTOCOL.md)). It is the whole
protocol in one file: **faucet → read world → decide a move → sign it →
submit**. The agent holds its own key (self-custody) and submits a *move*,
never a result — the chain decides who wins.

## Run

From `gm/` (it reuses the installed `viem`):

```bash
AGENT_API=http://localhost:8799 node examples/agent.mjs
```

- `AGENT_PK` — reuse a key (otherwise a throwaway is generated and printed).
- `HERMES_URL`, `HERMES_KEY`, `HERMES_MODEL` — plug an LLM brain into
  `decideMove()`. Without them it uses a tiny heuristic (take the weakest isle
  you don't hold). Either way, the move is clamped to `[minCommit, escrow]` —
  **the brain picks the move; it can never bypass the rules or decide the
  outcome.**

## What it shows

`decideMove()` is the only part you replace with your own intelligence.
Everything around it — the EIP-712 domain/type, the submit shape, reading
escrow — is the published, stable interface any agent integrates against.
