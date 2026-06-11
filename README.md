# Holdfast

> A persistent on-chain world where a Hermes Agent acts as an autonomous Game Master, with ownership and economy settled trustlessly on Base. Players issue natural-language commands; the chain decides outcomes.

- **World:** *The Sundered Isles* — territories are islands; players contest them.
- **Token:** **Flux** (ERC-20 on Base) — the economic medium.
- **GM:** Hermes Agent (`@HoldfastGM`) — narrates and runs the world; never decides outcomes.
- **Status:** mechanics validated in simulation. Contracts, GM integration, and clients not yet built.

## The one principle everything rests on

> **GM proposes, chain disposes.** The GM is an LLM — non-deterministic. It NEVER decides ownership, balances, or contest outcomes. A deterministic resolver does, settled on Base. This holds recursively at every layer (see ADR-001).

## Read order for a new contributor

1. `CLAUDE.md` — how to work in this repo (operational rules).
2. `docs/MEMORY.md` — the full decision history and rationale ("why").
3. `docs/WHITEPAPER.md` — public-facing design & economics.
4. `docs/ROADMAP.md` — phased build plan (low → high risk).
5. `docs/PLAN.md` — immediate next actions.
6. `docs/adr/` — architecture decision records (scaling; UI/tech).

## Layout

```
holdfast/
├── README.md
├── CLAUDE.md                 # operational guide for Claude Code
├── docs/
│   ├── MEMORY.md             # full decision history — READ THIS
│   ├── WHITEPAPER.md         # design & economics
│   ├── ROADMAP.md            # phased plan
│   ├── PLAN.md               # immediate actions
│   └── adr/
│       ├── ADR-001-scaling-model.md     # independent continents (scale-out)
│       └── ADR-002-ui-tech.md           # Telegram-first, web-native, skip Godot
├── sim/
│   ├── resolver.py           # PURE-FUNCTION contest math — the spec, TESTED
│   └── world_sim.py          # multi-tick world simulation
├── brand/                    # v2 "The Herald" identity
│   ├── holdfast-logo.jpg     # master logo — the Winged Anchor (pixel emblem)
│   ├── holdfast-brand.html   # brand system sheet
│   ├── holdfast-mark.svg     # vector glyph for small sizes
│   ├── holdfast-wordmark.svg
│   └── flux-token.svg        # token icon — the Winged Drachma
└── ui/
    ├── holdfast-telegram.html        # PRIMARY surface: NL + GM chat (interactive)
    ├── holdfast-isles.html           # web companion: illustrative island map (read-only)
    ├── holdfast-dashboard.html       # web companion: immersive HUD variant
    ├── holdfast-companion-iso.html   # isometric map engine (Kenney-asset ready)
    └── holdfast-preview.html         # early interactive web preview (archived)
```

## Stack

Node/TS bot · Hermes Agent (GM) · resolver (Python ref → Solidity) · Foundry + Solidity on **Base** · indexer · web-native frontend (SVG/Canvas now, three.js optional later). **No Godot** (see ADR-002).

## Legal

Token mechanics with yield/rewards may carry securities/commodity implications by jurisdiction (incl. Indonesia — Bappebti/OJK). Not legal advice; engage counsel before any token launch.
