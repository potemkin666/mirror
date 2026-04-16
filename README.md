# The Mirror

> *A portrait assembled from the involuntary confessions of a browser.*

An arthouse interactive website that reflects the visitor back to themselves as a fractured apparition made of glass shards, static, light, and motion. The experience is not a utility — it is an interactive art piece. The core idea is that a person's browser, device traits, interaction patterns, and environmental signals involuntarily describe them before they ever type a word.

---

## Live demo

Hosted on GitHub Pages: **[potemkin666.github.io/mirror](https://potemkin666.github.io/mirror)**

---

## Concept

The Mirror opens into a dark, reflective chamber. At first the figure is incomplete — abstract, mostly made of drifting shards and static. As ambient browser and device information is inferred locally, the figure becomes more defined. As the visitor interacts, the figure changes in posture, shape, texture, and intensity. It never fully settles. It always feels like the mirror is interpreting rather than simply copying.

### Aesthetic target

- Black glass, silver, dim light, pale reflections, static haze, subtle text fragments  
- Sacred / arthouse / uncanny / haunted mirror  
- Elegant and oppressive — not corny, not cyberpunk, not terminal

---

## Features

### Environment signals (read once on load)

| Signal | Artistic effect |
|---|---|
| Browser family | Shard tessellation geometry bias |
| Operating system | Silhouette skeleton lateral shift |
| Timezone / hour | Light angle + colour warmth (cold silver at night, amber at noon) |
| Language / locale | Reserved for future text fragment weighting |
| Screen size + pixel ratio | Shard density and resolution |
| Touch capability | Reduced shard count on mobile for performance |
| Prefers-reduced-motion | Disables CSS animations |
| localStorage / cookie availability | Portrait stability; private mode makes the mirror unstable |
| Repeat visitor state | Portrait begins more assembled; prior session scars inherited |

### Interaction reflection

| Behaviour | Visual response |
|---|---|
| Cursor speed | Jitter — fast movement fragments the shards |
| Lingering cursor | Glowing wound / hover point deposited on the surface |
| Scroll velocity | Portrait sinks deeper into the chamber |
| Typing | Pulse / heartbeat rhythm in the figure |
| Deletions / Backspace | Crack pattern builds on the portrait (damage) |
| Idle / stillness | Autonomous motion — the figure moves on its own |
| Rapid action switching | Split / doubled ghost form |
| Window resize | Shard geometry rebuilt; slight injury |

### Memory (localStorage)

- Minimal poetic profile saved between sessions: visit count, convergence level, crack pattern, deletion ratio, timestamps.  
- On return, the portrait begins more assembled and inherits prior damage.  
- Use **◌ forget** to wipe the memory. The mirror acknowledges this.

### Text fragments

Sparse, italic text appears in the margins. Tone examples:

> *"You arrived in fragments."*  
> *"You erase faster than you speak."*  
> *"It has been watching longer than you have been watching it."*  
> *"The glass remembers what your browser admits."*

Text selection is influenced by: return visit status, idle time, deletion ratio, scroll, hover persistence, and session phase.

### Audio

Procedural ambient drone:

- Low glass-hum oscillator (58 Hz, sine)  
- Bandpass-filtered white noise crackle  
- Both fade in gently on awakening  
- Toggle with **◎ mute** / **◎ unmute**

---

## Experience flow

1. **Landing** — dark chamber, abstract shard field, *"move to begin"* invitation  
2. **Observation** (0–35 s) — local traits gradually assemble the portrait; ambient text begins  
3. **Interaction** (35–100 s) — behaviour alters the form in real time  
4. **Recognition** (100 s+) — the mirror feels like it has learned the visitor; recognition-phase text appears  
5. **Exit** — session data saved to memory before unload

---

## Controls

All controls are hidden until the visitor awakens. They appear in the bottom-right corner **on hover** as tiny, barely-there buttons:

| Button | Action |
|---|---|
| **◈ enter** | Awaken the mirror immediately |
| **◎ mute** | Toggle ambient audio |
| **◌ forget** | Clear all localStorage memory |
| **⊙ reveal** | Toggle diagnostics panel (shows raw signal & portrait values) |

---

## Code architecture

```
index.html      — structure: canvas, text overlay, landing veil, controls, diagnostics
styles.css      — dark glass aesthetic, text fragment transitions, custom cursor
script.js       — all logic (see module list below)
```

### Modules in `script.js`

| Function | Responsibility |
|---|---|
| `collectEnvironment()` | Reads browser/device/locale/timezone/storage signals once at startup |
| `trackInteraction()` | Wires event listeners; updates `state.interaction` continuously |
| `buildVisitorProfile()` | Maps raw signals to artistic portrait parameters (light angle, shard bias, skeleton shift, return-visit boost) |
| `updatePortraitState(dt)` | Evolves portrait parameters each frame: convergence, jitter, crack, pulse, sinkDepth, autonomy, split, eyeIntensity |
| `renderMirror()` | Draws one canvas frame: shards → portrait glow → eyes → hover wounds → noise → split ghost |
| `generateTextFragments()` | Selects text pool based on current state; emits poetic fragment |
| `saveMirrorMemory()` | Persists session scar to localStorage on unload |
| `clearMirrorMemory()` | Wipes localStorage; emits acknowledgement fragment |

### Artistic mapping locations

- **Browser → geometry**: `buildVisitorProfile()` — `browserBias` object  
- **OS → skeleton shift**: `buildVisitorProfile()` — `osShift` object  
- **Timezone → light**: `buildVisitorProfile()` — `lightAngle` / `lightWarm` formula  
- **Cursor → jitter**: `updatePortraitState()` — `cursorSmooth` → `p.jitter`  
- **Typing → pulse**: `updatePortraitState()` — `sinceType` → `p.pulse`  
- **Deletions → crack**: `updatePortraitState()` — `delRatio` → `p.crack`  
- **Silhouette shape**: `portraitDensity()` — head, neck, shoulders, chest, torso ovals  
- **Text pool selection**: `generateTextFragments()` — if/else priority chain  

---

## GitHub Pages setup

1. Push to `main` branch  
2. Go to **Settings → Pages → Source**: select `main` branch, root `/`  
3. Save — the site will be available at `https://<username>.github.io/<repo>`

No build step required. The site is pure static HTML / CSS / JS.

---

## Design rules observed

- No *"accessing your data…"* fake hacking sequence  
- No terminal spam or green Matrix text  
- No explicit labels like *"Firefox detected"*  
- No personality-test language or mental-health labelling  
- No gamification  
- Degrades gracefully if localStorage, AudioContext, or motion APIs are unavailable

---

## Future directions

- More elaborate portrait rendering (Three.js WebGL layer for true glass refraction)  
- Multiple mirror temperaments: *flattering / cruel / silent / devotional*  
- Richer memory: per-scar visual replay  
- Optional backend for IP / referrer interpretation  
- Session portrait export (canvas → PNG download)  
- Touch-specific visual language (finger trails as wounds)

