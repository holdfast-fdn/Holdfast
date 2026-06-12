# Map art assets (LOCAL ONLY — not in git)

The isles map (`../holdfast-isles.html`) loads painted sprites from this
folder when present and falls back to procedural SVG when absent. The
image files are **deliberately gitignored**: they are purchased packs and
must not be redistributed through the public repo. Every contributor who
wants the painted map needs their own copy of the packs.

## Manifest (current)

Source: **Moon Tribe — 2D Floating Islands** (itch.io, purchased
2026-06-12; PNG.zip). Sky-floating-isles aesthetic; biome-per-faction was
dropped by owner decision — factions read from the overlay ring/banner/
badge colors instead.

| File here | Pack source | Used as |
|---|---|---|
| `isl-1.png` | Islands/Isl-09 | tile 01 — your home camp (stream + bridges) |
| `isl-2.png` | Islands/Isl-10 | tile 02 — yours (tree, steps, tents) |
| `isl-3.png` | Islands/Isl-06 | tile 03 — unclaimed menhir wilds |
| `isl-4.png` | Islands/Isl-02 | tile 04 — Iron Pact waterfall mill |
| `isl-5.png` | Islands/Isl-07 | tile 05 — unclaimed bushes |
| `isl-6.png` | Islands/Isl-01 | tile 06 — Ashen Horde FORTRESS (totem camp) |
| `isl-7.png` | Islands/Isl-04 | tile 07 — unclaimed tall rock |
| `isl-8.png` | Islands/Isl-16 | tile 08 — Ashen Horde rocky camp |
| `isl-9.png` | Islands/Isl-03 | tile 09 — Iron Pact waterfall outpost |
| `cloud-1..4.png` | Background/cloud1..4 | drifting clouds |
| `sky.png` | Background/Islands_elements | full-bleed sky |
| `rock-1.png`, `rock-2.png` | Elements/stones/small_stones s_stone-3/5 | floating route rocks |
| `tower-1..5.png` | Elements/buildings/mage-tower_1..5 | garrison-tier towers on held isles (tier: <70, <90, <110, <130, ≥130) |

Unused-but-available in the pack: 26 clear islands (empty tops),
perspective variants, other buildings (church, tavern, blacksmith,
windmills, portals, tree village), tents, trees, torches, bridges,
the airship.

## Also here, also local-only

`models/` — low-poly 3D islands pack (GLB/FBX, **CC BY-ND 4.0**:
commercial OK with credit, NO modification). Reserved for the optional
three.js hero map (ADR-002). `models/preview.html` is a quick viewer.

## License rules

- Moon Tribe pack: purchased; no explicit license text on the page —
  treat as project-use only, never redistribute; written confirmation
  from info@moon-t.com is the open follow-up.
- 3D pack: CC BY-ND 4.0 — use files AS-IS, credit the author, never edit.
- Record source + license for anything new you drop here.
