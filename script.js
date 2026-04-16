/* ─── The Mirror — script.js ──────────────────────────────────────────────────
 *
 * Architecture
 * ────────────
 *  collectEnvironment()  → reads browser / device / locale signals once
 *  trackInteraction()    → wires event listeners; updates state.interaction
 *  buildVisitorProfile() → translates raw signals into artistic portrait params
 *  updatePortraitState() → evolves portrait params each animation frame
 *  renderMirror()        → draws one canvas frame (shards, glow, eyes, noise)
 *  generateTextFragments()→ generates nonsensical ambient text from user input
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
    typing            : { count: 0, deletions: 0, lastTime: 0, rhythm: 0, buffer: '' },
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

    // Environment-driven artistic parameters (set once in buildVisitorProfile,
    // then threaded through rendering each frame).
    // Grouped by the three artistic dimensions: structure, material, behaviour.
    env: {
      // ── Structure ──
      edgeQuality:     0.5,  // 0 = brutal/thick cuts   1 = hairline/delicate fractures
      symmetry:        0.5,  // 0 = wild asymmetry       1 = rigid mechanical symmetry
      anatomyHardness: 0.5,  // 0 = smooth organic curves 1 = hard angles/hinges
      compressionY:    0,    // −1 = cathedral-tall stretch  0 = neutral  1 = coffin-compressed
      shardDensity:    1.0,  // multiplier on grid rows/cols (hardware-driven)
      secondaryEyes:   0,    // 0–3 count of peripheral almost-faces in the darkness
      intimacy:        0.5,  // 0 = distant/surgical gaze  1 = skin-close/touch-intimate
      sovereignty:     1.0,  // 0 = caged/nested (webview) 1 = sovereign/full window

      // ── Material ──
      surfaceWet:      0.5,  // 0 = dry ash/dust   1 = wet lacquer/black water
      grainCoarse:     0.5,  // 0 = fine silver dust  1 = rough brutal grain
      specularWidth:   0.5,  // 0 = broad milky wash  1 = razor-sharp glint
      lacquer:         0,    // 0 = raw glass   1 = sealed/varnished/fogged
      paletteR:        185,  // base tint R — influenced by mode + browser + hour
      paletteG:        198,  // base tint G
      paletteB:        220,  // base tint B
      bgR: 2, bgG: 2, bgB: 5,  // chamber background colour

      // ── Behaviour ──
      motionScale:     1.0,  // 0 = ritual stillness  1 = full predatory motion
      approachSpeed:   1.0,  // multiplier on convergence rate (visit pattern)
      idleRestless:    0.5,  // 0 = serene held breath  1 = predatory self-animation
      driftDir:        1,    // 1 = LTR drift   −1 = RTL drift
      anticipation:    0.5,  // 0 = purely reactive   1 = moves before input
    },
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
    const e = p.env;

    // Base colour — tinted by environment palette, warmed by time of day
    const base  = this.inPortrait * p.convergence * p.brightness;
    const glow  = this.glowNow;
    const pls   = this.inPortrait * p.pulse * 0.12;
    const crk   = (p.crack > 0.3 && this.isCracked) ? 0.25 : 1;

    const lum   = (base * 0.50 + glow * 0.28 + pls) * crk;

    // Palette from environment (cold silver / warm porcelain / etc)
    const pR = e.paletteR, pG = e.paletteG, pB = e.paletteB;
    const R     = Math.min(255, Math.floor(lum * pR * (0.78 + p.lightWarm * 0.22) / 185));
    const G     = Math.min(255, Math.floor(lum * pG / 185));
    const B     = Math.min(255, Math.floor(lum * pB * (1.05 - p.lightWarm * 0.08) / 185));
    const alpha = Math.min(0.82, 0.04 + base * 0.35 + glow * 0.22);

    // Surface wetness adds a subtle alpha boost (wet surfaces catch more light)
    const wetAlpha = Math.min(0.88, alpha + e.surfaceWet * 0.04 * base);

    // Lacquer: sealed varnished surface reduces contrast variation
    const finalAlpha = e.lacquer > 0
      ? wetAlpha * (1 - e.lacquer * 0.25) + e.lacquer * 0.12
      : wetAlpha;

    ctx.beginPath();
    ctx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
    ctx.closePath();
    ctx.fillStyle = `rgba(${R},${G},${B},${finalAlpha})`;
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
      // Specular width: sharp (fine pointer, high DPI) → thinner brighter line
      //                 broad (coarse pointer, low DPI) → wider milkier wash
      const specMul = 0.7 + e.specularWidth * 0.6;
      const eR = Math.min(255, R + Math.floor(55 * specMul));
      const eG = Math.min(255, G + Math.floor(50 * specMul));
      const eB = Math.min(255, B + Math.floor(60 * specMul));
      const va = verts[bestI], vb = verts[(bestI + 1) % verts.length];
      ctx.beginPath();
      ctx.moveTo(va.x, va.y);
      ctx.lineTo(vb.x, vb.y);
      ctx.strokeStyle = `rgba(${eR},${eG},${eB},${Math.min(0.72, ea * specMul)})`;
      // Edge quality: high DPI → hairline (0.3), low DPI → brutal (1.2)
      ctx.lineWidth = 0.3 + (1 - e.edgeQuality) * 0.9;
      ctx.stroke();

      // Surface wetness → add a second, fainter, broader specular reflection
      if (e.surfaceWet > 0.5) {
        ctx.strokeStyle = `rgba(${eR},${eG},${eB},${ea * 0.12 * e.surfaceWet})`;
        ctx.lineWidth = 1.2 + (1 - e.edgeQuality) * 0.8;
        ctx.stroke();
      }
    }
  }
}

// ─── Module 1 — Collect Environment ────────────────────────────────────────
function collectEnvironment() {
  const env = {};
  const ua  = navigator.userAgent.toLowerCase();

  // ── Browser family ──
  if      (ua.includes('firefox'))   env.browser = 'firefox';
  else if (ua.includes('edg/'))      env.browser = 'edge';
  else if (ua.includes('chrome'))    env.browser = 'chrome';
  else if (ua.includes('safari'))    env.browser = 'safari';
  else                               env.browser = 'other';

  // Webview detection — embedded browsers feel less sovereign
  env.isWebview = /wv|webview|fbav|fban|instagram|twitter|snapchat|pinterest/i.test(ua);

  // ── OS / platform ──
  if      (ua.includes('android'))                       env.os = 'android';
  else if (ua.includes('iphone') || ua.includes('ipad')) env.os = 'ios';
  else if (ua.includes('windows'))                       env.os = 'windows';
  else if (ua.includes('mac'))                           env.os = 'mac';
  else if (ua.includes('linux'))                         env.os = 'linux';
  else                                                   env.os = 'other';

  // ── Screen & viewport ──
  env.screenW     = screen.width;
  env.screenH     = screen.height;
  env.pixelRatio  = window.devicePixelRatio || 1;
  env.viewportW   = window.innerWidth;
  env.viewportH   = window.innerHeight;
  env.aspectRatio = env.viewportW / Math.max(1, env.viewportH);

  // Aspect character: cathedral-tall (<0.55), coffin-narrow (0.55-0.72),
  // normal (0.72-1.5), wide (1.5-2.2), ultra-wide (>2.2)
  if      (env.aspectRatio < 0.55) env.aspectClass = 'cathedral';
  else if (env.aspectRatio < 0.72) env.aspectClass = 'coffin';
  else if (env.aspectRatio < 1.5)  env.aspectClass = 'normal';
  else if (env.aspectRatio < 2.2)  env.aspectClass = 'wide';
  else                             env.aspectClass = 'ultrawide';

  // Very small viewport = suffocated pocket-sized portrait
  env.isTiny = env.viewportW < 380 || env.viewportH < 500;

  // ── Input capabilities ──
  env.touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

  // Pointer precision: coarse (finger), fine (mouse/trackpad)
  env.pointerCoarse = window.matchMedia('(pointer: coarse)').matches;
  env.pointerFine   = window.matchMedia('(pointer: fine)').matches;

  // Hover capability: does the primary input allow sustained hover?
  env.hoverCapable  = window.matchMedia('(hover: hover)').matches;

  // Screen orientation (mobile)
  env.orientation = (env.viewportH > env.viewportW) ? 'portrait' : 'landscape';

  // ── Preferences ──
  env.darkMode          = window.matchMedia('(prefers-color-scheme: dark)').matches;
  env.lightMode         = window.matchMedia('(prefers-color-scheme: light)').matches;
  env.reducedMotion     = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  env.reducedTransparency = window.matchMedia('(prefers-reduced-transparency: reduce)').matches;

  // ── Language / locale ──
  env.lang      = navigator.language || 'en';
  env.languages = navigator.languages ? Array.from(navigator.languages) : [env.lang];
  env.langCount = env.languages.length;

  // RTL detection — check if primary language uses right-to-left script
  const rtlCodes = ['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'yi', 'ku'];
  const primaryLangBase = env.lang.split('-')[0].toLowerCase();
  env.isRTL = rtlCodes.includes(primaryLangBase);

  // ── Timezone / time ──
  try { env.tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) { env.tz = 'UTC'; }

  // UTC offset in hours (distance from UTC centre)
  const offsetMin = new Date().getTimezoneOffset();
  env.utcOffsetHours = -offsetMin / 60;
  env.tzDistance = Math.abs(env.utcOffsetHours); // 0–12 from UTC centre

  const hour  = new Date().getHours();
  env.hour    = hour;
  if      (hour >= 5  && hour < 8)  env.dayPhase = 'dawn';
  else if (hour >= 8  && hour < 12) env.dayPhase = 'morning';
  else if (hour >= 12 && hour < 14) env.dayPhase = 'noon';
  else if (hour >= 14 && hour < 17) env.dayPhase = 'afternoon';
  else if (hour >= 17 && hour < 21) env.dayPhase = 'dusk';
  else                              env.dayPhase = 'night';

  // ── Hardware ──
  env.hardwareConcurrency = navigator.hardwareConcurrency || 2;
  env.deviceMemory        = navigator.deviceMemory || 4;  // GB, Safari returns undefined

  // ── Fullscreen state ──
  env.isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);

  // ── Storage availability ──
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
    if (e.key === 'Backspace' || e.key === 'Delete') {
      typ.deletions++;
      typ.buffer = typ.buffer.slice(0, -1);
    } else if (e.key.length === 1) {
      typ.buffer += e.key;
      if (typ.buffer.length > 600) typ.buffer = typ.buffer.slice(-400);
    }
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
// The artistic mapping engine.
// Every passive environment signal is mapped across three dimensions:
//   1. Structure  — shape, skeleton, geometry, density
//   2. Material   — texture, light, palette, surface quality
//   3. Behaviour  — motion, tempo, anticipation, approach
//
function buildVisitorProfile() {
  const env = state.environment;
  const p   = state.portrait;
  const e   = p.env;

  // ─── Analyse memory for visit patterns ───────────────────────────────────
  let visitPattern = 'first';  // first | frequent | sparse | brief | devoted
  let absenceHours = 0;
  if (state.memory && state.memory.visits > 0) {
    const now = Date.now();
    absenceHours = (now - (state.memory.lastVisit || now)) / 3600000;
    const avgGap = state.memory.visits > 1
      ? (now - (state.memory.firstVisit || now)) / state.memory.visits / 3600000
      : Infinity;
    const avgScarConvergence = state.memory.scars && state.memory.scars.length
      ? state.memory.scars.reduce((s, sc) => s + sc.convergence, 0) / state.memory.scars.length
      : 0;

    if (state.memory.visits >= 5 && avgGap < 24)       visitPattern = 'frequent';
    else if (state.memory.visits >= 3 && avgGap > 168)  visitPattern = 'sparse';
    else if (avgScarConvergence < 0.3)                  visitPattern = 'brief';
    else if (avgScarConvergence > 0.6)                  visitPattern = 'devoted';
    else                                                visitPattern = 'returning';
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  TIMEZONE + HOUR → light angle, warmth, mood
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const h = env.hour || 12;

  // Structure: tilt of figure and dominant shard cluster position
  p.lightAngle = ((h / 24) * Math.PI * 2) - Math.PI * 0.5;
  // Far from UTC centre → slanted, migratory light
  p.lightAngle += (env.tzDistance || 0) * 0.015;

  // Material: warmth — dawn=cold/washed, noon=harsh/clinical, dusk=warm/devotional, night=cold/intimate
  const hourPhaseMap = {
    dawn:      { warm: 0.08, mood: 'washed' },
    morning:   { warm: 0.22, mood: 'pale' },
    noon:      { warm: 0.55, mood: 'clinical' },
    afternoon: { warm: 0.42, mood: 'exposed' },
    dusk:      { warm: 0.62, mood: 'devotional' },
    night:     { warm: 0.05, mood: 'predatory' },
  };
  const hourData = hourPhaseMap[env.dayPhase] || hourPhaseMap.night;
  p.lightWarm = hourData.warm;

  // Behaviour: tempo — night is slower/more intimate, noon is impatient
  const hourTempoMap = { dawn: 0.6, morning: 0.8, noon: 1.0, afternoon: 0.9, dusk: 0.7, night: 0.5 };
  const hourTempo = hourTempoMap[env.dayPhase] || 0.7;

  // Behaviour: idle character — night lets the apparition be more predatory
  const hourRestless = { dawn: 0.3, morning: 0.4, noon: 0.3, afternoon: 0.4, dusk: 0.5, night: 0.8 };
  e.idleRestless = hourRestless[env.dayPhase] || 0.5;

  // Behaviour: midnight-to-dawn wakes autonomous behaviour
  if (h >= 0 && h < 5) {
    e.idleRestless = Math.min(1, e.idleRestless + 0.2);
    e.anticipation = 0.7;  // moves before expected
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  BROWSER → shard geometry, surface, facial architecture
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const browserMap = {
    chrome:  { bias: 0.55, symmetry: 0.72, specular: 0.55, wet: 0.45, name: 'industrial' },
    firefox: { bias: 0.22, symmetry: 0.30, specular: 0.40, wet: 0.55, name: 'feral' },
    safari:  { bias: 0.82, symmetry: 0.68, specular: 0.70, wet: 0.78, name: 'lacquered' },
    edge:    { bias: 0.62, symmetry: 0.85, specular: 0.48, wet: 0.35, name: 'bureaucratic' },
    other:   { bias: 0.38, symmetry: 0.50, specular: 0.45, wet: 0.50, name: 'unknown' },
  };
  const bData = browserMap[env.browser] || browserMap.other;

  // Structure: shard tessellation geometry bias
  p.shardBias   = bData.bias;
  e.symmetry    = bData.symmetry;

  // Material: surface character
  e.surfaceWet     = bData.wet;
  e.specularWidth  = bData.specular;

  // Webview: partially caged, less sovereign
  if (env.isWebview) {
    e.sovereignty = 0.45;
    e.symmetry   *= 0.8;  // less confident geometry
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  OS → skeleton, posture, anatomy hardness
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const osMap = {
    windows: { shift:  0.03, hardness: 0.72, name: 'framed' },      // frame-like, hinges, angles
    mac:     { shift: -0.04, hardness: 0.30, name: 'controlled' },   // smooth, cold elegance
    linux:   { shift:  0.08, hardness: 0.55, name: 'assembled' },    // wirier, stranger distribution
    android: { shift:  0.06, hardness: 0.48, name: 'mosaic' },       // fractured mosaics, thumb-close
    ios:     { shift: -0.06, hardness: 0.25, name: 'reliquary' },    // sealed-glass, polished wounds
    other:   { shift:  0,    hardness: 0.50, name: 'unknown' },
  };
  const oData = osMap[env.os] || osMap.other;

  // Structure: skeleton lateral shift + anatomy hardness
  p.skeletonShift   = oData.shift;
  e.anatomyHardness = oData.hardness;

  // Material: OS also affects surface — iOS/Mac more polished, Windows/Linux rougher
  if (env.os === 'ios' || env.os === 'mac') {
    e.surfaceWet = Math.min(1, e.surfaceWet + 0.15);
  } else if (env.os === 'windows' || env.os === 'linux') {
    e.surfaceWet = Math.max(0, e.surfaceWet - 0.10);
  }

  // Android: thumb-close intimacy boost
  if (env.os === 'android') {
    e.intimacy = Math.min(1, e.intimacy + 0.15);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  PIXEL DENSITY → edge quality, grain coarseness
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // High-DPI: hairline fractures, delicate silver filigree, fine dust
  // Low-DPI:  thicker cuts, rougher grain, brutal fragmentation
  const dpr = env.pixelRatio || 1;
  e.edgeQuality = Math.min(1, (dpr - 1) / 2);       // 1x→0, 2x→0.5, 3x→1
  e.grainCoarse = Math.max(0, 1 - (dpr - 1) / 2);   // inverse of edge quality
  e.specularWidth = Math.min(1, e.specularWidth + e.edgeQuality * 0.15);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  VIEWPORT & ASPECT → compression, intimacy, sovereignty
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Structure: cathedral-tall stretches the figure into saintly thinness
  //            coffin-narrow compresses and suffocates
  //            wide makes it architectural and severe
  const aspectCompression = {
    cathedral: -0.7, coffin: -0.4, normal: 0, wide: 0.35, ultrawide: 0.6,
  };
  e.compressionY = aspectCompression[env.aspectClass] || 0;

  // Narrow screens force intimacy — the figure crowds the visitor
  if (env.viewportW < 600) {
    e.intimacy = Math.min(1, e.intimacy + 0.25);
  }
  // Wide screens make it distant, architectural
  if (env.viewportW > 1600) {
    e.intimacy = Math.max(0, e.intimacy - 0.15);
  }

  // Very small viewports: suffocated, pocket-sized
  if (env.isTiny) {
    e.compressionY = Math.min(e.compressionY + 0.3, 1);
    e.sovereignty  = Math.max(0, e.sovereignty - 0.2);
  }

  // Fullscreen: apparition more confident, complete, invasive
  if (env.isFullscreen) {
    e.sovereignty = 1.0;
    e.anticipation = Math.min(1, e.anticipation + 0.15);
  } else {
    // Browser chrome = fragmented, ashamed, interrupted
    e.sovereignty = Math.max(0.4, e.sovereignty - 0.15);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  INPUT TYPE → touch/pointer/hover intimacy and wound character
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (env.touch) {
    // Touch: smears, fingerprints, pressure-ripples, skin-close
    e.intimacy = Math.min(1, e.intimacy + 0.20);
    e.edgeQuality = Math.max(0, e.edgeQuality - 0.10);  // slightly more blunt
  } else {
    // Non-touch: distant, gaze-based, surgical
    e.intimacy = Math.max(0, e.intimacy - 0.10);
  }

  if (env.pointerCoarse) {
    // Coarse pointer: larger, slower, more ceremonial responses
    e.specularWidth = Math.max(0, e.specularWidth - 0.10);
  }
  if (env.pointerFine) {
    // Fine pointer: needle-like precision, subtler injuries
    e.specularWidth = Math.min(1, e.specularWidth + 0.10);
    e.edgeQuality   = Math.min(1, e.edgeQuality + 0.08);
  }

  if (!env.hoverCapable) {
    // No hover: contact is more abrupt, portrait reacts as if struck
    e.anticipation = Math.max(0, e.anticipation - 0.2);
  } else {
    // Hover: hesitation is heat, ember-spots, glowing wounds
    e.anticipation = Math.min(1, e.anticipation + 0.1);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  DARK/LIGHT MODE → palette, material, depth
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (env.lightMode && !env.darkMode) {
    // Light mode: porcelain glare, ash-glass, pallid chrome, exposed dust, bone-like
    e.paletteR = 210; e.paletteG = 205; e.paletteB = 198;  // warmer, paler, ashier
    e.bgR = 12; e.bgG = 11; e.bgB = 10;                    // dark grey instead of pure black
    e.surfaceWet  = Math.max(0, e.surfaceWet - 0.30);       // drier, dustier
    e.grainCoarse = Math.min(1, e.grainCoarse + 0.15);      // more exposed dust
    p.lightWarm   = Math.min(1, p.lightWarm + 0.12);        // harsher, more interrogative
  } else {
    // Dark mode (default): black water, obsidian, wet lacquer, silver seam-light
    e.paletteR = 185; e.paletteG = 198; e.paletteB = 220;   // cold silver
    e.bgR = 2; e.bgG = 2; e.bgB = 5;                        // deep black
    e.surfaceWet  = Math.min(1, e.surfaceWet + 0.10);        // wetter
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  REDUCED MOTION → ritualistic stillness, not disabled
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (env.reducedMotion) {
    e.motionScale   = 0.15;   // eerily still, ceremonial, breath-held
    e.idleRestless  = 0.1;    // nearly frozen
    e.anticipation  = Math.min(1, e.anticipation + 0.2);  // compensate with gaze/light shifts
  } else {
    e.motionScale = 1.0;      // full drift, recoil, flutter, predatory anticipation
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  REDUCED TRANSPARENCY → fogged, varnished, trapped behind old glass
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (env.reducedTransparency) {
    e.lacquer = 0.65;    // sealed behind varnish
    e.surfaceWet = Math.min(1, e.surfaceWet + 0.15);
    e.grainCoarse = Math.min(1, e.grainCoarse + 0.10);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  LANGUAGE → text drift, whisper layers, RTL direction
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Multiple languages: overlapping whisper-layers, the mirror cannot decide which tongue
  // This is stored; text fragment generation will use it.

  // RTL: reverse drift direction
  e.driftDir = env.isRTL ? -1 : 1;

  // Locale/timezone mismatch can split the face —
  // detected if timezone region doesn't match language region
  // (e.g. 'en-US' lang but Asia/Tokyo timezone)

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  HARDWARE → shard density, secondary eyes, detail level
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const cores = env.hardwareConcurrency || 2;
  const mem   = env.deviceMemory || 4;

  // High concurrency: spawn secondary almost-faces in peripheral shards
  e.secondaryEyes = cores >= 8 ? Math.min(3, Math.floor((cores - 6) / 2)) : 0;

  // Shard density: more capable machines get denser, more detailed grids
  // Weaker devices get fewer, heavier, more symbolic forms
  if (mem >= 8 && cores >= 6) {
    e.shardDensity = 1.3;   // deeper, more layered
  } else if (mem <= 2 || cores <= 2) {
    e.shardDensity = 0.7;   // monastic, iconic, fewer forms
  } else {
    e.shardDensity = 1.0;
  }

  // Touch + low hardware: reduce density further for performance
  if (env.touch && env.viewportW < 900 && mem <= 4) {
    e.shardDensity = Math.min(e.shardDensity, 0.75);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  ORIENTATION (mobile) → upright saint-icon vs recumbent relic
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // (This is accounted for through aspectClass, but if landscape on mobile,
  //  the figure could feel more recumbent / drowned / horizontal altar-piece)
  if (env.touch && env.orientation === 'landscape') {
    e.compressionY = Math.min(1, e.compressionY + 0.2);  // recumbent shift
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  STORAGE + RETURN VISIT → memory behaviour, approach speed
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (!env.storage) {
    // Blocked storage: portrait forgetful, slipping edges, unstable memory
    p.convergence = Math.max(p.convergence - 0.1, 0);
    e.surfaceWet  = Math.max(0, e.surfaceWet - 0.15);  // newborn, not weathered
    e.approachSpeed = 0.6;                                // keeps relearning
  }

  if (state.memory && state.memory.visits > 0) {
    const returnBoost = Math.min(0.65, 0.18 + state.memory.visits * 0.08);
    p.convergence = Math.max(p.convergence, returnBoost);

    // Inherit prior scars
    if (state.memory.scars && state.memory.scars.length) {
      const lastScar = state.memory.scars[0];
      p.crack   = lastScar.crack * 0.5;
      p.erasure = (lastScar.erasure || 0) * 0.35;
    }

    // Visit pattern → approach speed and surface weathering
    switch (visitPattern) {
      case 'frequent':
        // Frighteningly efficient, assembles too quickly
        e.approachSpeed = 1.8;
        e.surfaceWet = Math.min(1, e.surfaceWet + 0.10);  // well-worn
        e.anticipation = Math.min(1, e.anticipation + 0.2);
        break;
      case 'sparse':
        // Long absence: dusty, faded, abandoned, then gradually remembers
        e.approachSpeed = 0.5;
        e.surfaceWet = Math.max(0, e.surfaceWet - 0.15);  // dried out
        e.grainCoarse = Math.min(1, e.grainCoarse + 0.10); // dusty
        break;
      case 'brief':
        // Many short visits: skittish, incomplete, suspicious
        e.approachSpeed = 0.8;
        e.idleRestless  = Math.min(1, e.idleRestless + 0.15);
        break;
      case 'devoted':
        // Fewer long visits: calmer, more intimate, anatomically coherent
        e.approachSpeed = 1.2;
        e.intimacy     = Math.min(1, e.intimacy + 0.10);
        e.idleRestless = Math.max(0, e.idleRestless - 0.10);
        break;
      default:
        e.approachSpeed = 1.0;
    }

    // Timezone changed between visits → geographic haunting, split face
    if (state.memory.tz && state.memory.tz !== env.tz) {
      e.symmetry = Math.max(0, e.symmetry - 0.15);
    }
  } else if (visitPattern === 'first') {
    // First-time visitors: more abstract, suspiciously incomplete
    e.approachSpeed = 0.7;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  COMPOUND CONDITIONS — special combinations
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Disabled storage + reduced motion → priestly, withheld, untouchable
  if (!env.storage && env.reducedMotion) {
    e.lacquer  = Math.min(1, e.lacquer + 0.3);
    e.intimacy = Math.max(0, e.intimacy - 0.2);
  }

  // Full capability (storage, motion, hover, long session) → dangerously intimate
  if (env.storage && !env.reducedMotion && env.hoverCapable && visitPattern === 'devoted') {
    e.intimacy     = Math.min(1, e.intimacy + 0.15);
    e.anticipation = Math.min(1, e.anticipation + 0.15);
  }

  // ── Final behaviour modulation ──
  e.motionScale   = Math.max(0, Math.min(1, e.motionScale * hourTempo));
  e.approachSpeed = Math.max(0.3, Math.min(2.0, e.approachSpeed));
}

// ─── Portrait silhouette density ───────────────────────────────────────────
// Returns 0–1 brightness weight for a canvas position (nx, ny ∈ [0,1]).
// Defines the humanoid shape that shards gradually reveal.
// anatomyHardness (0=smooth organic  1=hard angular) changes falloff sharpness.
function portraitDensity(nx, ny, skeletonShift) {
  const shift = skeletonShift || 0;
  const cx    = 0.5 + shift;
  const hard  = state.portrait.env.anatomyHardness;
  const comp  = state.portrait.env.compressionY;

  // Compression stretches/compresses the Y coordinate around centre (0.42)
  // Negative compression = cathedral-tall (stretch), positive = coffin-compressed
  const centreY = 0.42;
  const adjustedNy = centreY + (ny - centreY) * (1 + comp * 0.3);

  // Hardness modulates the falloff exponent:
  // soft (0) → gradual smooth falloff, hard (1) → sharper edges
  const falloff = 1 + hard * 1.2;  // 1.0 (smooth) to 2.2 (angular)

  function shapeField(cx_, cy_, rx, ry, weight) {
    const d = Math.sqrt(((nx - cx_) / rx) ** 2 + ((adjustedNy - cy_) / ry) ** 2);
    return Math.max(0, Math.pow(Math.max(0, 1 - d), falloff)) * weight;
  }

  const head      = shapeField(cx, 0.270, 0.098, 0.120, 1.0);
  const neck      = shapeField(cx, 0.400, 0.032, 0.080, 0.80);
  const lShoulder = shapeField(cx - 0.155, 0.490, 0.110, 0.065, 0.90);
  const rShoulder = shapeField(cx + 0.155, 0.490, 0.110, 0.065, 0.90);
  const chest     = shapeField(cx, 0.540, 0.120, 0.060, 0.72);
  const torso     = shapeField(cx, 0.630, 0.105, 0.080, 0.52);

  return Math.min(1.0, Math.max(head, neck, lShoulder, rShoulder, chest, torso));
}

// ─── Module 4 — Update Portrait State (per frame) ──────────────────────────
function updatePortraitState(dt) {
  const p    = state.portrait;
  const e    = p.env;
  const inter = state.interaction;
  const now  = Date.now();
  const ms   = e.motionScale;   // 0–1 — reduced motion makes everything ritualistic
  const as   = e.approachSpeed; // multiplier on convergence rate

  // --- Autonomy: builds during stillness, richer idle motion ---
  const idleMs = now - inter.lastMoveTime;
  const idleCeiling = Math.max(0.3, e.idleRestless);  // restless devices let autonomy build higher
  const targetAutonomy = Math.min(idleCeiling, idleMs / (CONFIG.idleThreshold * 1.8));
  p.autonomy = p.autonomy + (targetAutonomy - p.autonomy) * (dt / 1000) * ms;

  // --- Jitter: cursor speed drives fragmentation ---
  const targetJitter = Math.min(1, inter.cursorSmooth * 22);
  p.jitter = p.jitter + (targetJitter - p.jitter) * (dt / 220);

  // --- Panic: extreme cursor speed → shard multiplication ---
  const panicThreshold = 0.06;
  const panicRange     = 0.12;
  const rawPanic = Math.max(0, inter.cursorSmooth - panicThreshold) / panicRange;
  const targetPanic = Math.min(1, rawPanic);
  p.panic = p.panic + (targetPanic - p.panic) * (dt / 160) * ms;

  // --- Convergence: assembles over time + calm moments; slow cursor accelerates ---
  const sessionSec   = (now - state.startTime) / 1000;
  const calmFactor   = 1 - Math.max(p.jitter, p.panic);
  const calmBoost    = calmFactor * 0.0012 * as;
  const timeBoost    = Math.min(0.0014, sessionSec * 0.000015) * as;
  const targetConv   = Math.min(0.95, p.convergence + calmBoost + timeBoost);
  p.convergence = p.convergence + (targetConv - p.convergence) * (dt / 600);

  // Fast cursor actively tears apart convergence
  if (p.jitter > 0.5) {
    p.convergence = Math.max(0, p.convergence - p.jitter * 0.0008 * dt);
  }

  // Anticipation: mirror sometimes moves toward convergence before input warrants it
  if (e.anticipation > 0.4 && p.convergence < 0.5 && sessionSec > 8) {
    const anticipateBoost = (e.anticipation - 0.4) * 0.0004 * dt;
    p.convergence = Math.min(0.5, p.convergence + anticipateBoost);
  }

  // --- Pulse: typing creates a heartbeat ---
  const sinceType = now - inter.typing.lastTime;
  p.pulse = sinceType < 2800 ? Math.max(0, 1 - sinceType / 2800) : Math.max(0, p.pulse - dt * 0.0004);

  // --- Type tremor: burst typing → cracked articulation, jaw/rib flashes ---
  const targetTremor = inter.typingBurstIntensity;
  p.typeTremor = p.typeTremor + (targetTremor - p.typeTremor) * (dt / 150) * ms;
  inter.typingBurstIntensity *= (1 - dt * 0.0028);

  // --- Crack: built from high deletion ratio ---
  const delRatio     = inter.typing.count > 5 ? inter.typing.deletions / inter.typing.count : 0;
  const targetCrack  = Math.min(1, delRatio * 2.2);
  p.crack = p.crack + (targetCrack - p.crack) * (dt / 1500);

  // --- Erasure: deletions cause self-erasure ---
  const targetErasure = Math.min(1, delRatio * 3.2);
  p.erasure = p.erasure + (targetErasure - p.erasure) * (dt / 1000);

  // --- Scroll: violent → smear; gentle → breath ---
  const scrollSpeed = inter.scrollSmooth;
  const targetSmear = Math.min(1, Math.max(0, scrollSpeed - 0.08) * 25);
  p.smear = p.smear + (targetSmear - p.smear) * (dt / 120) * ms;

  const isGentle = scrollSpeed > 0.005 && scrollSpeed < 0.08;
  const targetBreath = isGentle ? Math.min(1, scrollSpeed * 14) : 0;
  p.breathDepth = p.breathDepth + (targetBreath - p.breathDepth) * (dt / 600);

  const targetSink = Math.min(1, inter.scrollVelocity * 60);
  p.sinkDepth = p.sinkDepth + (targetSink - p.sinkDepth) * (dt / 180);
  inter.scrollVelocity *= 0.94;
  inter.scrollSmooth   *= 0.97;

  // --- Resize injury ---
  const targetInjury = inter.resizeInjuryRaw;
  p.resizeInjury = p.resizeInjury + (targetInjury - p.resizeInjury) * (dt / 60);
  inter.resizeInjuryRaw *= (1 - dt * 0.003);
  p.resizeInjury *= (1 - dt * 0.0012);
  if (p.resizeInjury > 0.1) {
    p.convergence = Math.max(0, p.convergence - p.resizeInjury * 0.002 * dt);
  }

  // --- Split / desync ---
  p.split = inter.actionSwitchRate;
  inter.actionSwitchRate *= (1 - dt * 0.003);
  const targetDesync = Math.min(1, inter.actionSwitchRate * 1.6);
  p.desync = p.desync + (targetDesync - p.desync) * (dt / 200) * ms;

  // --- Eye intensity: hover near the head region ---
  const shift   = p.skeletonShift;
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
  const breathLift = p.breathDepth * 0.08;
  const smearDim   = p.smear * 0.12;
  const erasureDim = p.erasure * 0.10;
  // Light mode: brighter base; dark mode: deeper
  const baseBright = (state.environment.lightMode && !state.environment.darkMode) ? 0.34 : 0.26;
  p.brightness = baseBright + p.convergence * 0.46 + breathLift - smearDim - erasureDim;

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
  const e    = state.portrait.env;
  const sk   = state.portrait.skeletonShift;

  // Base grid size — modulated by hardware density and viewport
  const isMobile = env.touch && W < 900;
  const baseRows = isMobile ? CONFIG.shardRowsMobile : CONFIG.shardRowsDesktop;
  const baseCols = isMobile ? CONFIG.shardColsMobile : CONFIG.shardColsDesktop;
  const rows     = Math.max(8, Math.round(baseRows * e.shardDensity));
  const cols     = Math.max(6, Math.round(baseCols * e.shardDensity));

  // Jitter influenced by browser symmetry:
  //   high symmetry → less jitter (more regular, industrial/bureaucratic grid)
  //   low symmetry → more jitter (feral, hand-cut, stranger distribution)
  const jit = CONFIG.shardJitter * (1.2 - e.symmetry * 0.5);

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
  const e      = p.env;
  const t      = Date.now() * 0.001;
  const ms     = e.motionScale;

  // Light direction vector (from lightAngle)
  const lightDx = Math.cos(p.lightAngle);
  const lightDy = Math.sin(p.lightAngle);

  // 1. Background — palette-aware
  ctx.fillStyle = `rgb(${e.bgR},${e.bgG},${e.bgB})`;
  ctx.fillRect(0, 0, W, H);

  // 2. Sink offset — scroll sinks the portrait
  const sinkY = p.sinkDepth * H * 0.06;

  ctx.save();
  ctx.translate(0, sinkY);

  // 2b. Resize injury → geometric shear distortion
  if (p.resizeInjury > 0.04) {
    const shear = p.resizeInjury * 0.08 * Math.sin(t * 12) * ms;
    ctx.transform(1, shear, -shear * 0.5, 1, 0, 0);
  }

  // 2c. Breath depth → gentle vertical oscillation (slow revelation)
  if (p.breathDepth > 0.01) {
    const breathY = Math.sin(t * 0.6) * p.breathDepth * H * 0.012 * ms;
    ctx.translate(0, breathY);
  }

  // 2d. Sovereignty: less sovereign → portrait drawn slightly smaller/contained
  if (e.sovereignty < 0.8) {
    const shrink = 1 - (1 - e.sovereignty) * 0.08;
    const dx = W * (1 - shrink) * 0.5;
    const dy = H * (1 - shrink) * 0.5;
    ctx.translate(dx, dy);
    ctx.scale(shrink, shrink);
  }

  // 3. Autonomous portrait motion — richer idle behaviour
  //    Breathing, head drift, micro-movements, modulated by motionScale
  const autoBase  = p.autonomy;
  const swayAmt   = autoBase * 4.5 * ms;
  const swayX     = Math.sin(t * 0.28) * swayAmt * e.driftDir;
  const swayY     = Math.cos(t * 0.19) * swayAmt * 0.5;
  const breathAmt = autoBase * Math.sin(t * 0.85) * 1.2 * ms;
  const headDrift = autoBase * Math.sin(t * 0.12) * 2.0 * ms * e.driftDir;
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
  const e     = p.env;

  // Head glow — tinted by environment palette
  const headR = Math.min(W, H) * 0.145 * pulse;
  const hg    = ctx.createRadialGradient(cx, headY, 0, cx, headY, headR);
  const ha    = p.convergence * p.brightness * 0.18;
  hg.addColorStop(0,   `rgba(${e.paletteR},${e.paletteG},${e.paletteB},${ha})`);
  hg.addColorStop(0.55,`rgba(${Math.floor(e.paletteR*0.64)},${Math.floor(e.paletteG*0.69)},${Math.floor(e.paletteB*0.78)},${ha * 0.38})`);
  hg.addColorStop(1,   `rgba(${Math.floor(e.paletteR*0.64)},${Math.floor(e.paletteG*0.69)},${Math.floor(e.paletteB*0.78)},0)`);
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.ellipse(cx, headY, headR, headR * 1.22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Shoulder glow
  const shY = H * (0.490 + p.sinkDepth * 0.06);
  const sg  = ctx.createRadialGradient(cx, shY, 0, cx, shY, W * 0.26);
  const sa  = p.convergence * p.brightness * 0.09;
  sg.addColorStop(0,  `rgba(${Math.floor(e.paletteR*0.84)},${Math.floor(e.paletteG*0.86)},${Math.floor(e.paletteB*0.91)},${sa})`);
  sg.addColorStop(1,  `rgba(${Math.floor(e.paletteR*0.84)},${Math.floor(e.paletteG*0.86)},${Math.floor(e.paletteB*0.91)},0)`);
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
  const e      = p.env;

  // Very occasional blink
  const blinkPhase = Math.sin(t * 0.53) * Math.sin(t * 1.3);
  const blink      = blinkPhase > 0.96 ? 0 : 1;

  const baseAlpha = p.convergence * (0.22 + p.eyeIntensity * 0.55) * blink;

  // Intimacy affects eye size — close devices get larger, more penetrating eyes
  const eyeScale = 0.85 + e.intimacy * 0.3;

  for (const side of [-1, 1]) {
    const ex = cx + side * spacing;
    const ey = eyeY + Math.sin(t * 0.18 + side * 0.8) * H * 0.0025 * e.motionScale;

    const targetX = state.interaction.cursorX;
    const targetY = state.interaction.cursorY;
    const lookX   = (targetX / W - 0.5) * W * 0.004 * side;
    const lookY   = (targetY / H - 0.5) * H * 0.003;

    const egR = W * 0.026 * eyeScale;
    const eg  = ctx.createRadialGradient(ex + lookX, ey + lookY, 0, ex, ey, egR);
    eg.addColorStop(0,    `rgba(${e.paletteR},${Math.min(255,e.paletteG+37)},255,${baseAlpha * 0.92})`);
    eg.addColorStop(0.28, `rgba(${Math.floor(e.paletteR*0.84)},${Math.floor(e.paletteG*0.95)},${Math.min(255,e.paletteB+20)},${baseAlpha * 0.52})`);
    eg.addColorStop(1,    `rgba(${Math.floor(e.paletteR*0.84)},${Math.floor(e.paletteG*0.95)},${Math.min(255,e.paletteB+20)},0)`);
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(ex, ey, egR, 0, Math.PI * 2);
    ctx.fill();

    // Pupil
    if (baseAlpha > 0.05) {
      ctx.fillStyle = `rgba(4,4,10,${baseAlpha * 0.88})`;
      ctx.beginPath();
      ctx.arc(ex + lookX, ey + lookY, W * 0.006 * eyeScale, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Secondary peripheral eyes — from high hardware concurrency
  // Dim, smaller, positioned in the darkness around the main figure
  if (e.secondaryEyes > 0 && p.convergence > 0.35) {
    const secAlpha = p.convergence * 0.08 * blink;
    const secPositions = [
      { x: cx - W * 0.18, y: eyeY + H * 0.12 },
      { x: cx + W * 0.19, y: eyeY + H * 0.08 },
      { x: cx - W * 0.08, y: eyeY + H * 0.28 },
    ];
    for (let i = 0; i < Math.min(e.secondaryEyes, secPositions.length); i++) {
      const sp = secPositions[i];
      const sr = W * 0.012;
      const flicker = Math.sin(t * 0.7 + i * 2.3) > 0.4 ? 1 : 0;
      if (!flicker) continue;
      const sg = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, sr);
      sg.addColorStop(0,   `rgba(${e.paletteR},${e.paletteG},${e.paletteB},${secAlpha})`);
      sg.addColorStop(1,   `rgba(${e.paletteR},${e.paletteG},${e.paletteB},0)`);
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sr, 0, Math.PI * 2);
      ctx.fill();
      // Tiny dark pupil
      ctx.fillStyle = `rgba(2,2,5,${secAlpha * 0.6})`;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sr * 0.35, 0, Math.PI * 2);
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

  // Grain coarseness: fine (high DPI) vs rough/brutal (low DPI)
  const grainAlpha = 0.028 + p.env.grainCoarse * 0.025 + p.jitter * 0.035;
  ctx.save();
  ctx.globalAlpha = grainAlpha;
  ctx.globalCompositeOperation = 'screen';
  ctx.drawImage(state.noiseFramePool[state.noiseIdx], 0, 0, W, H);

  // Lacquer: additional fogged overlay (seals the surface)
  if (p.env.lacquer > 0.2) {
    ctx.globalAlpha = p.env.lacquer * 0.06;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = `rgba(${p.env.paletteR},${p.env.paletteG},${p.env.paletteB},1)`;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.restore();
}

// ─── Module 6 — Generate Text Fragments ────────────────────────────────────

// Vocabulary pools — English words, no coherent sentences possible
const FRAG_VOCAB = {
  nouns: [
    'throat','hinge','dust','socket','marrow','enamel','seam','silt','knot',
    'tendon','latch','oxide','filament','membrane','cartilage','residue',
    'aperture','ligament','shale','cortex','follicle','plinth','burr','rind',
    'valve','tallow','gristle','furrow','crevice','patina','dross','chaff',
    'spindle','wick','sinew','clinker','pulp','fascia','nacre','gutter',
    'cuticle','mortar','flange','tuber','stamen','loam','welt','scrim',
  ],
  verbs: [
    'dissolve','unlatch','calcify','evaporate','buckle','ossify','unthread',
    'congeal','refract','molt','corrode','sublimate','sinter','delaminate',
    'anneal','effloresce','vitrify','attenuate','extrude','ablate','accrete',
    'distend','occlude','adhere','cleave','abrade','leach','wick','spall',
    'decant','flux','slake','char','scour','etch','fray','splice','lapse',
  ],
  adjectives: [
    'hollow','translucent','ferric','brittle','vestigial','vitreous','occluded',
    'laminar','anodic','sutured','porous','resinous','nival','alkaline',
    'fibrous','silted','conchoidal','calcareous','indurate','friable','galvanic',
    'cereous','spicular','rugose','pellucid','tumid','sclerotic','glaucous',
  ],
  particles: [
    'through','beneath','against','without','between','across','toward',
    'inside','before','upon','along','amid','despite','around','past',
    'under','within','beyond','above','behind','onto','over',
  ],
  pronouns: [
    'it','this','that','something','nothing','what','which','everything',
    'itself','one','each','neither','both','another','such',
  ],
};

// Structural templates — grammatically shaped, semantically void
// $U = user word (or random noun if no user words), $N = noun, $V = verb,
// $A = adjective, $P = particle, $R = pronoun
const FRAG_TEMPLATES = [
  '$U $V $P the $A $N',
  'the $N $V where $U was $A',
  '$R $V $P $U $P $N',
  '$A $N $V your $U',
  '$U was never $A enough to $V',
  'the $A $U $V $P $N',
  '$P every $N your $U $V',
  '$R $V $U into $A $N',
  'your $U $V where $R $V',
  '$N $P $U $P $A $N',
  'the $U $V $R $P $N',
  '$A $U and $A $N $V',
  '$P $U the $N $V $P $N',
  '$R was $A before $U $V',
  'the $N of your $U $V $A',
  '$U $V until the $N $V',
  '$A $N $P $A $U',
  'your $U the $N $V $P',
  'every $U $V $A $P $N',
  '$R $V $A $P the $U',
  '$N $V your $A $U $P $N',
  '$U and $N $V $P $R',
  'the $A $N of $U $V',
  '$P your $U $R $V $A',
  '$U $V $A $N $P $R',
];

/**
 * Extract usable words from the typed buffer.
 * Returns an array of lowercase words (3+ chars, alpha only).
 */
function harvestUserWords() {
  const buf = state.interaction.typing.buffer;
  if (!buf) return [];
  const words = buf.match(/[a-zA-Z]{3,}/g);
  if (!words) return [];
  // Deduplicate, keep most recent occurrences, limit count
  const seen = new Set();
  const result = [];
  for (let i = words.length - 1; i >= 0 && result.length < 30; i--) {
    const w = words[i].toLowerCase();
    if (!seen.has(w)) { seen.add(w); result.push(w); }
  }
  return result;
}

/** Pick a random element from an array. */
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/**
 * Corrupt a word: swap letters, insert stray characters, fragment it.
 * Intensity 0-1 controls how aggressively the word is mangled.
 */
function corruptWord(word, intensity) {
  if (!word || word.length < 2) return word;
  let w = word;

  // Chance to swap two adjacent characters
  if (Math.random() < intensity * 0.6 && w.length > 2) {
    const i = Math.floor(Math.random() * (w.length - 1));
    const chars = w.split('');
    [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
    w = chars.join('');
  }

  // Chance to truncate
  if (Math.random() < intensity * 0.4 && w.length > 3) {
    const cut = Math.max(2, Math.floor(w.length * (0.5 + Math.random() * 0.3)));
    w = w.slice(0, cut);
  }

  // Chance to splice in a foreign syllable
  if (Math.random() < intensity * 0.3) {
    const syllables = ['th','rn','lk','ss','xt','nn','gl','sk','cr','wr','ph','sc'];
    const pos = Math.floor(Math.random() * w.length);
    w = w.slice(0, pos) + pick(syllables) + w.slice(pos);
  }

  return w;
}

/**
 * Generate a single nonsensical fragment.
 * If the user has typed words, some are woven in (then corrupted).
 * Otherwise purely random vocabulary is used.
 */
function buildFragment() {
  const userWords = harvestUserWords();
  const inter     = state.interaction;
  const p         = state.portrait;
  const now       = Date.now();

  // Corruption intensity rises with deletion ratio, idle time, session age
  const delRatio  = inter.typing.count > 5
    ? inter.typing.deletions / inter.typing.count : 0;
  const idleSec   = (now - inter.lastMoveTime) / 1000;
  const sessionMin = (now - state.startTime) / 60000;
  const corruption = Math.min(1,
    0.15 +
    delRatio * 0.35 +
    Math.min(idleSec / 60, 0.25) +
    Math.min(sessionMin / 8, 0.25)
  );

  const template = pick(FRAG_TEMPLATES);

  const frag = template.replace(/\$[UNVAPR]/g, (tok) => {
    switch (tok) {
      case '$U': {
        if (userWords.length > 0) {
          const w = pick(userWords);
          return corruptWord(w, corruption);
        }
        return corruptWord(pick(FRAG_VOCAB.nouns), corruption * 0.6);
      }
      case '$N': return pick(FRAG_VOCAB.nouns);
      case '$V': return pick(FRAG_VOCAB.verbs);
      case '$A': return pick(FRAG_VOCAB.adjectives);
      case '$P': return pick(FRAG_VOCAB.particles);
      case '$R': return pick(FRAG_VOCAB.pronouns);
      default:   return '';
    }
  });

  return frag;
}

function generateTextFragments() {
  if (!state.awakened) return;
  showTextFragment(buildFragment());
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
    tz         : state.environment.tz,   // for geographic haunting detection
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
    setTimeout(() => showTextFragment(buildFragment()), 1600);
  } else {
    setTimeout(() => showTextFragment(buildFragment()), 2200);
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
  const e   = p.env;

  el.innerHTML =
    `<strong>environment</strong><br>` +
    `browser: ${env.browser}${env.isWebview ? ' (webview)' : ''} | os: ${env.os}<br>` +
    `screen: ${env.screenW}×${env.screenH} @${env.pixelRatio}x<br>` +
    `viewport: ${env.viewportW}×${env.viewportH} (${env.aspectClass})<br>` +
    `touch: ${env.touch} | pointer: ${env.pointerFine ? 'fine' : env.pointerCoarse ? 'coarse' : '?'} | hover: ${env.hoverCapable}<br>` +
    `dark: ${env.darkMode} | reduced-motion: ${env.reducedMotion}<br>` +
    `lang: ${env.lang} (${env.langCount} lang${env.langCount > 1 ? 's' : ''})${env.isRTL ? ' RTL' : ''}<br>` +
    `tz: ${env.tz} (UTC${env.utcOffsetHours >= 0 ? '+' : ''}${env.utcOffsetHours})<br>` +
    `hour: ${env.hour} (${env.dayPhase}) | warm: ${p.lightWarm.toFixed(2)}<br>` +
    `hw: ${env.hardwareConcurrency} cores, ${env.deviceMemory}GB<br>` +
    `storage: ${env.storage} | return: ${env.returnVisit}<br>` +
    `<br><strong>env → structure</strong><br>` +
    `edgeQuality: ${e.edgeQuality.toFixed(2)} | symmetry: ${e.symmetry.toFixed(2)}<br>` +
    `anatomy: ${e.anatomyHardness.toFixed(2)} | compressY: ${e.compressionY.toFixed(2)}<br>` +
    `shardDensity: ${e.shardDensity.toFixed(2)} | intimacy: ${e.intimacy.toFixed(2)}<br>` +
    `sovereignty: ${e.sovereignty.toFixed(2)} | secEyes: ${e.secondaryEyes}<br>` +
    `<br><strong>env → material</strong><br>` +
    `wet: ${e.surfaceWet.toFixed(2)} | grain: ${e.grainCoarse.toFixed(2)}<br>` +
    `specular: ${e.specularWidth.toFixed(2)} | lacquer: ${e.lacquer.toFixed(2)}<br>` +
    `palette: rgb(${e.paletteR},${e.paletteG},${e.paletteB})<br>` +
    `bg: rgb(${e.bgR},${e.bgG},${e.bgB})<br>` +
    `<br><strong>env → behaviour</strong><br>` +
    `motionScale: ${e.motionScale.toFixed(2)} | approach: ${e.approachSpeed.toFixed(2)}<br>` +
    `idleRestless: ${e.idleRestless.toFixed(2)} | anticipation: ${e.anticipation.toFixed(2)}<br>` +
    `driftDir: ${e.driftDir}<br>` +
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
