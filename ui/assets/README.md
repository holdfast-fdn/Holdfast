# Map sprites (drop zone)

Put island art here and `holdfast-isles.html` picks it up automatically —
no code changes. Missing files fall back to the procedural SVG art.

| File | Used for |
|---|---|
| `island-lush.png`    | player isles (green) |
| `island-volcano.png` | Ashen Horde isles |
| `island-snow.png`    | Iron Pact isles |
| `island-desert.png`  | unclaimed isles |
| `stone.png`          | (optional) stepping-stone rocks on routes |
| `sea.jpg` / `sea.png`| (optional) full-bleed water background |

Requirements: PNG with TRANSPARENT background per island, >= 600 px wide,
3/4 top-down angle. Baked-in foam/shadow is fine (the procedural foam is
skipped when a sprite is present).

License note: record the source + license of every file you drop here
(Freepik free tier requires attribution; see chat notes / docs/MEMORY.md).
