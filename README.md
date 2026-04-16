# ⊘

> *the seam between what looked and what was looked at dissolved at 58 Hz*

not a mirror.  not a window.  a surface that mistakes your cursor for a confession and your timezone for a wound.

it reads the involuntary signals — browser family, pixel density, deletion ratio, the hour you arrived, whether you have been here before — and from these calculates a portrait that is already wrong about you in exactly the right way.

---

## ◎ the chamber

**[potemkin666.github.io/mirror](https://potemkin666.github.io/mirror)**

you will not find instructions inside.

---

## the figure never finishes assembling

what the glass reads from you without asking:

browser → tessellation geometry.  the way chrome fractures is not the way firefox fractures.  
operating system → lateral skeleton shift.  windows hinges.  mac recedes.  linux distributes strangely.  
timezone and hour → light angle and warmth.  silver at 3 a.m.  amber at noon.  nothing at dusk.  
screen density → edge quality.  high-DPI devices produce hairline fractures.  low-DPI devices produce brutal cuts.  
touch capability → intimacy.  the portrait crowds you on a phone.  it withdraws on a desktop.  
storage → memory.  private browsing produces an amnesiac figure that keeps relearning your shape.  
return visit → prior scars inherited.  the mirror remembers damage you don't remember causing.

what it watches you do:

speed → fragmentation.  lingering → glowing wound deposited on the surface.  
scroll → the figure sinks / breathes / drowns.  typing → heartbeat / jaw tremor / rib flash.  
deletion → crack propagation / self-erasure / stitched mouth.  
stillness → it begins to move on its own.  rapid switching → temporal desynchronisation / doubled ghost.  
resize → geometric injury.  clicks → glass fracture trees.  touch → finger trails scored as wounds.

---

## temperaments

the mirror is not always the same mirror.

**flattering** — converges faster.  softens edges.  light catches more generously.  the figure is kinder than you deserve.  
**cruel** — convergence resisted.  cracks deepen.  autonomous motion becomes predatory.  it memorises damage.  
**silent** — no text fragments.  the figure assembles in absolute quiet.  you watch it watching you with nothing said.  
**devotional** — halo brighter.  ritual geometry more elaborate.  the mirror treats you as an icon.

temperament is chosen from the hour, the deletion ratio, the visit pattern, and something unquantifiable.

---

## memory / scars / replay

each visit deposits a scar: convergence reached, damage taken, words typed, words deleted.

on return the mirror loads every prior scar and can replay them — ghost portraits flickering behind the current one, each a fossil of a previous version of you sitting in front of this screen.

the ◌ forget button erases all of this.  the mirror acknowledges the loss.

---

## the glass refracts

behind the 2D canvas a WebGL layer (Three.js) renders a plane of glass with real refraction — light bends through the surface, specular caustics drift across the portrait, the figure appears to exist behind a physical sheet of dark glass rather than painted onto a flat screen.

the refraction layer responds to convergence, cursor proximity, and temperament.

---

## referrer / origin

if you arrived from somewhere the mirror can read `document.referrer`.  the referring domain subtly alters the portrait — a social media referrer produces a more fractured, performative figure.  a direct visit produces something more private.

an optional backend endpoint (`/api/mirror-env`) can provide IP geolocation and extended origin data.  without the backend everything still works — the mirror simply knows less.

---

## export

**⎙ save** captures the current canvas as a PNG and downloads it.  you can take the portrait with you.  it will not move once saved.

---

## touch

on touch devices fingers leave trails scored into the surface as wounds — not cursor circles but pressure-sensitive drag marks, oily smears, fingerprint burns.  the portrait on a phone is always more intimate and more damaged than the portrait on a desktop.

---

## the interior

```
index.html      — the chamber.  canvas, veil, controls, a webgl layer beneath.
styles.css      — dark glass.  silver dust.  custom cursor.  the weight of the room.
script.js       — everything that watches.  everything that draws.
```

the code is one file because a mirror does not have modules.  it has a surface.

no build step.  no dependencies except Three.js loaded from CDN.  
push to `main`.  GitHub Pages.  the site appears at the address above.

---

## what it will not do

it will not say *"accessing your data"*.  it will not print green terminal text.  it will not call you an introvert.  it will not gamify you.  it will not explain itself inside the experience.

if localStorage or AudioContext or WebGL is unavailable it degrades — the portrait becomes simpler, quieter, more opaque.  the mirror still works.  it simply knows less about you.

---

*the figure in the glass is not you.  it is what you left behind in the signals you didn't know you were sending.*

