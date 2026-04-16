/* ─── The Mirror — script.js ──────────────────────────────────────────────────
 *
 * Architecture
 * ────────────
 *  collectEnvironment()  → reads browser / device / locale signals once
 *  trackInteraction()    → wires event listeners; updates state.interaction
 *  buildVisitorProfile() → translates raw signals into artistic portrait params
 *  updatePortraitState() → evolves portrait params each animation frame
 *  renderMirror()        → draws one canvas frame (shards, glow, eyes, noise)
 *  generateTextFragments()→ selects and displays poetic ambient text
 *  saveMirrorMemory()    → persists a minimal poetic profile in localStorage
 *  clearMirrorMemory()   → wipes that profile
 *
 * Artistic mapping notes live in buildVisitorProfile() and updatePortraitState().
 * Visual constants live in CONFIG.
 */

'use strict';

// ─── Configuration ─────────────────────────────────────────────────────────
const CONFIG = {
  shardRowsDesktop : 32,
  shardColsDesktop : 24,
  shardRowsMobile  : 22,
  shardColsMobile  : 16,
  shardJitter        : 0.42,   // fraction of cell size used for vertex jitter
  textInterval       : 9500,   // ms between ambient text fragment emissions
  textFadeDuration   : 4200,   // ms a fragment stays visible
  idleThreshold      : 6000,   // ms of stillness before autonomous motion begins
  memoryKey          : 'the_mirror_v1',
  maxScars           : 6,
  noiseFrames        : 10,     // pre-rendered noise canvases cycled for static
  hoverSpeedThreshold: 0.04,   // px/ms below which a cursor position is treated as lingering
  maxFrameDeltaMs    : 80,     // cap on dt to prevent large portrait jumps after tab suspension
};

// ─── Global State ──────────────────────────────────────────────────────────
const state = {
  phase    : 'landing',   // landing | awakening | observation | interaction | recognition
  awakened : false,
  startTime: Date.now(),

  environment: {},

  interaction: {
    cursorX           : window.innerWidth  * 0.5,
    cursorY           : window.innerHeight * 0.5,
    cursorSpeed       : 0,   // instantaneous
    cursorSmooth      : 0,   // exponential smoothing
    lastMoveTime      : Date.now(),
    hoverPoints       : [],  // [{x, y, age, intensity}] — lingering cursor wounds
    scrollVelocity    : 0,
    lastScrollY       : 0,
    typing            : { count: 0, deletions: 0, lastTime: 0, rhythm: 0 },
    resizeCount       : 0,
    actionSwitchRate  : 0,
    lastActionType    : null,
    lastActionTime    : Date.now(),
    typingBurstIntensity: 0,  // 0–1 how bursty the current typing rhythm is
    scrollSmooth      : 0,    // smoothed scroll velocity for gentle/violent discrimination
    resizeInjuryRaw   : 0,    // raw resize injury signal (set to 1 on resize, decays)
  },

  portrait: {
    convergence : 0,    // 0–1  how assembled the figure is
    jitter      : 0,    // 0–1  fragmentation / speed-driven chaos
    brightness  : 0.28, // 0–1  overall luminance
    eyeIntensity: 0,    // 0–1  eye glow
    crack       : 0,    // 0–1  deletion-driven damage
    pulse       : 0,    // 0–1  typing rhythm heartbeat
    sinkDepth   : 0,    // 0–1  scroll-driven distortion
    autonomy    : 0,    // 0–1  self-driven motion when idle
    split       : 0,    // 0–1  doubled ghost from rapid action switching
    panic       : 0,    // 0–1  extreme cursor speed → shard multiplication
    smear       : 0,    // 0–1  violent scroll → vertical aging / peeling
    breathDepth : 0,    // 0–1  gentle scroll → slow revelation breathing
    typeTremor  : 0,    // 0–1  burst typing → jaw / rib tremor flashes
    erasure     : 0,    // 0–1  deletion-driven self-erasure / scratched surface
    resizeInjury: 0,    // 0–1  resize-driven geometric distortion / injury
    desync      : 0,    // 0–1  rapid action switching → temporal desynchronisation
    lightAngle  : 0,    // radians — timezone-driven
    lightWarm   : 0,    // 0–1  warmth of light (0=cold silver, 1=amber)
    shardBias   : 0.5,  // 0–1  geometry bias from browser family
    skeletonShift:0,    // small float — OS-driven silhouette offset
  },

  memory  : null,     // loaded from localStorage
  shards  : [],       // Shard instances
  noiseFramePool: [], // pre-rendered noise canvases
  noiseIdx      : 0,  // current noise frame
  noiseCounter  : 0,  // frame counter for noise cycling

  audioCtx   : null,
  audioNodes : null,
  audioReady : false,
  muted      : false,
};

// ─── Shard ─────────────────────────────────────────────────────────────────
class Shard {
  constructor(cx, cy, origVerts, inPortrait) {
    this.cx         = cx;
    this.cy         = cy;
    this.origVerts  = origVerts;   // [{x, y}] — frozen reference positions
    this.inPortrait = inPortrait;  // 0–1 proximity to silhouette
    this.phase      = Math.random() * Math.PI * 2;
    this.speed      = 0.00018 + Math.random() * 0.00025;
    this.driftAx    = (Math.random() - 0.5);
    this.driftAy    = (Math.random() - 0.5);
    this.glowNow    = 0;
    this.glowTarget = 0;
    this.isCracked  = Math.random() > 0.82;
  }

  update() {
    this.phase += this.speed;
    this.glowNow += (this.glowTarget - this.glowNow) * 0.045;
  }

  draw(ctx, p, lightDx, lightDy) {
    const verts = this.origVerts;
    if (verts.length < 3) return;

    // Base colour — cold dark silver, warmed slightly by time of day
    const base  = this.inPortrait * p.convergence * p.brightness;
    const glow  = this.glowNow;
    const pls   = this.inPortrait * p.pulse * 0.12;
    const crk   = (p.crack > 0.3 && this.isCracked) ? 0.25 : 1;

    const lum   = (base * 0.50 + glow * 0.28 + pls) * crk;
    const R     = Math.min(255, Math.floor(lum * 200 * (0.78 + p.lightWarm * 0.22)));
    const G     = Math.min(255, Math.floor(lum * 195));
    const B     = Math.min(255, Math.floor(lum * 215 * (1.05 - p.lightWarm * 0.08)));
    const alpha = Math.min(0.82, 0.04 + base * 0.35 + glow * 0.22);

    ctx.beginPath();
    ctx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
    ctx.closePath();
    ctx.fillStyle = `rgba(${R},${G},${B},${alpha})`;
    ctx.fill();

    // Find the edge that best faces the light direction → specular highlight
    let bestDot = -1, bestI = 0;
    for (let i = 0; i < verts.length; i++) {
      const v1 = verts[i], v2 = verts[(i + 1) % verts.length];
      const ex = v2.x - v1.x, ey = v2.y - v1.y;
      const len = Math.sqrt(ex * ex + ey * ey) || 1;
      const dot = (-ey / len) * lightDx + (ex / len) * lightDy;
      if (dot > bestDot) { bestDot = dot; bestI = i; }
    }

    if (bestDot > 0.15) {
      const ea = (0.04 + base * 0.14 + glow * 0.20) * bestDot * crk;
      const eR = Math.min(255, R + 55), eG = Math.min(255, G + 50), eB = Math.min(255, B + 60);
      const va = verts[bestI], vb = verts[(bestI + 1) % verts.length];
      ctx.beginPath();
      ctx.moveTo(va.x, va.y);
      ctx.lineTo(vb.x, vb.y);
      ctx.strokeStyle = `rgba(${eR},${eG},${eB},${Math.min(0.72, ea)})`;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }
}

// ─── Module 1 — Collect Environment ────────────────────────────────────────
function collectEnvironment() {
  const env = {};
  const ua  = navigator.userAgent.toLowerCase();

  if      (ua.includes('firefox'))   env.browser = 'firefox';
  else if (ua.includes('edg/'))      env.browser = 'edge';
  else if (ua.includes('chrome'))    env.browser = 'chrome';
  else if (ua.includes('safari'))    env.browser = 'safari';
  else                               env.browser = 'other';

  if      (ua.includes('android'))                       env.os = 'android';
  else if (ua.includes('iphone') || ua.includes('ipad')) env.os = 'ios';
  else if (ua.includes('windows'))                       env.os = 'windows';
  else if (ua.includes('mac'))                           env.os = 'mac';
  else if (ua.includes('linux'))                         env.os = 'linux';
  else                                                   env.os = 'other';

  env.screenW     = screen.width;
  env.screenH     = screen.height;
  env.pixelRatio  = window.devicePixelRatio || 1;
  env.touch       = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

  env.darkMode        = window.matchMedia('(prefers-color-scheme: dark)').matches;
  env.reducedMotion   = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  env.lang = navigator.language || 'en';
  try { env.tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) { env.tz = 'UTC'; }

  const hour  = new Date().getHours();
  env.hour    = hour;
  if      (hour >= 5  && hour < 8)  env.dayPhase = 'dawn';
  else if (hour >= 8  && hour < 17) env.dayPhase = 'day';
  else if (hour >= 17 && hour < 21) env.dayPhase = 'dusk';
  else                              env.dayPhase = 'night';

  // Storage availability
  try {
    localStorage.setItem('_mtest', '1');
    localStorage.removeItem('_mtest');
    env.storage = true;
  } catch (_) { env.storage = false; }

  try {
    document.cookie = '_mtest=1; SameSite=Strict';
    env.cookies = document.cookie.includes('_mtest');
  } catch (_) { env.cookies = false; }

  env.returnVisit = !!(env.storage && localStorage.getItem(CONFIG.memoryKey));

  state.environment = env;
}

// ─── Module 2 — Track Interaction ──────────────────────────────────────────
function trackInteraction() {
  const inter = state.interaction;
  let prevX = inter.cursorX, prevY = inter.cursorY, prevMoveT = Date.now();

  function handleMove(cx, cy) {
    const now = Date.now();
    const dx  = cx - prevX, dy = cy - prevY;
    const dt  = Math.max(1, now - prevMoveT);
    const spd = Math.sqrt(dx * dx + dy * dy) / dt;

    inter.cursorSpeed  = spd;
    inter.cursorSmooth = inter.cursorSmooth * 0.88 + spd * 0.12;
    inter.lastMoveTime = now;
    inter.cursorX = cx;
    inter.cursorY = cy;
    prevX = cx; prevY = cy; prevMoveT = now;

    // Update custom cursor position
    const cur = document.getElementById('cursor');
    if (cur) { cur.style.left = cx + 'px'; cur.style.top = cy + 'px'; }

    // Record hover point when nearly still (lingers > 0.25 s without moving > 8 px)
    if (spd < CONFIG.hoverSpeedThreshold && state.awakened) {
      inter.hoverPoints.push({
        x: cx / window.innerWidth,
        y: cy / window.innerHeight,
        age: 0,
        intensity: 0.85,
      });
      if (inter.hoverPoints.length > 24) inter.hoverPoints.shift();
    }

    recordActionSwitch('cursor', now);
    if (!state.awakened) awaken();
  }

  document.addEventListener('mousemove', e => handleMove(e.clientX, e.clientY));
  document.addEventListener('touchmove', e => {
    const t = e.touches[0];
    handleMove(t.clientX, t.clientY);
  }, { passive: true });

  // Scroll
  let lastScrollT = Date.now();
  document.addEventListener('scroll', () => {
    const now = Date.now();
    const dy  = Math.abs(window.scrollY - inter.lastScrollY);
    const dt  = Math.max(1, now - lastScrollT);
    const raw = dy / dt;
    inter.scrollVelocity  = inter.scrollVelocity * 0.7 + raw * 0.3;
    inter.scrollSmooth    = inter.scrollSmooth * 0.92 + raw * 0.08;
    inter.lastScrollY     = window.scrollY;
    lastScrollT           = now;
    recordActionSwitch('scroll', now);
  }, { passive: true });

  // Keyboard
  document.addEventListener('keydown', e => {
    const now  = Date.now();
    const typ  = inter.typing;
    const gap  = now - typ.lastTime;
    if (typ.lastTime > 0 && gap < 2500) {
      typ.rhythm = typ.rhythm * 0.8 + gap * 0.2;
      // Burst detection: short inter-key gaps → high burst intensity
      if (gap < 180) {
        inter.typingBurstIntensity = Math.min(1, inter.typingBurstIntensity + 0.15);
      } else if (gap < 400) {
        inter.typingBurstIntensity = Math.min(1, inter.typingBurstIntensity + 0.05);
      }
    }
    typ.lastTime = now;
    typ.count++;
    if (e.key === 'Backspace' || e.key === 'Delete') typ.deletions++;
    recordActionSwitch('type', now);
  });

  // Resize
  window.addEventListener('resize', () => {
    inter.resizeCount++;
    inter.resizeInjuryRaw = 1;   // flash injury on resize, decays in updatePortraitState
    rebuildShards();
    recordActionSwitch('resize', Date.now());
  });

  function recordActionSwitch(type, now) {
    if (inter.lastActionType && inter.lastActionType !== type) {
      const gap = now - inter.lastActionTime;
      if (gap < 400) inter.actionSwitchRate = Math.min(1, inter.actionSwitchRate + 0.12);
    }
    inter.lastActionType = type;
    inter.lastActionTime = now;
  }
}

// ─── Module 3 — Build Visitor Profile ──────────────────────────────────────
//
// Artistic mapping rules:
//   browser  → shard tessellation geometry bias (shardBias)
//   OS       → silhouette skeleton lateral shift (skeletonShift)
//   timezone → light angle + warmth
//   language → reserved for future text fragment weighting
//   storage  → portrait stability / memory continuity
//   return   → higher starting convergence
//
function buildVisitorProfile() {
  const env = state.environment;
  const p   = state.portrait;

  // Light angle from hour (midnight = π, noon = 0)
  const h          = env.hour || 12;
  p.lightAngle     = ((h / 24) * Math.PI * 2) - Math.PI * 0.5;
  p.lightWarm      = (h >= 6 && h <= 20)
    ? Math.sin(Math.PI * (h - 6) / 14) * 0.65
    : 0.0;

  // Browser → shard geometry character.
  // Lower values give sharper / more angular shard patterns; higher gives rounder, calmer facets.
  // Firefox = angular (0.22), Safari = softest (0.82), Chrome = mid (0.55), Edge = firm (0.62).
  const browserBias = { firefox: 0.22, chrome: 0.55, safari: 0.82, edge: 0.62, other: 0.38 };
  p.shardBias = browserBias[env.browser] || 0.38;

  // OS → subtle skeleton lateral shift (negative = left / inward, positive = right / outward).
  // The shift moves the portrait centroid slightly to give each platform a distinct posture.
  const osShift = { windows: 0.03, mac: -0.04, linux: 0.08, ios: -0.06, android: 0.06, other: 0 };
  p.skeletonShift = osShift[env.os] || 0;

  // Storage unavailable or private mode → portrait is unstable
  if (!env.storage) p.convergence = Math.max(p.convergence - 0.1, 0);

  // Return visitor → portrait begins more assembled
  if (state.memory && state.memory.visits > 0) {
    const returnBoost = Math.min(0.65, 0.18 + state.memory.visits * 0.08);
    p.convergence = Math.max(p.convergence, returnBoost);
    // Inherit some prior crack + erasure (memory scars)
    if (state.memory.scars && state.memory.scars.length) {
      const lastScar = state.memory.scars[0];
      p.crack   = lastScar.crack * 0.5;
      p.erasure = (lastScar.erasure || 0) * 0.35;
    }
  }
}

// ─── Portrait silhouette density ───────────────────────────────────────────
// Returns 0–1 brightness weight for a canvas position (nx, ny ∈ [0,1]).
// Defines the humanoid shape that shards gradually reveal.
function portraitDensity(nx, ny, skeletonShift) {
  const shift = skeletonShift || 0;
  const cx    = 0.5 + shift;

  // Head
  const hx = 0.098, hy = 0.120;
  const hd = Math.sqrt(((nx - cx) / hx) ** 2 + ((ny - 0.270) / hy) ** 2);
  const head = Math.max(0, 1 - hd);

  // Neck
  const nd = Math.sqrt(((nx - cx) / 0.032) ** 2 + ((ny - 0.400) / 0.080) ** 2);
  const neck = Math.max(0, 1 - nd) * 0.80;

  // Left shoulder
  const lsd = Math.sqrt(((nx - (cx - 0.155)) / 0.110) ** 2 + ((ny - 0.490) / 0.065) ** 2);
  const lShoulder = Math.max(0, 1 - lsd) * 0.90;

  // Right shoulder
  const rsd = Math.sqrt(((nx - (cx + 0.155)) / 0.110) ** 2 + ((ny - 0.490) / 0.065) ** 2);
  const rShoulder = Math.max(0, 1 - rsd) * 0.90;

  // Upper chest / collar
  const cd = Math.sqrt(((nx - cx) / 0.120) ** 2 + ((ny - 0.540) / 0.060) ** 2);
  const chest = Math.max(0, 1 - cd) * 0.72;

  // Upper torso
  const td = Math.sqrt(((nx - cx) / 0.105) ** 2 + ((ny - 0.630) / 0.080) ** 2);
  const torso = Math.max(0, 1 - td) * 0.52;

  return Math.min(1.0, Math.max(head, neck, lShoulder, rShoulder, chest, torso));
}

// ─── Module 4 — Update Portrait State (per frame) ──────────────────────────
function updatePortraitState(dt) {
  const p    = state.portrait;
  const inter = state.interaction;
  const now  = Date.now();

  // --- Autonomy: builds during stillness, richer idle motion ---
  const idleMs = now - inter.lastMoveTime;
  const targetAutonomy = Math.min(1, idleMs / (CONFIG.idleThreshold * 1.8));
  p.autonomy = p.autonomy + (targetAutonomy - p.autonomy) * (dt / 1000);

  // --- Jitter: cursor speed drives fragmentation ---
  const targetJitter = Math.min(1, inter.cursorSmooth * 22);
  p.jitter = p.jitter + (targetJitter - p.jitter) * (dt / 220);

  // --- Panic: extreme cursor speed → shard multiplication ---
  //     Only fires above a high-speed threshold; creates sharp, multiplicative chaos.
  const panicThreshold = 0.06;  // cursorSmooth above this triggers panic
  const panicRange     = 0.12;  // normalisation range (0.18 - panicThreshold)
  const rawPanic = Math.max(0, inter.cursorSmooth - panicThreshold) / panicRange;
  const targetPanic = Math.min(1, rawPanic);
  p.panic = p.panic + (targetPanic - p.panic) * (dt / 160);

  // --- Convergence: assembles over time + calm moments; slow cursor accelerates ---
  const sessionSec   = (now - state.startTime) / 1000;
  const calmFactor   = 1 - Math.max(p.jitter, p.panic);
  const calmBoost    = calmFactor * 0.0012;
  const timeBoost    = Math.min(0.0014, sessionSec * 0.000015);
  const targetConv   = Math.min(0.95, p.convergence + calmBoost + timeBoost);
  p.convergence = p.convergence + (targetConv - p.convergence) * (dt / 600);

  // Fast cursor actively tears apart convergence
  if (p.jitter > 0.5) {
    p.convergence = Math.max(0, p.convergence - p.jitter * 0.0008 * dt);
  }

  // --- Pulse: typing creates a heartbeat ---
  const sinceType = now - inter.typing.lastTime;
  p.pulse = sinceType < 2800 ? Math.max(0, 1 - sinceType / 2800) : Math.max(0, p.pulse - dt * 0.0004);

  // --- Type tremor: burst typing → cracked articulation, jaw/rib flashes ---
  const targetTremor = inter.typingBurstIntensity;
  p.typeTremor = p.typeTremor + (targetTremor - p.typeTremor) * (dt / 150);
  inter.typingBurstIntensity *= (1 - dt * 0.0028);  // natural decay

  // --- Crack: built from high deletion ratio ---
  const delRatio     = inter.typing.count > 5 ? inter.typing.deletions / inter.typing.count : 0;
  const targetCrack  = Math.min(1, delRatio * 2.2);
  p.crack = p.crack + (targetCrack - p.crack) * (dt / 1500);

  // --- Erasure: deletions cause self-erasure, injuries, scratched surfaces ---
  //     More aggressive than crack; high deletion ratio creates missing patches.
  const targetErasure = Math.min(1, delRatio * 3.2);
  p.erasure = p.erasure + (targetErasure - p.erasure) * (dt / 1000);

  // --- Scroll: violent → smear / aging; gentle → breath / revelation ---
  const scrollSpeed = inter.scrollSmooth;

  // Violent scroll: smearing, aging, peeling, drowning, sinking
  const targetSmear = Math.min(1, Math.max(0, scrollSpeed - 0.08) * 25);
  p.smear = p.smear + (targetSmear - p.smear) * (dt / 120);

  // Gentle scroll: slow revelation, breathing depth
  const isGentle = scrollSpeed > 0.005 && scrollSpeed < 0.08;
  const targetBreath = isGentle ? Math.min(1, scrollSpeed * 14) : 0;
  p.breathDepth = p.breathDepth + (targetBreath - p.breathDepth) * (dt / 600);

  // Sink depth: scroll velocity sinks the figure
  const targetSink = Math.min(1, inter.scrollVelocity * 60);
  p.sinkDepth = p.sinkDepth + (targetSink - p.sinkDepth) * (dt / 180);
  inter.scrollVelocity *= 0.94;
  inter.scrollSmooth   *= 0.97;

  // --- Resize injury: physical distortion that decays ---
  const targetInjury = inter.resizeInjuryRaw;
  p.resizeInjury = p.resizeInjury + (targetInjury - p.resizeInjury) * (dt / 60);
  inter.resizeInjuryRaw *= (1 - dt * 0.003);   // decay the raw signal
  p.resizeInjury *= (1 - dt * 0.0012);          // slow visual decay

  // Resize also damages convergence
  if (p.resizeInjury > 0.1) {
    p.convergence = Math.max(0, p.convergence - p.resizeInjury * 0.002 * dt);
  }

  // --- Split: rapid action switching splits the form ---
  p.split = inter.actionSwitchRate;
  inter.actionSwitchRate *= (1 - dt * 0.003);

  // --- Desync: amplified temporal desynchronisation from rapid switching ---
  const targetDesync = Math.min(1, inter.actionSwitchRate * 1.6);
  p.desync = p.desync + (targetDesync - p.desync) * (dt / 200);

  // --- Eye intensity: hover near the head region ---
  const shift   = state.portrait.skeletonShift;
  const eCX     = 0.5 + shift;
  const eCY     = 0.260;
  let eyeTarget = 0;
  for (const hp of inter.hoverPoints) {
    const dx = hp.x - eCX, dy = hp.y - eCY;
    const d  = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.22) eyeTarget = Math.max(eyeTarget, hp.intensity * (1 - d / 0.22));
  }
  p.eyeIntensity = p.eyeIntensity + (eyeTarget - p.eyeIntensity) * (dt / 400);

  // --- Overall brightness ---
  //     Breath gently raises brightness (revelation); smear and erasure dim it.
  const breathLift = p.breathDepth * 0.08;
  const smearDim   = p.smear * 0.12;
  const erasureDim = p.erasure * 0.10;
  p.brightness = 0.26 + p.convergence * 0.46 + breathLift - smearDim - erasureDim;

  // --- Decay hover points ---
  for (const hp of inter.hoverPoints) {
    hp.age       += dt;
    hp.intensity  = Math.max(0, hp.intensity - dt * 0.000095);
  }
  inter.hoverPoints = inter.hoverPoints.filter(hp => hp.intensity > 0.01);
}

// ─── Module 5 — Build Shard Geometry ───────────────────────────────────────
function rebuildShards() {
  const canvas = document.getElementById('mirror-canvas');
  const W = canvas.width  = window.innerWidth;
  const H = canvas.height = window.innerHeight;

  const env  = state.environment;
  const rows = (env.touch && W < 900) ? CONFIG.shardRowsMobile : CONFIG.shardRowsDesktop;
  const cols = (env.touch && W < 900) ? CONFIG.shardColsMobile : CONFIG.shardColsDesktop;
  const jit  = CONFIG.shardJitter;
  const sk   = state.portrait.skeletonShift;

  // Build point grid with per-interior-vertex jitter
  const pts = [];
  for (let r = 0; r <= rows; r++) {
    pts.push([]);
    for (let c = 0; c <= cols; c++) {
      const bx   = (c / cols) * W;
      const by   = (r / rows) * H;
      const edge = (r === 0 || r === rows || c === 0 || c === cols);
      const jx   = edge ? 0 : (Math.random() - 0.5) * (W / cols) * jit;
      const jy   = edge ? 0 : (Math.random() - 0.5) * (H / rows) * jit;
      pts[r].push({ x: bx + jx, y: by + jy });
    }
  }

  // Build two triangles per grid cell
  state.shards = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tl = pts[r][c], tr = pts[r][c + 1];
      const bl = pts[r + 1][c], br = pts[r + 1][c + 1];

      const makeShard = (v1, v2, v3) => {
        const cx = (v1.x + v2.x + v3.x) / 3;
        const cy = (v1.y + v2.y + v3.y) / 3;
        const dens = portraitDensity(cx / W, cy / H, sk);
        return new Shard(cx, cy, [v1, v2, v3], dens);
      };

      state.shards.push(makeShard(tl, tr, bl));
      state.shards.push(makeShard(tr, br, bl));
    }
  }

  // Re-initialise noise for new size
  initNoise(W, H);
}

// ─── Noise / Static ────────────────────────────────────────────────────────

// Deterministic hash for stable per-shard decisions (avoids flicker)
function shardHash(idx, seed) {
  let x = Math.sin(idx * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function initNoise(W, H) {
  const nW = Math.floor(W / 5);
  const nH = Math.floor(H / 5);
  state.noiseFramePool = [];

  for (let f = 0; f < CONFIG.noiseFrames; f++) {
    const nc  = document.createElement('canvas');
    nc.width  = nW;
    nc.height = nH;
    const nctx = nc.getContext('2d');
    const id   = nctx.createImageData(nW, nH);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = Math.random() * 255;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
      id.data[i + 3] = 255;
    }
    nctx.putImageData(id, 0, 0);
    state.noiseFramePool.push(nc);
  }
}

// ─── Module 5 — Render Mirror ──────────────────────────────────────────────
function renderMirror() {
  const canvas = document.getElementById('mirror-canvas');
  const ctx    = canvas.getContext('2d');
  const W      = canvas.width;
  const H      = canvas.height;
  const p      = state.portrait;
  const t      = Date.now() * 0.001;

  // Light direction vector (from lightAngle)
  const lightDx = Math.cos(p.lightAngle);
  const lightDy = Math.sin(p.lightAngle);

  // 1. Background
  ctx.fillStyle = 'rgb(2, 2, 5)';
  ctx.fillRect(0, 0, W, H);

  // 2. Sink offset — scroll sinks the portrait
  const sinkY = p.sinkDepth * H * 0.06;

  ctx.save();
  ctx.translate(0, sinkY);

  // 2b. Resize injury → geometric shear distortion
  if (p.resizeInjury > 0.04) {
    const shear = p.resizeInjury * 0.08 * Math.sin(t * 12);
    ctx.transform(1, shear, -shear * 0.5, 1, 0, 0);
  }

  // 2c. Breath depth → gentle vertical oscillation (slow revelation)
  if (p.breathDepth > 0.01) {
    const breathY = Math.sin(t * 0.6) * p.breathDepth * H * 0.012;
    ctx.translate(0, breathY);
  }

  // 3. Autonomous portrait motion — richer idle behaviour
  //    Breathing, head drift, micro-movements
  const autoBase  = p.autonomy;
  const swayAmt   = autoBase * 4.5;
  const swayX     = Math.sin(t * 0.28) * swayAmt;
  const swayY     = Math.cos(t * 0.19) * swayAmt * 0.5;
  const breathAmt = autoBase * Math.sin(t * 0.85) * 1.2;  // breathing
  const headDrift = autoBase * Math.sin(t * 0.12) * 2.0;   // slow head drift
  ctx.translate(swayX + headDrift, swayY + breathAmt);

  // 4. Shards — with erasure, panic multiplication, and type tremor
  const erasureSeed = Math.floor(t * 0.4);  // changes slowly to shift erasure gaps
  state.shards.forEach((s, idx) => {
    s.glowTarget = s.inPortrait * p.convergence * (p.brightness + p.autonomy * 0.1);
    s.update();

    // Erasure: skip some portrait shards → dark wounds / self-erasure
    if (p.erasure > 0.15 && s.inPortrait > 0.4) {
      const erasureChance = p.erasure * 0.45 * s.inPortrait;
      if (shardHash(idx, erasureSeed) < erasureChance) return;
    }

    // Compute per-shard displacement
    const ny = s.cy / H;
    let tremorX = 0;

    // Type tremor: jaw region (0.34-0.42) and rib/chest region (0.52-0.68)
    if (p.typeTremor > 0.1) {
      const inJaw  = (ny > 0.34 && ny < 0.42) ? 1 : 0;
      const inRibs = (ny > 0.52 && ny < 0.68) ? 0.7 : 0;
      tremorX = (inJaw + inRibs) * p.typeTremor * (Math.random() - 0.5) * 7;
    }

    const needsDisplace = p.jitter > 0.35 || tremorX !== 0;

    if (needsDisplace) {
      const mag = p.jitter > 0.35 ? (p.jitter - 0.35) / 0.65 : 0;
      const jx  = (Math.random() - 0.5) * mag * 5 + tremorX;
      const jy  = (Math.random() - 0.5) * mag * 4;
      const jverts = s.origVerts.map(v => ({ x: v.x + jx, y: v.y + jy }));
      const savedV = s.origVerts;
      s.origVerts  = jverts;
      s.draw(ctx, p, lightDx, lightDy);
      s.origVerts  = savedV;
    } else {
      s.draw(ctx, p, lightDx, lightDy);
    }

    // Panic: extreme speed → draw phantom duplicates (multiplication)
    if (p.panic > 0.2 && s.inPortrait > 0.25) {
      const copies = p.panic > 0.7 ? 2 : 1;
      for (let c = 0; c < copies; c++) {
        const pMag = p.panic * 8;
        const pverts = s.origVerts.map(v => ({
          x: v.x + (Math.random() - 0.5) * pMag,
          y: v.y + (Math.random() - 0.5) * pMag * 0.7,
        }));
        ctx.globalAlpha = p.panic * 0.18;
        const savedV2 = s.origVerts;
        s.origVerts = pverts;
        s.draw(ctx, p, lightDx, lightDy);
        s.origVerts = savedV2;
      }
      ctx.globalAlpha = 1;
    }
  });

  ctx.restore();

  // 5. Portrait glow overlays (head, shoulders)
  if (p.convergence > 0.08) drawPortraitGlow(ctx, W, H, p, t);

  // 6. Eyes
  if (p.convergence > 0.28) drawEyes(ctx, W, H, p, t);

  // 7. Hover wound points (enhanced heat blooms)
  drawHoverWounds(ctx, W, H, t);

  // 8. Type tremor rib-flash overlay
  if (p.typeTremor > 0.15) drawTypeTremorFlash(ctx, W, H, p, t);

  // 9. Erasure scratch overlay
  if (p.erasure > 0.2) drawErasureScars(ctx, W, H, p, t);

  // 10. Smear overlay — violent scroll aging / peeling
  if (p.smear > 0.05) drawSmearOverlay(ctx, canvas, W, H, p);

  // 11. Resize injury flash
  if (p.resizeInjury > 0.08) drawResizeInjuryFlash(ctx, W, H, p, t);

  // 12. Film grain (static)
  drawNoise(ctx, W, H, p);

  // 13. Split / desync ghost (doubled form from rapid switching)
  if (p.split > 0.08 || p.desync > 0.06) {
    const splitAmt = Math.max(p.split, p.desync);
    ctx.save();
    // Right ghost — slightly red-shifted
    ctx.globalAlpha = splitAmt * 0.10;
    ctx.globalCompositeOperation = 'screen';
    ctx.translate(splitAmt * 11, p.desync * 3 * Math.sin(t * 2.1));
    ctx.drawImage(canvas, 0, 0);
    // Left ghost — slightly blue-shifted
    ctx.translate(-splitAmt * 22, -p.desync * 6 * Math.sin(t * 2.1));
    ctx.globalAlpha = splitAmt * 0.06;
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();
  }
}

function drawPortraitGlow(ctx, W, H, p, t) {
  const shift = p.skeletonShift;
  const cx    = W * (0.5 + shift);
  const headY = H * (0.270 + p.sinkDepth * 0.06);
  const pulse = 1 + Math.sin(t * 1.4) * 0.03 * p.pulse;

  // Head glow
  const headR = Math.min(W, H) * 0.145 * pulse;
  const hg    = ctx.createRadialGradient(cx, headY, 0, cx, headY, headR);
  const ha    = p.convergence * p.brightness * 0.18;
  hg.addColorStop(0,   `rgba(178,192,218,${ha})`);
  hg.addColorStop(0.55,`rgba(118,136,172,${ha * 0.38})`);
  hg.addColorStop(1,   'rgba(118,136,172,0)');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.ellipse(cx, headY, headR, headR * 1.22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Shoulder glow
  const shY = H * (0.490 + p.sinkDepth * 0.06);
  const sg  = ctx.createRadialGradient(cx, shY, 0, cx, shY, W * 0.26);
  const sa  = p.convergence * p.brightness * 0.09;
  sg.addColorStop(0,  `rgba(155,170,200,${sa})`);
  sg.addColorStop(1,  'rgba(155,170,200,0)');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.ellipse(cx, shY, W * 0.26, H * 0.068, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawEyes(ctx, W, H, p, t) {
  const shift  = p.skeletonShift;
  const cx     = W * (0.5 + shift);
  const eyeY   = H * (0.258 + p.sinkDepth * 0.06);
  const spacing = W * 0.052;

  // Very occasional blink (a brief zero moment in a normally-1 factor)
  const blinkPhase = Math.sin(t * 0.53) * Math.sin(t * 1.3);
  const blink      = blinkPhase > 0.96 ? 0 : 1;

  const baseAlpha = p.convergence * (0.22 + p.eyeIntensity * 0.55) * blink;

  for (const side of [-1, 1]) {
    const ex = cx + side * spacing;
    const ey = eyeY + Math.sin(t * 0.18 + side * 0.8) * H * 0.0025;

    // Cursor tracking — subtle, lagged
    const targetX = state.interaction.cursorX;
    const targetY = state.interaction.cursorY;
    const lookX   = (targetX / W - 0.5) * W * 0.004 * side;
    const lookY   = (targetY / H - 0.5) * H * 0.003;

    const egR = W * 0.026;
    const eg  = ctx.createRadialGradient(ex + lookX, ey + lookY, 0, ex, ey, egR);
    eg.addColorStop(0,    `rgba(222,235,255,${baseAlpha * 0.92})`);
    eg.addColorStop(0.28, `rgba(185,205,240,${baseAlpha * 0.52})`);
    eg.addColorStop(1,    'rgba(185,205,240,0)');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(ex, ey, egR, 0, Math.PI * 2);
    ctx.fill();

    // Pupil
    if (baseAlpha > 0.05) {
      ctx.fillStyle = `rgba(4,4,10,${baseAlpha * 0.88})`;
      ctx.beginPath();
      ctx.arc(ex + lookX, ey + lookY, W * 0.006, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawHoverWounds(ctx, W, H, t) {
  for (const hp of state.interaction.hoverPoints) {
    if (hp.intensity < 0.04) continue;
    const x  = hp.x * W;
    const y  = hp.y * H;
    const age = hp.age * 0.001;

    // Outer heat bloom — warm amber glow for old wounds
    const bloomR = 34 * hp.intensity + age * 4;
    const warmth = Math.min(1, age * 0.3);
    const bR = Math.floor(205 + warmth * 50);
    const bG = Math.floor(200 - warmth * 40);
    const bB = Math.floor(252 - warmth * 120);
    const bg = ctx.createRadialGradient(x, y, 0, x, y, bloomR);
    bg.addColorStop(0,   `rgba(${bR},${bG},${bB},${hp.intensity * 0.42})`);
    bg.addColorStop(0.4, `rgba(${bR},${bG},${bB},${hp.intensity * 0.18})`);
    bg.addColorStop(1,   `rgba(${bR},${bG},${bB},0)`);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(x, y, bloomR, 0, Math.PI * 2);
    ctx.fill();

    // Inner core — bright fingerprint-like centre
    const coreR = 8 * hp.intensity;
    const cg = ctx.createRadialGradient(x, y, 0, x, y, coreR);
    cg.addColorStop(0,   `rgba(240,245,255,${hp.intensity * 0.55})`);
    cg.addColorStop(0.6, `rgba(220,230,250,${hp.intensity * 0.22})`);
    cg.addColorStop(1,   'rgba(220,230,250,0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(x, y, coreR, 0, Math.PI * 2);
    ctx.fill();

    // Eye-like dark pupil at centre of intense wounds
    if (hp.intensity > 0.45) {
      const pupilR = 2.5 * hp.intensity;
      ctx.fillStyle = `rgba(2,2,8,${hp.intensity * 0.6})`;
      ctx.beginPath();
      ctx.arc(x, y, pupilR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pulsing ring — the wound breathes
    if (hp.intensity > 0.25) {
      const ringR = (16 + Math.sin(t * 2.4 + hp.x * 10) * 4) * hp.intensity;
      ctx.strokeStyle = `rgba(200,215,245,${hp.intensity * 0.14})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(x, y, ringR, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

// ─── Type tremor rib-flash overlay ──────────────────────────────────────────
// Burst typing produces rib-like horizontal flashes across chest / jaw
function drawTypeTremorFlash(ctx, W, H, p, t) {
  const shift = p.skeletonShift;
  const cx    = W * (0.5 + shift);

  ctx.save();
  ctx.globalAlpha = p.typeTremor * 0.35;
  ctx.strokeStyle = 'rgba(200,215,240,0.6)';

  // Rib flashes — thin horizontal lines across the chest area
  const ribCount = Math.floor(p.typeTremor * 6) + 1;
  for (let i = 0; i < ribCount; i++) {
    const ribY = H * (0.53 + i * 0.025);
    const ribW = W * (0.06 + p.typeTremor * 0.04);
    const flicker = Math.sin(t * 18 + i * 2.7) > 0 ? 1 : 0;
    if (!flicker) continue;
    ctx.lineWidth = 0.5 + p.typeTremor * 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - ribW, ribY + (Math.random() - 0.5) * 2);
    ctx.lineTo(cx + ribW, ribY + (Math.random() - 0.5) * 2);
    ctx.stroke();
  }

  // Jawline tremor — flickering horizontal line beneath the chin
  const jawY  = H * 0.375;
  const jawW  = W * 0.042;
  const jawOn = Math.sin(t * 22) > 0.3 ? 1 : 0;
  if (jawOn) {
    ctx.lineWidth = 0.6 + p.typeTremor * 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - jawW, jawY);
    ctx.lineTo(cx + jawW, jawY);
    ctx.stroke();
  }

  ctx.restore();
}

// ─── Erasure scratch overlay ────────────────────────────────────────────────
// Deletions scar the portrait surface: scratches, stitched-over mouth
function drawErasureScars(ctx, W, H, p, t) {
  const shift = p.skeletonShift;
  const cx    = W * (0.5 + shift);
  const seed  = Math.floor(t * 0.3);

  ctx.save();
  ctx.globalAlpha = p.erasure * 0.45;
  ctx.strokeStyle = 'rgba(140,150,180,0.5)';

  // Scratches across the face / torso — 2 to 6 lines
  const scratchCount = Math.floor(p.erasure * 5) + 1;
  for (let i = 0; i < scratchCount; i++) {
    const sx = cx + (shardHash(i, seed) - 0.5) * W * 0.22;
    const sy = H * (0.22 + shardHash(i + 37, seed) * 0.42);
    const ex = sx + (shardHash(i + 71, seed) - 0.5) * W * 0.10;
    const ey = sy + shardHash(i + 99, seed) * H * 0.08;
    ctx.lineWidth = 0.4 + p.erasure * 0.9;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }

  // Stitched-over mouth — horizontal cross-hatch near mouth area
  if (p.erasure > 0.4) {
    const mouthY = H * 0.34;
    const mouthW = W * 0.032;
    const stitchCount = Math.floor((p.erasure - 0.4) * 8) + 2;
    ctx.lineWidth = 0.5;
    for (let i = 0; i < stitchCount; i++) {
      const sx = cx - mouthW + (i / stitchCount) * mouthW * 2;
      ctx.beginPath();
      ctx.moveTo(sx, mouthY - 2);
      ctx.lineTo(sx, mouthY + 2);
      ctx.stroke();
    }
    // Horizontal line through them
    ctx.beginPath();
    ctx.moveTo(cx - mouthW, mouthY);
    ctx.lineTo(cx + mouthW, mouthY);
    ctx.stroke();
  }

  ctx.restore();
}

// ─── Smear overlay — violent scroll aging / peeling ─────────────────────────
// Redraws the current canvas vertically offset at low alpha, creating a motion blur
function drawSmearOverlay(ctx, canvas, W, H, p) {
  const layers = Math.min(4, Math.floor(p.smear * 5) + 1);
  ctx.save();
  for (let i = 1; i <= layers; i++) {
    const offset = i * p.smear * H * 0.012;
    ctx.globalAlpha = p.smear * (0.08 / i);
    ctx.drawImage(canvas, 0, offset);
    ctx.drawImage(canvas, 0, -offset * 0.5);
  }
  ctx.restore();
}

// ─── Resize injury flash ────────────────────────────────────────────────────
// Bright crack lines and warping that flash on resize, then decay
function drawResizeInjuryFlash(ctx, W, H, p, t) {
  ctx.save();
  ctx.globalAlpha = p.resizeInjury * 0.6;
  ctx.strokeStyle = `rgba(220,230,255,${p.resizeInjury * 0.7})`;

  // Crack lines radiating from centre
  const cx = W * 0.5;
  const cy = H * 0.4;
  const crackCount = Math.floor(p.resizeInjury * 6) + 2;
  for (let i = 0; i < crackCount; i++) {
    const angle = (i / crackCount) * Math.PI * 2 + t * 0.5;
    const len   = p.resizeInjury * Math.min(W, H) * 0.15;
    ctx.lineWidth = 0.6 + p.resizeInjury * 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
    ctx.stroke();
  }

  // Brief white flash over everything (impact)
  if (p.resizeInjury > 0.5) {
    ctx.fillStyle = `rgba(255,255,255,${(p.resizeInjury - 0.5) * 0.08})`;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.restore();
}

function drawNoise(ctx, W, H, p) {
  if (!state.noiseFramePool.length) return;

  state.noiseCounter++;
  if (state.noiseCounter % 3 === 0) {
    state.noiseIdx = (state.noiseIdx + 1) % state.noiseFramePool.length;
  }

  const noiseAlpha = 0.032 + p.jitter * 0.042;
  ctx.save();
  ctx.globalAlpha = noiseAlpha;
  ctx.globalCompositeOperation = 'screen';
  ctx.drawImage(state.noiseFramePool[state.noiseIdx], 0, 0, W, H);
  ctx.restore();
}

// ─── Module 6 — Generate Text Fragments ────────────────────────────────────
const TEXT_POOLS = {
  arrival: [
    'You arrived in fragments.',
    'The glass remembers what your browser admits.',
    'A thousand panes decide your outline.',
    'Your machine speaks before you do.',
    'Something assembles itself around your presence.',
  ],
  cursor: [
    'You hesitate where you think you are alone.',
    'Your pauses leave impressions in the glass.',
    'Stillness is not invisibility here.',
    'The mirror measures your restraint.',
    'Where you linger, the surface remembers.',
  ],
  typing: [
    'You erase faster than you speak.',
    'Every deletion is a confession.',
    'What you unsay shapes you more than what you say.',
    'The mirror reads the spaces between your keystrokes.',
    'You rewrite yourself. The glass keeps both versions.',
  ],
  idle: [
    'You have gone still. The mirror has not.',
    'In absence, it imagines you.',
    'It has been watching longer than you have been watching it.',
    'Your stillness gives it room to finish the portrait.',
    'The figure continues without you.',
  ],
  memory: [
    'The glass remembers the shape of your last visit.',
    'You have been here before. The mirror kept your outline.',
    'Some cracks do not heal between visits.',
    'It has waited.',
    'You left something here. It is still here.',
  ],
  returning: [
    'The cracks from before are still there.',
    'The glass held your impression while you were gone.',
    'You returned. The mirror knew you would.',
    'Something in the surface recognises you.',
  ],
  scroll: [
    'You descend into the chamber.',
    'Depth does not erase you here.',
    'The figure follows you down.',
  ],
  split: [
    'You move too quickly to have only one face.',
    'Contradiction fractures the glass.',
    'The mirror cannot settle on a single you.',
  ],
  recognition: [
    'It has learned you.',
    'The portrait no longer needs your help.',
    'The glass has decided what you are.',
    'You are fully reflected now.',
  ],
};

function generateTextFragments() {
  const p     = state.portrait;
  const inter = state.interaction;
  const env   = state.environment;
  const now   = Date.now();

  let pool = TEXT_POOLS.arrival;

  if (state.phase === 'recognition') {
    pool = TEXT_POOLS.recognition;
  } else if (env.returnVisit && state.memory) {
    pool = Math.random() < 0.55 ? TEXT_POOLS.memory : TEXT_POOLS.returning;
  } else if (p.autonomy > 0.55) {
    pool = TEXT_POOLS.idle;
  } else if (inter.typing.count > 6 && inter.typing.deletions / inter.typing.count > 0.28) {
    pool = TEXT_POOLS.typing;
  } else if (p.split > 0.22) {
    pool = TEXT_POOLS.split;
  } else if (inter.scrollVelocity > 0.08) {
    pool = TEXT_POOLS.scroll;
  } else if (inter.hoverPoints.length > 4) {
    pool = TEXT_POOLS.cursor;
  } else {
    const sessionMin = (now - state.startTime) / 60000;
    if (sessionMin > 0.8) pool = TEXT_POOLS.cursor;
    if (sessionMin > 2.0) pool = [
      ...TEXT_POOLS.cursor,
      ...TEXT_POOLS.typing.slice(0, 2),
    ];
  }

  const text = pool[Math.floor(Math.random() * pool.length)];
  showTextFragment(text);
}

function showTextFragment(text) {
  const overlay = document.getElementById('text-overlay');
  if (!overlay || !state.awakened) return;

  // Sparse positions — 6 anchor zones around the portrait
  const positions = [
    { left: '7%',  top: '12%' },
    { left: '62%', top: '16%' },
    { left: '8%',  top: '72%' },
    { left: '58%', top: '68%' },
    { left: '6%',  top: '44%' },
    { left: '64%', top: '48%' },
  ];
  const pos = positions[Math.floor(Math.random() * positions.length)];

  const el       = document.createElement('div');
  el.className   = 'text-fragment';
  el.textContent = text;
  el.style.left  = pos.left;
  el.style.top   = pos.top;
  overlay.appendChild(el);

  // Fade in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.style.color = 'rgba(182, 194, 218, 0.68)';
    });
  });

  // Fade out
  setTimeout(() => {
    el.style.color = 'rgba(182, 194, 218, 0)';
    setTimeout(() => el.remove(), 2400);
  }, CONFIG.textFadeDuration);
}

// ─── Module 7 — Memory ─────────────────────────────────────────────────────
function loadMirrorMemory() {
  if (!state.environment.storage) return;
  try {
    const raw = localStorage.getItem(CONFIG.memoryKey);
    if (raw) state.memory = JSON.parse(raw);
  } catch (_) { state.memory = null; }
}

function saveMirrorMemory() {
  if (!state.environment.storage) return;
  const p   = state.portrait;
  const inter = state.interaction;
  const now = Date.now();
  const prev = state.memory || { visits: 0, scars: [] };

  const scar = {
    timestamp  : now,
    convergence: +p.convergence.toFixed(3),
    crack      : +p.crack.toFixed(3),
    erasure    : +p.erasure.toFixed(3),
    jitter     : +p.jitter.toFixed(3),
    delRatio   : inter.typing.count > 0
      ? +(inter.typing.deletions / inter.typing.count).toFixed(3)
      : 0,
  };

  const memory = {
    visits     : (prev.visits || 0) + 1,
    firstVisit : prev.firstVisit || now,
    lastVisit  : now,
    scars      : [scar, ...(prev.scars || [])].slice(0, CONFIG.maxScars),
    browser    : state.environment.browser,
    os         : state.environment.os,
  };

  try {
    localStorage.setItem(CONFIG.memoryKey, JSON.stringify(memory));
    state.memory = memory;
  } catch (_) { /* quota exceeded or restricted */ }
}

function clearMirrorMemory() {
  try { localStorage.removeItem(CONFIG.memoryKey); } catch (_) {}
  state.memory = null;
  showTextFragment('The mirror forgets. For now.');
}

// ─── Audio (optional ambient drone + crackle) ───────────────────────────────
function initAudio() {
  const ACtx = window.AudioContext || window.webkitAudioContext;
  if (!ACtx) return;

  const ctx = new ACtx();

  // Low glass-hum oscillator
  const osc   = ctx.createOscillator();
  const gain  = ctx.createGain();
  const filt  = ctx.createBiquadFilter();
  osc.type    = 'sine';
  osc.frequency.setValueAtTime(58, ctx.currentTime);
  filt.type   = 'lowpass';
  filt.frequency.setValueAtTime(220, ctx.currentTime);
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.028, ctx.currentTime + 4);
  osc.connect(filt);
  filt.connect(gain);
  gain.connect(ctx.destination);
  osc.start();

  // Noise crackle (bandpass-filtered white noise)
  const bufLen = ctx.sampleRate * 3;
  const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data   = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  const noise   = ctx.createBufferSource();
  noise.buffer  = buf;
  noise.loop    = true;
  const nFilt   = ctx.createBiquadFilter();
  nFilt.type    = 'bandpass';
  nFilt.frequency.setValueAtTime(380, ctx.currentTime);
  nFilt.Q.setValueAtTime(0.6, ctx.currentTime);
  const nGain   = ctx.createGain();
  nGain.gain.setValueAtTime(0.007, ctx.currentTime);
  noise.connect(nFilt);
  nFilt.connect(nGain);
  nGain.connect(ctx.destination);
  noise.start();

  state.audioCtx   = ctx;
  state.audioNodes = { osc, gain, noise, nGain };
  state.audioReady = true;

  // Wire mute button now that audio exists
  document.getElementById('mute-btn').addEventListener('click', () => {
    state.muted = !state.muted;
    const target = state.muted ? 0 : 0.028;
    const nTarget= state.muted ? 0 : 0.007;
    gain.gain.setTargetAtTime(target, ctx.currentTime, 0.6);
    nGain.gain.setTargetAtTime(nTarget, ctx.currentTime, 0.6);
    document.getElementById('mute-btn').textContent = state.muted ? '◎ unmute' : '◎ mute';
  });
}

// ─── Phase transitions ──────────────────────────────────────────────────────
function awaken() {
  if (state.awakened) return;
  state.awakened = true;
  state.phase    = 'observation';

  const veil = document.getElementById('landing-veil');
  veil.style.opacity = '0';
  setTimeout(() => { veil.style.display = 'none'; }, 2500);

  document.body.classList.add('awakened');

  if (state.environment.returnVisit && state.memory) {
    setTimeout(() => showTextFragment(TEXT_POOLS.returning[0]), 1600);
  } else {
    setTimeout(() => showTextFragment(TEXT_POOLS.arrival[0]), 2200);
  }

  try { initAudio(); } catch (_) {}
  window.addEventListener('beforeunload', saveMirrorMemory);
}

// ─── Diagnostics ────────────────────────────────────────────────────────────
function updateDiagnostics() {
  const el = document.getElementById('diagnostics');
  if (!el || el.hidden) return;

  const env = state.environment;
  const p   = state.portrait;
  const i   = state.interaction;

  el.innerHTML =
    `<strong>environment</strong><br>` +
    `browser: ${env.browser} | os: ${env.os}<br>` +
    `screen: ${env.screenW}×${env.screenH} @${env.pixelRatio}x<br>` +
    `touch: ${env.touch} | dark: ${env.darkMode}<br>` +
    `lang: ${env.lang} | tz: ${env.tz}<br>` +
    `hour: ${env.hour} (${env.dayPhase}) | warm: ${p.lightWarm.toFixed(2)}<br>` +
    `storage: ${env.storage} | return: ${env.returnVisit}<br>` +
    `<br><strong>portrait</strong><br>` +
    `convergence: ${p.convergence.toFixed(3)}<br>` +
    `jitter: ${p.jitter.toFixed(3)} | panic: ${p.panic.toFixed(3)}<br>` +
    `brightness: ${p.brightness.toFixed(3)}<br>` +
    `crack: ${p.crack.toFixed(3)} | erasure: ${p.erasure.toFixed(3)}<br>` +
    `pulse: ${p.pulse.toFixed(3)} | tremor: ${p.typeTremor.toFixed(3)}<br>` +
    `sinkDepth: ${p.sinkDepth.toFixed(3)} | smear: ${p.smear.toFixed(3)}<br>` +
    `breathDepth: ${p.breathDepth.toFixed(3)}<br>` +
    `autonomy: ${p.autonomy.toFixed(3)}<br>` +
    `split: ${p.split.toFixed(3)} | desync: ${p.desync.toFixed(3)}<br>` +
    `resizeInjury: ${p.resizeInjury.toFixed(3)}<br>` +
    `phase: ${state.phase}<br>` +
    `<br><strong>memory</strong><br>` +
    `visits: ${state.memory ? state.memory.visits : 0}<br>` +
    `scars: ${state.memory ? state.memory.scars.length : 0}`;
}

// ─── Main Loop ──────────────────────────────────────────────────────────────
let lastFrameTime = Date.now();

function mainLoop() {
  const now = Date.now();
  const dt  = Math.min(now - lastFrameTime, CONFIG.maxFrameDeltaMs);
  lastFrameTime = now;

  if (state.awakened || state.phase === 'landing') {
    updatePortraitState(dt);
    renderMirror();
  } else {
    // Still render lightly during landing so shards are visible behind veil
    renderMirror();
  }

  const sessionSec = (now - state.startTime) / 1000;
  if (state.awakened) {
    if (sessionSec > 35  && state.phase === 'observation')  state.phase = 'interaction';
    if (sessionSec > 100 && state.phase === 'interaction')  state.phase = 'recognition';
  }

  requestAnimationFrame(mainLoop);
}

// ─── Init ────────────────────────────────────────────────────────────────────
function init() {
  collectEnvironment();
  loadMirrorMemory();
  buildVisitorProfile();
  rebuildShards();
  trackInteraction();

  // Activate the custom cursor (hides the system pointer via CSS body.js-cursor)
  document.body.classList.add('js-cursor');

  // Ambient text timer
  setInterval(() => {
    if (state.awakened) generateTextFragments();
  }, CONFIG.textInterval);

  // Diagnostics refresh
  setInterval(updateDiagnostics, 500);

  // Controls
  document.getElementById('begin-btn').addEventListener('click', awaken);
  document.getElementById('clear-memory-btn').addEventListener('click', clearMirrorMemory);
  document.getElementById('diag-btn').addEventListener('click', () => {
    const d    = document.getElementById('diagnostics');
    const open = d.hidden;
    d.hidden   = !open;
    document.getElementById('diag-btn').setAttribute('aria-expanded', String(open));
    document.getElementById('diag-btn').textContent = open ? '⊙ hide' : '⊙ reveal';
  });

  // Begin on any mouse/touch interaction (also wired in trackInteraction for mousemove)
  document.addEventListener('click',      awaken, { once: true });
  document.addEventListener('touchstart', awaken, { once: true, passive: true });

  // Auto-awaken after 7 s if visitor is motionless
  setTimeout(awaken, 7000);

  mainLoop();
}

window.addEventListener('DOMContentLoaded', init);
