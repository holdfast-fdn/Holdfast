# ADR-002 — UI & client technology: Telegram-first, web-native companion, no Godot

**Status:** Accepted
**Date:** design session

---

## Context

Holdfast has several surfaces, and they do not all need the same technology. A Godot isometric starter was considered as a possible foundation for the map. The question: what tech should each surface use, and should a game engine (Godot) be adopted?

Governing fact: **every surface that draws is a read-only projection of state. Truth lives in the resolver + Base.** The "what engine for the map" question is therefore small — the engine only draws; it never decides.

## Decision

| Surface | Role | Technology | Critical path? |
|---|---|---|---|
| Telegram/Discord bot | Primary: NL in, GM out | Bot API + Node/TS | Yes |
| GM (world brain) | NL→intent, narration, memory, factions, tick | Hermes Agent | Yes |
| Resolver | Deterministic contest math | Pure function (TS/Python ref) | Yes |
| Settlement / truth | Flux, tile registry, VRF, state root | Solidity + Foundry on Base | Yes |
| Indexer / read API | Chain events + tick inputs → serve UIs | Indexer (TS, Ponder-like) | Later |
| Companion web | Map, holdings, standings, war log (read-only) | **Web-native** (SVG/Canvas; PixiJS if needed; three.js optional later) | Later |
| Client game canvas | Rich canvas interaction (Sky-Strife-like) | Heavy engine (Godot etc.) | **Probably never** |

**Skip Godot for now.** It belongs only to the last row — which is not on the critical path and may never be needed. The primary surface is Telegram (no engine at all); the companion is read-only (better web-native). Godot is a native engine exporting to .exe; its web (WASM) export is heavy for a "companion opened quickly in a browser" and irrelevant to Telegram. Adopting it now would also split focus onto a new stack (GDScript) when the owner is already strong in Node, Foundry/Solidity, and Hermes.

**Companion: 2D first.** Start with a lightweight illustrative/2D map (SVG or Canvas/PixiJS) — matches the "read-only companion opened quickly" nature. A three.js + low-poly-island "hero map" is an optional later upgrade once the core loop is proven, not a starting point.

**Assets:** Kenney.nl (CC0) is the safe commercial source (no attribution required). itch.io packs vary per-license (prefer explicit commercial use; avoid CC-BY-NC). Keep a credits file regardless; avoid trademarked styles. Low-poly GLB/FBX islands render via three.js for real 3D when/if that path is taken.

## Consequences

- A coherent single stack (Node/TS + Foundry + Hermes + web-native) instead of a second engine before the first is proven.
- The Godot isometric starter is kept as a **reference for isometric TileMapLayer arrangement only**, not a foundation. Adopt Godot only if a rich native client canvas later becomes a genuine product goal — a decision deferrable at zero cost today.
- `ui/holdfast-companion-iso.html` is a dependency-free Canvas isometric engine scaffold, ready to receive Kenney sprites (flip `USE_SPRITES`, fill `ASSETS` paths). `ui/holdfast-isles.html` is the chosen illustrative companion direction (floating islands, 2.5D depth).

## Principle preserved

Whatever map engine is chosen (SVG, Canvas, three.js, or — only if ever justified — Godot), it remains a **read-only render of state**. The client must never be a source of truth; it draws what the resolver + Base already decided.
