# How to play Holdfast

*A persistent on-chain world. Talk to the Herald on Telegram
([@holdfast_gmbot](https://t.me/holdfast_gmbot)); the chain decides every
outcome.*

## 🎯 The goal

**Take isles and hold them.** Every isle you hold yields **Flux** to you each
tick — the more ground you hold, the richer you grow. Players, AI factions, and
the wilds contest the same isles, tick after tick.

## 💰 Flux — your war chest

Flux is the game's currency. You start with some; you earn more from the isles
you hold. You **commit Flux to attack** an isle:

- **Win** → you take the isle, plus a share of its garrison (spoils).
- **Lose** → most of your committed Flux **burns**; a portion goes to the
  defender.

So Flux is both your army and your treasury. Spend it to expand; hold isles to
refill it. (The economy is designed so total Flux **shrinks** while the world is
active — winning ground, not hoarding, is how you grow.)

Tap **🔑 My Wallet** (or `/wallet`) anytime to see your Flux balance and how
many isles you hold.

## 🕹️ How to play

Speak an order in plain words — **isles are numbered**, so name the tile:

```
attack tile 5 with 120 flux
raid tile 3 with 80
take tile 7 using 60
```

When you order, the Herald replies with **your chance to take it**. Orders lock
at **tick close**; then the world resolves on-chain and the Herald reports what
changed — even while you slept.

Commands:
- `/play` — the goal, Flux, and how odds work
- `/wallet` — your Flux balance & isles held
- `/orders` — what you have queued for the next tick
- `/map` — the live map: owners, garrisons, and **tile numbers**

## 🎲 How a contest works (and "will 120 be enough?")

Each isle has a **garrison** (the Flux defending it). Your chance to take it
depends on your commit vs that garrison — but **defenders have the edge**, so
it's not a fair coin flip. The exact math:

```
chance = √(your commit) / ( √(your commit) + 1.3 × √(garrison) )
```

For an isle holding **60 Flux**:

| You commit | Your chance |
|---:|---:|
| 60 (match) | ~43% |
| 120 (2×) | ~52% |
| 240 (4×) | ~60% |
| 400 (≈7×) | ~66% |

Rule of thumb: **matching the garrison loses more often than it wins.** Commit
roughly **2× to coin-flip it**, and several times the garrison for a confident
strike. The Herald always shows you the exact % before the tick — check the map
for each isle's garrison first.

> Why the √ and the 1.3? Diminishing returns (√) keep whales from buying
> certain wins — a 10× commit is not a 10× advantage — so upsets stay possible.
> The 1.3 is the defender's edge: taking ground costs more than holding it.

## 🗺️ Watch the world

The live map shows every isle's **owner, garrison, and number**, plus the war
log — read straight from the chain. Open it from `/map`, or at
[holdfast.foundation](https://holdfast.foundation).

> Testnet prototype: throwaway wallets, no real value, no token offering. The
> chain — not the Herald, not anyone — decides every outcome.
