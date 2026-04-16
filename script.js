/* ─── The Mirror — script.js ──────────────────────────────────────────────────
 *
 * Architecture
 * ────────────
 *  collectEnvironment()  → reads browser / device / locale / referrer signals once
 *  trackInteraction()    → wires event listeners; updates state.interaction
 *  buildVisitorProfile() → translates raw signals into artistic portrait params
 *  chooseTemperament()   → selects mirror temperament (flattering/cruel/silent/devotional)
 *  updatePortraitState() → evolves portrait params each animation frame
 *  renderMirror()        → draws one canvas frame (shards, glow, eyes, noise)
 *  initGlassRefraction() → Three.js WebGL glass refraction layer
 *  generateTextFragments()→ generates nonsensical ambient text from user input
 *  saveMirrorMemory()    → persists a minimal poetic profile in localStorage
 *  clearMirrorMemory()   → wipes that profile
 *  exportPortrait()      → canvas → PNG download
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

  // Mirror temperament: flattering | cruel | silent | devotional
  temperament: 'flattering',

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
    clickCount        : 0,    // total clicks — triggers cracks
    // Touch-specific finger trails
    fingerTrails      : [],   // [{points: [{x,y,pressure,age}], active: bool}]
    activeTouches     : {},   // touchId → trail index
  },

  portrait: {
    convergence : 0,    // 0–1  how assembled the figure is
    jitter      : 0,    // 0–1  fragmentation / speed-driven chaos
    brightness  : 0.28, // 0–1  overall luminance
    eyeIntensity: 0,    // 0–1  eye glow
    crack       : 0,    // 0–1  deletion-driven damage
    pulse       : 0,    // 0–1  typing rhythm heartbeat
    sinkDepth   : 0,    // 0–1  scroll-driven distortion
    drowning    : 0,    // 0–1  accumulated submersion from sustained scroll/wheel
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

  // Delayed mirror cursor — spring-physics follower of the real cursor
  mirrorCursor: {
    x:  window.innerWidth  * 0.5,
    y:  window.innerHeight * 0.5,
    vx: 0,
    vy: 0,
  },

  // Drifting polygon particle system
  driftPolys: [],

  // Soft metaball orbs
  metaballs: [],

  // Cursor afterimage trail — smoky/oily positions
  cursorTrail: [],    // [{x, y, age, speed}]

  // Glass crack propagation map — persistent fracture lines
  cracks: [],         // [{x1,y1,x2,y2,gen,age,alpha}]
  crackQueue: [],     // [{x,y,angle,len,gen}] — pending branches to grow

  // Liquid mirror ripples
  ripples: [],        // [{cx,cy,age,maxR,intensity}]

  // Cursor heatmap scars — persistent burn marks from lingering
  heatScars: [],      // [{x,y,heat,radius}] normalised coords

  // Ritual geometry rotation phase
  ritualPhase: 0,

  memory  : null,     // loaded from localStorage
  shards  : [],       // Shard instances
  noiseFramePool: [], // pre-rendered noise canvases
  noiseIdx      : 0,  // current noise frame
  noiseCounter  : 0,  // frame counter for noise cycling

  audioCtx   : null,
  audioNodes : null,
  audioReady : false,
  muted      : false,

  // Three.js glass refraction layer
  glass: {
    renderer: null,
    scene:    null,
    camera:   null,
    mesh:     null,
    uniforms: null,
    ready:    false,
  },

  // Scar replay ghosts — loaded from memory for visual replay
  scarGhosts: [],  // [{convergence, crack, erasure, jitter, alpha, age}]
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

  // ── Referrer / origin ──
  env.referrer = '';
  env.referrerDomain = '';
  try {
    const ref = document.referrer;
    if (ref) {
      env.referrer = ref;
      const url = new URL(ref);
      env.referrerDomain = url.hostname;
    }
  } catch (_) {}

  // Social media referrer detection
  const socialDomains = ['facebook.com','instagram.com','twitter.com','x.com',
    'tiktok.com','reddit.com','linkedin.com','threads.net','bsky.app','mastodon.social'];
  env.isSocialReferrer = socialDomains.some(d => env.referrerDomain.includes(d));
  env.isSearchReferrer = ['google.','bing.','duckduckgo.','yahoo.','baidu.'].some(
    d => env.referrerDomain.includes(d));
  env.isDirectVisit = !env.referrer;

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

    // Finger trail tracking — record all active touch points as wound trails
    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i];
      const trailIdx = inter.activeTouches[touch.identifier];
      if (trailIdx !== undefined && inter.fingerTrails[trailIdx]) {
        const trail = inter.fingerTrails[trailIdx];
        const pressure = touch.force || 0.5;
        trail.points.push({
          x: touch.clientX / window.innerWidth,
          y: touch.clientY / window.innerHeight,
          pressure: pressure,
          age: 0,
        });
        // Cap trail length
        if (trail.points.length > 120) trail.points.shift();
      }
    }
  }, { passive: true });

  // Touch start — begin a new finger trail
  document.addEventListener('touchstart', e => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const trailIdx = inter.fingerTrails.length;
      inter.fingerTrails.push({
        points: [{
          x: touch.clientX / window.innerWidth,
          y: touch.clientY / window.innerHeight,
          pressure: touch.force || 0.5,
          age: 0,
        }],
        active: true,
        startTime: Date.now(),
      });
      inter.activeTouches[touch.identifier] = trailIdx;
    }
  }, { passive: true });

  // Touch end — deactivate trail
  document.addEventListener('touchend', e => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const trailIdx = inter.activeTouches[touch.identifier];
      if (trailIdx !== undefined && inter.fingerTrails[trailIdx]) {
        inter.fingerTrails[trailIdx].active = false;
      }
      delete inter.activeTouches[touch.identifier];
    }
  }, { passive: true });

  // Scroll (fires only when document actually scrolls — rare with overflow:hidden)
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

  // Wheel — primary scroll input on overflow:hidden pages
  // Drives the drowning / sinking system
  document.addEventListener('wheel', e => {
    const now = Date.now();
    const dy  = Math.abs(e.deltaY);
    const dt  = Math.max(1, now - lastScrollT);
    // Normalise: deltaMode 1 = lines (~40px), 2 = pages (~800px)
    const pxDy = e.deltaMode === 1 ? dy * 40 : e.deltaMode === 2 ? dy * 800 : dy;
    const raw  = pxDy / dt;
    inter.scrollVelocity = inter.scrollVelocity * 0.7 + raw * 0.3;
    inter.scrollSmooth   = inter.scrollSmooth * 0.92 + raw * 0.08;
    lastScrollT          = now;
    recordActionSwitch('scroll', now);
    if (!state.awakened) awaken();
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
    // Spawn cracks from random screen position on resize
    spawnCrack(
      Math.random() * window.innerWidth,
      Math.random() * window.innerHeight
    );
    recordActionSwitch('resize', Date.now());
  });

  // Click / tap — triggers cracks and ripples
  document.addEventListener('click', e => {
    inter.clickCount++;
    if (state.awakened) {
      spawnCrack(e.clientX, e.clientY);
      spawnRipple(e.clientX, e.clientY, 0.6);
    }
    recordActionSwitch('click', Date.now());
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

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  REFERRER → portrait character adjustments
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (env.isSocialReferrer) {
    // Social media: fractured, performative, split — the figure is a public version
    e.symmetry    = Math.max(0, e.symmetry - 0.15);
    e.intimacy    = Math.max(0, e.intimacy - 0.20);
    e.idleRestless = Math.min(1, e.idleRestless + 0.15);
    // More cracks — social arrival damages the portrait
    p.crack = Math.min(1, p.crack + 0.08);
  } else if (env.isSearchReferrer) {
    // Search: clinical, investigative — the gaze is more surgical
    e.specularWidth = Math.min(1, e.specularWidth + 0.12);
    e.anticipation  = Math.max(0, e.anticipation - 0.10);
  } else if (env.isDirectVisit) {
    // Direct: private, deliberate, more intimate
    e.intimacy     = Math.min(1, e.intimacy + 0.08);
    e.sovereignty  = Math.min(1, e.sovereignty + 0.05);
  }

  // ── Optional backend for extended environment data ──
  // If /api/mirror-env exists, fetch IP geolocation and extended origin data
  // The portrait will update asynchronously if data arrives
  fetchBackendEnv();
}

// ─── Optional backend fetch (non-blocking) ─────────────────────────────────
function fetchBackendEnv() {
  // Try to fetch from an optional API endpoint. If it doesn't exist, silently ignore.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  fetch('/api/mirror-env', { signal: controller.signal })
    .then(r => { clearTimeout(timeoutId); return r.ok ? r.json() : null; })
    .then(data => {
      if (!data) return;
      const env = state.environment;
      // Merge any backend-provided fields
      if (data.latitude !== undefined)  env.latitude  = data.latitude;
      if (data.longitude !== undefined) env.longitude = data.longitude;
      if (data.city)    env.city    = data.city;
      if (data.country) env.country = data.country;
      if (data.isp)     env.isp    = data.isp;
      // Geographic distance from server / centre could further modulate portrait
      // but we don't require the backend — it's purely additive
    })
    .catch(() => { clearTimeout(timeoutId); /* backend not available, that's fine */ });
}

// ─── Temperament System ────────────────────────────────────────────────────
// The mirror chooses a temperament based on environmental and behavioural signals.
// Temperament modulates rendering parameters throughout the session.

function chooseTemperament() {
  const env = state.environment;
  const p   = state.portrait;
  const e   = p.env;

  // Score each temperament based on signals
  const scores = { flattering: 0, cruel: 0, silent: 0, devotional: 0 };

  // Hour influence
  const h = env.hour || 12;
  if (h >= 8 && h < 12) scores.flattering += 2;           // morning light flatters
  if (h >= 0 && h < 5)  scores.cruel += 2;                // witching hours are cruel
  if (h >= 17 && h < 21) scores.devotional += 2;          // dusk is devotional
  if (h >= 12 && h < 14) scores.silent += 1;              // noon is still / harsh

  // Deletion ratio — high erasure makes the mirror cruel
  const delRatio = state.interaction.typing.count > 5
    ? state.interaction.typing.deletions / state.interaction.typing.count : 0;
  if (delRatio > 0.3) scores.cruel += 2;
  if (delRatio < 0.1) scores.flattering += 1;

  // Visit pattern
  if (state.memory && state.memory.visits >= 5) {
    scores.devotional += 2;   // devoted visitors get devotional mirror
  }
  if (state.memory && state.memory.visits === 1) {
    scores.flattering += 1;   // second visit is still flattering
  }

  // Social referrer → cruel (performative gaze)
  if (env.isSocialReferrer) scores.cruel += 2;

  // Direct visit → silent or devotional
  if (env.isDirectVisit) {
    scores.silent += 1;
    scores.devotional += 1;
  }

  // Reduced motion → silent (ritual stillness)
  if (env.reducedMotion) scores.silent += 3;

  // Touch devices → more intimate → devotional or flattering
  if (env.touch) {
    scores.flattering += 1;
    scores.devotional += 1;
  }

  // Find highest score (with tie-breaking from deterministic hash of hour + visits)
  let best = 'flattering';
  let bestScore = -1;
  const tieBreak = (h * 7 + (state.memory ? state.memory.visits : 0) * 13) % 4;
  const order = ['flattering', 'cruel', 'silent', 'devotional'];
  // Rotate the order for tie-breaking
  const rotated = [...order.slice(tieBreak), ...order.slice(0, tieBreak)];

  for (const t of rotated) {
    if (scores[t] > bestScore) {
      bestScore = scores[t];
      best = t;
    }
  }

  state.temperament = best;
  applyTemperament();
}

function applyTemperament() {
  const p = state.portrait;
  const e = p.env;

  switch (state.temperament) {
    case 'flattering':
      // Converges faster, softens edges, light catches more generously
      e.approachSpeed = Math.min(2.0, e.approachSpeed * 1.4);
      e.edgeQuality   = Math.min(1, e.edgeQuality + 0.15);
      e.surfaceWet    = Math.min(1, e.surfaceWet + 0.12);
      e.specularWidth = Math.min(1, e.specularWidth + 0.10);
      break;

    case 'cruel':
      // Convergence resisted, cracks deepen, autonomous motion predatory
      e.approachSpeed = Math.max(0.3, e.approachSpeed * 0.6);
      e.idleRestless  = Math.min(1, e.idleRestless + 0.25);
      e.grainCoarse   = Math.min(1, e.grainCoarse + 0.15);
      e.anticipation  = Math.min(1, e.anticipation + 0.20);
      p.crack = Math.min(1, p.crack + 0.05);
      break;

    case 'silent':
      // No text fragments — the figure assembles in quiet
      e.motionScale   = Math.max(0, e.motionScale * 0.5);
      e.idleRestless  = Math.max(0, e.idleRestless - 0.20);
      break;

    case 'devotional':
      // Halo brighter, ritual geometry more elaborate
      e.approachSpeed = Math.min(2.0, e.approachSpeed * 1.2);
      e.surfaceWet    = Math.min(1, e.surfaceWet + 0.15);
      e.intimacy      = Math.min(1, e.intimacy + 0.15);
      break;
  }
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

  // Cruel temperament: convergence is harder to achieve, cracks deepen faster
  if (state.temperament === 'cruel') {
    p.convergence = Math.max(0, p.convergence - 0.00005 * dt);
    p.crack = Math.min(1, p.crack + 0.000002 * dt);
  }

  // Flattering temperament: convergence ceiling is higher, damage fades
  if (state.temperament === 'flattering') {
    p.crack = Math.max(0, p.crack - 0.00001 * dt);
    p.erasure = Math.max(0, p.erasure - 0.000005 * dt);
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

  // --- Drowning: accumulated submersion from sustained wheel / scroll ---
  // Builds faster when scrolling, decays very slowly — the portrait submerges
  if (inter.scrollVelocity > 0.002) {
    p.drowning = Math.min(1, p.drowning + inter.scrollVelocity * dt * 0.0018);
  }
  // Extremely slow natural recovery — takes many seconds of stillness to surface
  p.drowning = Math.max(0, p.drowning - dt * 0.000025);

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
  const drownDim   = p.drowning * 0.22;  // submersion darkens the portrait
  // Light mode: brighter base; dark mode: deeper
  const baseBright = (state.environment.lightMode && !state.environment.darkMode) ? 0.34 : 0.26;
  p.brightness = baseBright + p.convergence * 0.46 + breathLift - smearDim - erasureDim - drownDim;

  // --- Decay hover points ---
  for (const hp of inter.hoverPoints) {
    hp.age       += dt;
    hp.intensity  = Math.max(0, hp.intensity - dt * 0.000095);
  }
  inter.hoverPoints = inter.hoverPoints.filter(hp => hp.intensity > 0.01);

  // --- Mirror cursor: spring-physics follower with lag, overshoot, prediction ---
  const mc = state.mirrorCursor;
  const spring   = 0.0028;  // stiffness — low = sluggish, high = snappy
  const damping  = 0.88;    // velocity retention — higher = more overshoot
  const predict  = 0.12;    // slight prediction factor
  // Predicted target: extrapolate cursor momentum
  const predX = inter.cursorX + (inter.cursorX - mc.x) * predict;
  const predY = inter.cursorY + (inter.cursorY - mc.y) * predict;
  // Spring force toward predicted target + noise for sentience
  const noiseX = (Math.sin(Date.now() * 0.0013) * 0.4 + Math.sin(Date.now() * 0.0037) * 0.2);
  const noiseY = (Math.cos(Date.now() * 0.0017) * 0.3 + Math.cos(Date.now() * 0.0029) * 0.2);
  mc.vx = (mc.vx + (predX - mc.x) * spring * dt + noiseX) * damping;
  mc.vy = (mc.vy + (predY - mc.y) * spring * dt + noiseY) * damping;
  mc.x += mc.vx;
  mc.y += mc.vy;
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

// ─── Drifting Polygon Particle System ──────────────────────────────────────

function initDriftPolys() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const isMobile = state.environment.touch && W < 900;
  const count = isMobile ? 90 : 200;

  state.driftPolys = [];
  for (let i = 0; i < count; i++) {
    // Each polygon: 3-6 sided, random position, velocity, depth layer
    const sides = 3 + Math.floor(Math.random() * 4);  // 3-6 vertices
    const depth = Math.random();                        // 0 = far back, 1 = foreground
    const size  = 4 + depth * 18 + Math.random() * 10; // bigger when closer
    const angle = Math.random() * Math.PI * 2;

    // Build polygon vertices around local origin
    const verts = [];
    for (let v = 0; v < sides; v++) {
      const a = (v / sides) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const r = size * (0.6 + Math.random() * 0.4);
      verts.push({ lx: Math.cos(a) * r, ly: Math.sin(a) * r });
    }

    state.driftPolys.push({
      x:     Math.random() * W,
      y:     Math.random() * H,
      vx:    (Math.random() - 0.5) * 0.3,
      vy:    (Math.random() - 0.5) * 0.3,
      depth: depth,
      angle: angle,
      spin:  (Math.random() - 0.5) * 0.003,
      verts: verts,
      // Face-alignment: each polygon has a "home" position in the portrait
      homeX: Math.random() * W,
      homeY: Math.random() * H,
      phase: Math.random() * Math.PI * 2,  // for periodic drift
    });
  }
}

function updateDriftPolys(dt) {
  const W   = window.innerWidth;
  const H   = window.innerHeight;
  const mc  = state.mirrorCursor;
  const t   = Date.now() * 0.001;
  const p   = state.portrait;
  // Face alignment strength: grows with convergence
  const faceStrength = Math.max(0, p.convergence - 0.15) * 0.6;
  // Pulse the alignment: it comes and goes
  const alignPulse = Math.max(0, Math.sin(t * 0.08) * Math.sin(t * 0.13));
  const align = faceStrength * alignPulse;

  for (const poly of state.driftPolys) {
    // Depth-scaled mouse influence: foreground = stronger
    const depthFactor = 0.3 + poly.depth * 0.7;
    const dx = mc.x - poly.x;
    const dy = mc.y - poly.y;
    const dist = Math.sqrt(dx * dx + dy * dy) + 1;
    const mouseRadius = 180 + poly.depth * 100;

    if (dist < mouseRadius) {
      // Repel near polygons, attract far ones — creates depth parallax
      const force = (1 - dist / mouseRadius) * 0.08 * depthFactor;
      const repelOrAttract = poly.depth < 0.4 ? -1 : 1;
      poly.vx += (dx / dist) * force * repelOrAttract;
      poly.vy += (dy / dist) * force * repelOrAttract;
    }

    // Gentle ambient drift (sine-based, unique per polygon via phase)
    poly.vx += Math.sin(t * 0.15 + poly.phase) * 0.003;
    poly.vy += Math.cos(t * 0.11 + poly.phase * 1.3) * 0.002;

    // Face alignment pull: toward portrait-density-weighted home positions
    if (align > 0.01) {
      // Recompute home positions within the portrait silhouette
      const homeNx = poly.homeX / W;
      const homeNy = poly.homeY / H;
      const density = portraitDensity(homeNx, homeNy, p.skeletonShift);
      if (density > 0.2) {
        const pull = align * density * 0.02 * depthFactor;
        poly.vx += (poly.homeX - poly.x) * pull;
        poly.vy += (poly.homeY - poly.y) * pull;
      }
    }

    // Damping
    poly.vx *= 0.97;
    poly.vy *= 0.97;

    // Integrate
    poly.x += poly.vx * dt * 0.06;
    poly.y += poly.vy * dt * 0.06;
    poly.angle += poly.spin * dt * 0.06;

    // Wrap around edges with margin
    const margin = 40;
    if (poly.x < -margin)     poly.x += W + margin * 2;
    if (poly.x > W + margin)  poly.x -= W + margin * 2;
    if (poly.y < -margin)     poly.y += H + margin * 2;
    if (poly.y > H + margin)  poly.y -= H + margin * 2;
  }
}

function drawDriftPolys(ctx, W, H, p, t) {
  const e = p.env;
  ctx.save();

  // Sort by depth so far polygons draw first
  const sorted = state.driftPolys.slice().sort((a, b) => a.depth - b.depth);

  for (const poly of sorted) {
    const depthAlpha = 0.015 + poly.depth * 0.055;
    const breathe = 1 + Math.sin(t * 0.7 + poly.phase) * 0.08;
    const ca = Math.cos(poly.angle), sa = Math.sin(poly.angle);

    ctx.beginPath();
    for (let v = 0; v < poly.verts.length; v++) {
      const lx = poly.verts[v].lx * breathe;
      const ly = poly.verts[v].ly * breathe;
      const rx = poly.x + lx * ca - ly * sa;
      const ry = poly.y + lx * sa + ly * ca;
      if (v === 0) ctx.moveTo(rx, ry);
      else ctx.lineTo(rx, ry);
    }
    ctx.closePath();

    // Fill: very subtle, palette-tinted
    const lum = 0.15 + poly.depth * 0.25;
    const fR = Math.floor(e.paletteR * lum);
    const fG = Math.floor(e.paletteG * lum);
    const fB = Math.floor(e.paletteB * lum);
    ctx.fillStyle = `rgba(${fR},${fG},${fB},${depthAlpha * 0.6})`;
    ctx.fill();

    // Stroke: hairline edge catch
    ctx.strokeStyle = `rgba(${Math.min(255, fR + 40)},${Math.min(255, fG + 35)},${Math.min(255, fB + 50)},${depthAlpha * 0.45})`;
    ctx.lineWidth = 0.3 + poly.depth * 0.5;
    ctx.stroke();
  }

  ctx.restore();
}

// ─── Soft Metaball Orbs ────────────────────────────────────────────────────

function initMetaballs() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const count = 5 + Math.floor(Math.random() * 4);  // 5-8 orbs

  state.metaballs = [];
  for (let i = 0; i < count; i++) {
    state.metaballs.push({
      x:      Math.random() * W,
      y:      Math.random() * H,
      vx:     (Math.random() - 0.5) * 0.15,
      vy:     (Math.random() - 0.5) * 0.15,
      baseRadius: 40 + Math.random() * 80,
      radius: 0,  // computed each frame
      phase:  Math.random() * Math.PI * 2,
    });
  }
}

function updateMetaballs(dt) {
  const W  = window.innerWidth;
  const H  = window.innerHeight;
  const mc = state.mirrorCursor;
  const t  = Date.now() * 0.001;

  for (const mb of state.metaballs) {
    // Gentle ambient drift
    mb.vx += Math.sin(t * 0.09 + mb.phase) * 0.004;
    mb.vy += Math.cos(t * 0.07 + mb.phase * 1.4) * 0.003;

    // Soft attraction to mirror cursor (delayed, sentient)
    const dx = mc.x - mb.x;
    const dy = mc.y - mb.y;
    const dist = Math.sqrt(dx * dx + dy * dy) + 1;
    const pull = Math.min(0.015, 30 / (dist + 200));
    mb.vx += dx * pull * 0.003;
    mb.vy += dy * pull * 0.003;

    // Damping
    mb.vx *= 0.985;
    mb.vy *= 0.985;

    // Integrate
    mb.x += mb.vx * dt * 0.06;
    mb.y += mb.vy * dt * 0.06;

    // Soft boundary: bounce gently off edges
    if (mb.x < -mb.radius)      mb.vx += 0.02;
    if (mb.x > W + mb.radius)   mb.vx -= 0.02;
    if (mb.y < -mb.radius)      mb.vy += 0.02;
    if (mb.y > H + mb.radius)   mb.vy -= 0.02;

    // Radius breathes from base value (no drift)
    mb.radius = mb.baseRadius * (1 + Math.sin(t * 0.3 + mb.phase) * 0.06);
  }
}

function drawMetaballs(ctx, W, H, p, t) {
  const e = p.env;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  for (const mb of state.metaballs) {
    const pulse = 1 + Math.sin(t * 0.5 + mb.phase) * 0.15;
    const r     = mb.radius * pulse;
    const alpha = 0.025 + p.convergence * 0.018;

    const grad = ctx.createRadialGradient(mb.x, mb.y, 0, mb.x, mb.y, r);
    const cR = Math.floor(e.paletteR * 0.7);
    const cG = Math.floor(e.paletteG * 0.75);
    const cB = Math.floor(e.paletteB * 0.85);
    grad.addColorStop(0,    `rgba(${cR},${cG},${cB},${alpha})`);
    grad.addColorStop(0.4,  `rgba(${cR},${cG},${cB},${alpha * 0.4})`);
    grad.addColorStop(1,    `rgba(${cR},${cG},${cB},0)`);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(mb.x, mb.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// ─── Cursor Afterimage Trail ───────────────────────────────────────────────

function updateCursorTrail(dt) {
  const mc = state.mirrorCursor;
  const trail = state.cursorTrail;

  // Add a new trail point every few frames when cursor is moving
  const spd = state.interaction.cursorSmooth;
  if (spd > 0.005 && state.awakened) {
    trail.push({ x: mc.x, y: mc.y, age: 0, speed: spd });
    if (trail.length > 80) trail.shift();
  }

  // Age all points
  for (const pt of trail) pt.age += dt;

  // Remove old points (>3 seconds)
  while (trail.length > 0 && trail[0].age > 3000) trail.shift();
}

function drawCursorTrail(ctx, W, H, p, t) {
  const trail = state.cursorTrail;
  if (trail.length < 2) return;
  const e = p.env;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  for (let i = 0; i < trail.length; i++) {
    const pt = trail[i];
    const life = 1 - pt.age / 3000;   // 1 → 0 over lifetime
    if (life <= 0) continue;

    const alpha = life * 0.12 * Math.min(1, pt.speed * 8);
    const r = 6 + (1 - life) * 18 + pt.speed * 30;

    // Oily/smoky gradient: palette-tinted, diffuses as it ages
    const grd = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r);
    const cR = Math.floor(e.paletteR * 0.5);
    const cG = Math.floor(e.paletteG * 0.55);
    const cB = Math.floor(e.paletteB * 0.7);
    grd.addColorStop(0,   `rgba(${cR},${cG},${cB},${alpha})`);
    grd.addColorStop(0.5, `rgba(${cR},${cG},${cB},${alpha * 0.3})`);
    grd.addColorStop(1,   `rgba(${cR},${cG},${cB},0)`);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// ─── Touch Finger Trails (wounds scored by fingers) ────────────────────────

function updateFingerTrails(dt) {
  const trails = state.interaction.fingerTrails;

  for (const trail of trails) {
    for (const pt of trail.points) {
      pt.age += dt;
    }
    // Remove old points (>8 seconds for inactive trails)
    const maxAge = trail.active ? 15000 : 8000;
    trail.points = trail.points.filter(pt => pt.age < maxAge);
  }

  // Remove empty inactive trails
  state.interaction.fingerTrails = trails.filter(
    tr => tr.active || tr.points.length > 0
  );
}

function drawFingerTrails(ctx, W, H, p, t) {
  const trails = state.interaction.fingerTrails;
  if (trails.length === 0) return;
  const e = p.env;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const trail of trails) {
    if (trail.points.length < 2) continue;

    // Draw as oily finger-smear wound
    for (let i = 1; i < trail.points.length; i++) {
      const prev = trail.points[i - 1];
      const pt   = trail.points[i];
      const life = trail.active ? 1 : Math.max(0, 1 - pt.age / 8000);
      if (life <= 0) continue;

      const pressure = pt.pressure || 0.5;
      const width = 2 + pressure * 12 + (1 - life) * 4;

      // Warm amber wound colour — more intense with pressure
      const warmth = pressure * 0.7;
      const wR = Math.floor(200 + warmth * 55);
      const wG = Math.floor(160 - warmth * 40);
      const wB = Math.floor(120 - warmth * 60);
      const alpha = life * 0.22 * pressure;

      ctx.strokeStyle = `rgba(${wR},${wG},${wB},${alpha})`;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(prev.x * W, prev.y * H);
      ctx.lineTo(pt.x * W, pt.y * H);
      ctx.stroke();

      // Oily smear halo around the trail
      if (pressure > 0.3 && life > 0.3) {
        const haloR = width * 2.5;
        const haloAlpha = alpha * 0.15;
        const grd = ctx.createRadialGradient(
          pt.x * W, pt.y * H, 0,
          pt.x * W, pt.y * H, haloR
        );
        grd.addColorStop(0, `rgba(${wR},${wG},${wB},${haloAlpha})`);
        grd.addColorStop(1, `rgba(${wR},${wG},${wB},0)`);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(pt.x * W, pt.y * H, haloR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Fingerprint burn at touch start point (if trail is recent)
    if (trail.points.length > 0) {
      const first = trail.points[0];
      const burnLife = Math.max(0, 1 - first.age / 12000);
      if (burnLife > 0.05) {
        const bx = first.x * W;
        const by = first.y * H;
        const br = 8 + (1 - burnLife) * 6;
        const burnAlpha = burnLife * 0.18;
        const bg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        bg.addColorStop(0,   `rgba(240,220,180,${burnAlpha})`);
        bg.addColorStop(0.5, `rgba(220,190,150,${burnAlpha * 0.4})`);
        bg.addColorStop(1,   `rgba(200,170,130,0)`);
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.restore();
}

// ─── Cursor Heatmap Scars ──────────────────────────────────────────────────

function updateHeatScars(dt) {
  const inter = state.interaction;
  const mc    = state.mirrorCursor;
  const W     = window.innerWidth;
  const H     = window.innerHeight;

  // Accumulate heat where cursor lingers (slow or still)
  if (inter.cursorSmooth < 0.015 && state.awakened) {
    const nx = mc.x / W;
    const ny = mc.y / H;

    // Find nearest existing scar to merge with
    let merged = false;
    for (const sc of state.heatScars) {
      const dx = sc.x - nx, dy = sc.y - ny;
      if (Math.sqrt(dx * dx + dy * dy) < 0.04) {
        sc.heat = Math.min(1, sc.heat + dt * 0.00015);
        sc.radius = Math.min(0.06, sc.radius + dt * 0.000002);
        merged = true;
        break;
      }
    }

    if (!merged && state.heatScars.length < 40) {
      state.heatScars.push({ x: nx, y: ny, heat: 0.05, radius: 0.02 });
    }
  }

  // Scars cool very slowly — they persist but fade
  for (const sc of state.heatScars) {
    sc.heat = Math.max(0, sc.heat - dt * 0.000004);
  }
  state.heatScars = state.heatScars.filter(sc => sc.heat > 0.005);
}

function drawHeatScars(ctx, W, H, p, t) {
  if (state.heatScars.length === 0) return;
  const e = p.env;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  for (const sc of state.heatScars) {
    const x = sc.x * W;
    const y = sc.y * H;
    const r = sc.radius * Math.min(W, H);

    // Discoloured burn: warm amber shifting to pale white at high heat
    const warmth = sc.heat;
    const sR = Math.floor(180 + warmth * 75);
    const sG = Math.floor(160 - warmth * 50);
    const sB = Math.floor(130 - warmth * 80);
    const alpha = sc.heat * 0.35;

    const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0,   `rgba(${sR},${sG},${sB},${alpha})`);
    grd.addColorStop(0.5, `rgba(${sR},${sG},${sB},${alpha * 0.4})`);
    grd.addColorStop(1,   `rgba(${sR},${sG},${sB},0)`);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Bright wound core at high heat
    if (sc.heat > 0.3) {
      const coreA = (sc.heat - 0.3) * 0.5;
      const coreR = r * 0.25;
      ctx.fillStyle = `rgba(240,235,220,${coreA})`;
      ctx.beginPath();
      ctx.arc(x, y, coreR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

// ─── Glass Crack Propagation ───────────────────────────────────────────────

function spawnCrack(px, py) {
  const angle = Math.random() * Math.PI * 2;
  const len   = 30 + Math.random() * 60;
  state.crackQueue.push({ x: px, y: py, angle, len, gen: 0 });
}

function propagateCracks(dt) {
  const maxCracks = 200;
  const maxGen    = 4;

  // Process queued branches
  let budget = 5;  // max new segments per frame
  while (state.crackQueue.length > 0 && budget > 0 && state.cracks.length < maxCracks) {
    const q = state.crackQueue.shift();
    if (q.gen > maxGen) continue;

    const x2 = q.x + Math.cos(q.angle) * q.len;
    const y2 = q.y + Math.sin(q.angle) * q.len;
    state.cracks.push({
      x1: q.x, y1: q.y, x2, y2,
      gen: q.gen,
      age: 0,
      alpha: 0.7 - q.gen * 0.12,
    });

    // Branch probability decreases with generation
    const branchChance = 0.55 - q.gen * 0.1;
    const childLen = q.len * (0.55 + Math.random() * 0.25);

    if (Math.random() < branchChance) {
      state.crackQueue.push({
        x: x2, y: y2,
        angle: q.angle + 0.3 + Math.random() * 0.5,
        len: childLen,
        gen: q.gen + 1,
      });
    }
    if (Math.random() < branchChance * 0.7) {
      state.crackQueue.push({
        x: x2, y: y2,
        angle: q.angle - 0.3 - Math.random() * 0.5,
        len: childLen,
        gen: q.gen + 1,
      });
    }

    budget--;
  }

  // Age and fade cracks
  for (const c of state.cracks) {
    c.age += dt;
    // Very slow fade — cracks are semi-permanent
    c.alpha = Math.max(0, c.alpha - dt * 0.000008);
  }
  state.cracks = state.cracks.filter(c => c.alpha > 0.005);

  // Hover-triggered cracks: intense lingering spawns fractures
  for (const hp of state.interaction.hoverPoints) {
    if (hp.intensity > 0.7 && hp.age > 3000 && hp.age < 3050) {
      spawnCrack(
        hp.x * window.innerWidth,
        hp.y * window.innerHeight
      );
    }
  }
}

function drawCrackMap(ctx, W, H, p, t) {
  if (state.cracks.length === 0) return;

  ctx.save();
  ctx.lineCap = 'round';

  for (const c of state.cracks) {
    const width = 0.3 + (1 - c.gen / 5) * 0.8;
    const shimmer = 1 + Math.sin(t * 3 + c.x1 * 0.02) * 0.15;
    const a = c.alpha * shimmer;

    // Silver-white crack lines
    ctx.strokeStyle = `rgba(200,210,230,${a * 0.6})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(c.x1, c.y1);
    ctx.lineTo(c.x2, c.y2);
    ctx.stroke();

    // Faint glow along crack
    if (a > 0.2) {
      ctx.strokeStyle = `rgba(180,195,220,${a * 0.12})`;
      ctx.lineWidth = width + 3;
      ctx.stroke();
    }
  }

  ctx.restore();
}

// ─── Ritual Circle Geometry ────────────────────────────────────────────────

function drawRitualGeometry(ctx, W, H, p, t) {
  const shift = p.skeletonShift;
  const cx    = W * (0.5 + shift);
  const headY = H * 0.270;
  const conv  = p.convergence;

  // Only appear after some convergence
  if (conv < 0.12) return;

  // Devotional temperament: more elaborate, brighter ritual geometry
  const devotionalBoost = state.temperament === 'devotional' ? 1.5 : 1.0;

  const alpha = Math.min(0.18 * devotionalBoost, (conv - 0.12) * 0.25 * devotionalBoost);
  const ms    = p.env.motionScale;
  const phase = state.ritualPhase;

  ctx.save();
  ctx.strokeStyle = `rgba(160,175,210,${alpha})`;
  ctx.lineWidth = 0.4;
  ctx.globalCompositeOperation = 'screen';

  // Halo ring above head — slowly rotating
  const haloR = Math.min(W, H) * 0.12;
  const haloY = headY - haloR * 0.5;
  ctx.beginPath();
  ctx.ellipse(cx, haloY, haloR, haloR * 0.18, phase * 0.15, 0, Math.PI * 2);
  ctx.stroke();

  // Second halo — counter-rotating, slightly larger
  if (conv > 0.3) {
    ctx.strokeStyle = `rgba(150,165,200,${alpha * 0.6})`;
    ctx.beginPath();
    ctx.ellipse(cx, haloY - 4, haloR * 1.15, haloR * 0.22,
      -phase * 0.1, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Concentric ritual circles around torso
  const torsoY = H * 0.48;
  const circleCount = 3 + Math.floor(conv * 4);
  for (let i = 0; i < circleCount; i++) {
    const r = 20 + i * 25 + Math.sin(t * 0.3 + i) * 3;
    const a = alpha * (0.5 - i * 0.06);
    if (a <= 0) continue;
    ctx.strokeStyle = `rgba(160,175,210,${a})`;
    ctx.beginPath();
    ctx.arc(cx, torsoY, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Cross-lines through portrait centre — rotating lattice
  if (conv > 0.2) {
    const crossLen = Math.min(W, H) * 0.18 * conv;
    const crossA   = alpha * 0.7;
    ctx.strokeStyle = `rgba(145,160,195,${crossA})`;

    for (let i = 0; i < 4; i++) {
      const angle = phase * 0.08 + (i / 4) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(
        cx + Math.cos(angle) * crossLen,
        torsoY + Math.sin(angle) * crossLen
      );
      ctx.lineTo(
        cx - Math.cos(angle) * crossLen,
        torsoY - Math.sin(angle) * crossLen
      );
      ctx.stroke();
    }
  }

  // Small sigil marks — tick marks along outer circle
  if (conv > 0.35) {
    const outerR = 20 + (circleCount - 1) * 25;
    const tickCount = 12;
    const tickLen = 5 + conv * 4;
    ctx.strokeStyle = `rgba(155,170,205,${alpha * 0.5})`;
    ctx.lineWidth = 0.3;
    for (let i = 0; i < tickCount; i++) {
      const a2 = phase * 0.06 + (i / tickCount) * Math.PI * 2;
      const ix = cx + Math.cos(a2) * outerR;
      const iy = torsoY + Math.sin(a2) * outerR;
      ctx.beginPath();
      ctx.moveTo(ix, iy);
      ctx.lineTo(
        ix + Math.cos(a2) * tickLen,
        iy + Math.sin(a2) * tickLen
      );
      ctx.stroke();
    }
  }

  ctx.restore();
}

// ─── Liquid-Black Mirror ───────────────────────────────────────────────────

function spawnRipple(px, py, intensity) {
  state.ripples.push({
    cx: px, cy: py,
    age: 0,
    maxR: 60 + Math.random() * 80,
    intensity: intensity || 0.4,
  });
  if (state.ripples.length > 12) state.ripples.shift();
}

function updateRipples(dt) {
  for (const rp of state.ripples) rp.age += dt;
  state.ripples = state.ripples.filter(rp => rp.age < 4000);

  // Cursor proximity spawns subtle ripples
  if (state.awakened && Math.random() < 0.02) {
    const mc = state.mirrorCursor;
    const W = window.innerWidth, H = window.innerHeight;
    const headCX = W * (0.5 + state.portrait.skeletonShift);
    const headCY = H * 0.38;
    const dx = mc.x - headCX, dy = mc.y - headCY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < Math.min(W, H) * 0.3) {
      spawnRipple(mc.x, mc.y, 0.15 + (1 - dist / (Math.min(W, H) * 0.3)) * 0.2);
    }
  }
}

function drawLiquidMirror(ctx, W, H, p, t) {
  const shift = p.skeletonShift;
  const cx    = W * (0.5 + shift);
  const cy    = H * 0.38;
  const conv  = p.convergence;

  // Central glossy pool — grows with convergence
  const poolRx = Math.min(W, H) * (0.08 + conv * 0.10);
  const poolRy = poolRx * 1.4;

  if (poolRx < 10) return;

  ctx.save();

  // Dark glossy ellipse — liquid black surface
  const poolG = ctx.createRadialGradient(cx, cy, 0, cx, cy, poolRx * 1.3);
  const pa = 0.15 + conv * 0.20;
  poolG.addColorStop(0,   `rgba(1,1,4,${pa})`);
  poolG.addColorStop(0.6, `rgba(3,3,8,${pa * 0.6})`);
  poolG.addColorStop(1,   'rgba(3,3,8,0)');
  ctx.fillStyle = poolG;
  ctx.beginPath();
  ctx.ellipse(cx, cy, poolRx * 1.3, poolRy * 1.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Glossy specular highlight on the pool surface
  const specX = cx + Math.sin(t * 0.2) * poolRx * 0.15;
  const specY = cy - poolRy * 0.25 + Math.cos(t * 0.15) * 3;
  const specR = poolRx * 0.4;
  const specG = ctx.createRadialGradient(specX, specY, 0, specX, specY, specR);
  const sa = 0.04 + conv * 0.04;
  specG.addColorStop(0,   `rgba(200,210,230,${sa})`);
  specG.addColorStop(1,   'rgba(200,210,230,0)');
  ctx.fillStyle = specG;
  ctx.beginPath();
  ctx.arc(specX, specY, specR, 0, Math.PI * 2);
  ctx.fill();

  // Ripple rings expanding from interaction points
  for (const rp of state.ripples) {
    const life = 1 - rp.age / 4000;
    if (life <= 0) continue;
    const r = rp.maxR * (1 - life * life);  // fast expand, slow finish
    const ra = rp.intensity * life * 0.2;

    ctx.strokeStyle = `rgba(180,195,220,${ra})`;
    ctx.lineWidth = 0.5 + life * 0.8;
    ctx.beginPath();
    ctx.arc(rp.cx, rp.cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Inner ring
    if (life > 0.5) {
      ctx.strokeStyle = `rgba(200,215,240,${ra * 0.5})`;
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.arc(rp.cx, rp.cy, r * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.restore();
}

// ─── Motion-Activated Anatomy ──────────────────────────────────────────────
// Specific behaviours reveal hidden anatomical structures beneath the portrait

function drawMotionAnatomy(ctx, W, H, p, t) {
  const shift = p.skeletonShift;
  const cx    = W * (0.5 + shift);
  const ms    = p.env.motionScale;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.lineCap = 'round';

  // ── Ribs: revealed by scroll (gentle scroll = breathing = ribs visible) ──
  if (p.breathDepth > 0.08 || p.smear > 0.1) {
    const ribAlpha = Math.max(p.breathDepth * 0.3, p.smear * 0.15);
    const ribCount = 7;
    const ribTop   = H * 0.50;
    const ribSpace = H * 0.018;
    const ribW     = W * 0.055;
    ctx.strokeStyle = `rgba(180,195,220,${ribAlpha})`;

    for (let i = 0; i < ribCount; i++) {
      const ribY  = ribTop + i * ribSpace;
      const curve = Math.sin(t * 0.8 + i * 0.3) * 2 * ms;
      const width = ribW * (1 - i * 0.06);
      ctx.lineWidth = 0.3 + p.breathDepth * 0.6;
      ctx.beginPath();
      ctx.moveTo(cx - width, ribY + curve);
      ctx.quadraticCurveTo(cx, ribY - 3 + curve * 0.5, cx + width, ribY + curve);
      ctx.stroke();
    }
  }

  // ── Jawline: revealed by typing (mouth moves → jaw appears) ──
  if (p.pulse > 0.15 || p.typeTremor > 0.1) {
    const jawAlpha = Math.max(p.pulse * 0.25, p.typeTremor * 0.3);
    const jawY     = H * 0.36;
    const jawW     = W * 0.048;
    ctx.strokeStyle = `rgba(170,185,210,${jawAlpha})`;
    ctx.lineWidth = 0.5;

    // V-shaped jawline
    ctx.beginPath();
    ctx.moveTo(cx - jawW, jawY - H * 0.02);
    ctx.lineTo(cx, jawY + H * 0.015);
    ctx.lineTo(cx + jawW, jawY - H * 0.02);
    ctx.stroke();

    // Chin point
    ctx.beginPath();
    ctx.arc(cx, jawY + H * 0.018, 2, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(180,195,215,${jawAlpha * 0.6})`;
    ctx.fill();
  }

  // ── Spine: revealed by idle/autonomy (it moves on its own → spine appears) ──
  if (p.autonomy > 0.15) {
    const spineAlpha = p.autonomy * 0.22;
    const spineTop   = H * 0.30;
    const spineBot   = H * 0.66;
    const vertebrae  = 12;
    ctx.strokeStyle = `rgba(160,175,200,${spineAlpha})`;
    ctx.lineWidth = 0.4;

    ctx.beginPath();
    for (let i = 0; i <= vertebrae; i++) {
      const frac = i / vertebrae;
      const y = spineTop + frac * (spineBot - spineTop);
      const sway = Math.sin(t * 0.3 + frac * 4) * 3 * p.autonomy * ms;
      if (i === 0) ctx.moveTo(cx + sway, y);
      else ctx.lineTo(cx + sway, y);
    }
    ctx.stroke();

    // Vertebra dots
    ctx.fillStyle = `rgba(175,190,215,${spineAlpha * 0.8})`;
    for (let i = 0; i <= vertebrae; i++) {
      const frac = i / vertebrae;
      const y = spineTop + frac * (spineBot - spineTop);
      const sway = Math.sin(t * 0.3 + frac * 4) * 3 * p.autonomy * ms;
      ctx.beginPath();
      ctx.arc(cx + sway, y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Halo: revealed by high convergence (recognition phase) ──
  if (p.convergence > 0.5) {
    const haloAlpha = (p.convergence - 0.5) * 0.3;
    const headY     = H * 0.225;
    const haloR     = Math.min(W, H) * 0.095;
    const pulse     = 1 + Math.sin(t * 0.7) * 0.03;

    ctx.strokeStyle = `rgba(200,215,240,${haloAlpha})`;
    ctx.lineWidth = 0.5 + p.convergence * 0.4;
    ctx.beginPath();
    ctx.arc(cx, headY, haloR * pulse, 0, Math.PI * 2);
    ctx.stroke();

    // Inner glow ring
    if (p.convergence > 0.65) {
      ctx.strokeStyle = `rgba(210,225,250,${haloAlpha * 0.4})`;
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.arc(cx, headY, haloR * 0.8 * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ── Hands: revealed by cursor proximity to sides (reaching out) ──
  const mc = state.mirrorCursor;
  const handProximity = Math.min(1, Math.max(
    1 - Math.abs(mc.x / W - 0.15) * 6,
    1 - Math.abs(mc.x / W - 0.85) * 6
  ));
  if (handProximity > 0.1 && p.convergence > 0.2) {
    const handAlpha = handProximity * 0.18 * p.convergence;
    const handSide  = mc.x < W * 0.5 ? -1 : 1;
    const handX     = cx + handSide * W * 0.13;
    const handY     = H * 0.52;

    ctx.strokeStyle = `rgba(170,185,210,${handAlpha})`;
    ctx.lineWidth = 0.4;

    // Palm outline
    ctx.beginPath();
    ctx.ellipse(handX, handY, W * 0.018, H * 0.022, handSide * 0.2, 0, Math.PI * 2);
    ctx.stroke();

    // Fingers — 4 short lines extending from palm
    const fingerLen = H * 0.025;
    for (let f = 0; f < 4; f++) {
      const fAngle = -0.5 + (f / 3) * 1.0 + handSide * 0.3;
      const fx = handX + Math.cos(fAngle) * W * 0.018;
      const fy = handY - H * 0.022;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(
        fx + Math.cos(fAngle - Math.PI * 0.42) * fingerLen,
        fy - fingerLen * 0.9
      );
      ctx.stroke();
    }

    // Thumb
    const tAngle = handSide > 0 ? -0.9 : 0.9;
    const tx = handX + Math.cos(tAngle) * W * 0.014;
    const ty = handY;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(
      tx + Math.cos(tAngle) * fingerLen * 0.7,
      ty + fingerLen * 0.4
    );
    ctx.stroke();
  }

  ctx.restore();
}

// ─── Scar Ghost Replay ─────────────────────────────────────────────────────
// Prior session portraits flicker behind the current one as translucent ghosts

function initScarGhosts() {
  if (!state.memory || !state.memory.scars || state.memory.scars.length < 1) return;

  state.scarGhosts = state.memory.scars.map((scar, idx) => ({
    convergence: scar.convergence || 0,
    crack:       scar.crack || 0,
    erasure:     scar.erasure || 0,
    jitter:      scar.jitter || 0,
    index:       idx,
    // Each ghost has a phase offset for flickering
    phase:       idx * 1.7 + Math.random() * 2,
    // Older scars are dimmer
    maxAlpha:    Math.max(0.02, 0.08 - idx * 0.015),
  }));
}

function drawScarGhosts(ctx, W, H, p, t) {
  if (state.scarGhosts.length === 0) return;
  // Only show after some convergence (the mirror must recognise you first)
  if (p.convergence < 0.25) return;

  const shift = p.skeletonShift;
  const cx    = W * (0.5 + shift);
  const e     = p.env;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  for (const ghost of state.scarGhosts) {
    // Flicker — ghosts appear and disappear rhythmically
    const flicker = Math.sin(t * 0.3 + ghost.phase) * Math.sin(t * 0.7 + ghost.phase * 0.6);
    if (flicker < 0.2) continue;

    const alpha = ghost.maxAlpha * (flicker - 0.2) * 1.25 * (p.convergence - 0.25) * 2;
    if (alpha < 0.003) continue;

    // Draw a simplified ghost silhouette — head and torso blobs
    // at the convergence level of that past session
    const ghostConv = ghost.convergence;
    const headR = Math.min(W, H) * (0.04 + ghostConv * 0.06);
    const headY = H * 0.27;

    // Head ghost
    const hg = ctx.createRadialGradient(cx, headY, 0, cx, headY, headR);
    const gR = Math.floor(e.paletteR * 0.6);
    const gG = Math.floor(e.paletteG * 0.65);
    const gB = Math.floor(e.paletteB * 0.75);
    hg.addColorStop(0,   `rgba(${gR},${gG},${gB},${alpha})`);
    hg.addColorStop(0.6, `rgba(${gR},${gG},${gB},${alpha * 0.3})`);
    hg.addColorStop(1,   `rgba(${gR},${gG},${gB},0)`);
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(cx, headY, headR, 0, Math.PI * 2);
    ctx.fill();

    // Torso ghost
    const torsoY = H * 0.48;
    const torsoR = headR * 1.8;
    const tg = ctx.createRadialGradient(cx, torsoY, 0, cx, torsoY, torsoR);
    tg.addColorStop(0,   `rgba(${gR},${gG},${gB},${alpha * 0.6})`);
    tg.addColorStop(0.5, `rgba(${gR},${gG},${gB},${alpha * 0.15})`);
    tg.addColorStop(1,   `rgba(${gR},${gG},${gB},0)`);
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.ellipse(cx, torsoY, torsoR * 0.7, torsoR, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ghost crack lines — if the past session had damage
    if (ghost.crack > 0.2) {
      ctx.strokeStyle = `rgba(${gR},${gG},${gB},${alpha * ghost.crack * 0.5})`;
      ctx.lineWidth = 0.3;
      const crackCount = Math.floor(ghost.crack * 4) + 1;
      for (let i = 0; i < crackCount; i++) {
        const angle = ghost.phase + i * 1.3;
        const len = headR * (0.5 + ghost.crack * 0.8);
        ctx.beginPath();
        ctx.moveTo(cx, headY);
        ctx.lineTo(cx + Math.cos(angle) * len, headY + Math.sin(angle) * len);
        ctx.stroke();
      }
    }
  }

  ctx.restore();
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

  // 1b. Drifting polygons — behind everything, layered depth
  if (state.driftPolys.length) drawDriftPolys(ctx, W, H, p, t);

  // 1c. Soft metaball orbs — ambient glow layer
  if (state.metaballs.length) drawMetaballs(ctx, W, H, p, t);

  // 1d. Liquid-black mirror — central glossy pool beneath portrait
  drawLiquidMirror(ctx, W, H, p, t);

  // 2. Sink offset — scroll sinks the portrait; drowning submerges it further
  const transientSink = p.sinkDepth * H * 0.06;
  const drownSink     = p.drowning * H * 0.28;   // up to 28% of screen height submersion
  const sinkY         = transientSink + drownSink;

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

  // 7b. Cursor heatmap scars — persistent burn marks
  drawHeatScars(ctx, W, H, p, t);

  // 7c. Cursor afterimage trail — smoky/oily
  drawCursorTrail(ctx, W, H, p, t);

  // 7d. Motion-activated anatomy (ribs, jaw, spine, halo, hands)
  drawMotionAnatomy(ctx, W, H, p, t);

  // 7e. Touch finger trails — wounds scored by fingers (touch devices)
  drawFingerTrails(ctx, W, H, p, t);

  // 7f. Scar ghost replay — prior session portraits flickering behind
  drawScarGhosts(ctx, W, H, p, t);

  // 8. Type tremor rib-flash overlay
  if (p.typeTremor > 0.15) drawTypeTremorFlash(ctx, W, H, p, t);

  // 9. Erasure scratch overlay
  if (p.erasure > 0.2) drawErasureScars(ctx, W, H, p, t);

  // 9b. Glass crack propagation map
  drawCrackMap(ctx, W, H, p, t);

  // 9c. Ritual circle geometry
  drawRitualGeometry(ctx, W, H, p, t);

  // 10. Smear overlay — violent scroll aging / peeling
  if (p.smear > 0.05) drawSmearOverlay(ctx, canvas, W, H, p);

  // 10b. Drowning haze — dark water rising from below
  if (p.drowning > 0.01) drawDrowningHaze(ctx, W, H, p, t);

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

    const targetX = state.mirrorCursor.x;
    const targetY = state.mirrorCursor.y;
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

// ─── Drowning haze — dark water rising from below ───────────────────────────
// As drowning accumulates, an opaque dark gradient rises from the bottom of the
// screen, progressively swallowing the portrait. A faint ripple-line marks the
// waterline, and the submerged area tints cold and hazy.
function drawDrowningHaze(ctx, W, H, p, t) {
  const d = p.drowning;
  if (d < 0.01) return;

  ctx.save();

  // Waterline position: rises from bottom (1.0) toward top (~0.35) as drowning increases
  const waterFrac = 1 - d * 0.65;           // 1.0 → 0.35
  const waterY    = H * waterFrac;

  // Dark water body below the waterline
  const waterGrad = ctx.createLinearGradient(0, waterY, 0, H);
  const waterAlpha = Math.min(0.88, d * 0.85);
  waterGrad.addColorStop(0,    `rgba(1,2,6,${waterAlpha * 0.3})`);
  waterGrad.addColorStop(0.15, `rgba(1,2,5,${waterAlpha * 0.6})`);
  waterGrad.addColorStop(0.5,  `rgba(0,1,4,${waterAlpha * 0.82})`);
  waterGrad.addColorStop(1,    `rgba(0,0,3,${waterAlpha})`);
  ctx.fillStyle = waterGrad;
  ctx.fillRect(0, waterY, W, H - waterY);

  // Haze band above waterline — mist rising from the surface
  const hazeH = H * 0.12 * d;
  if (hazeH > 2) {
    const hazeGrad = ctx.createLinearGradient(0, waterY - hazeH, 0, waterY);
    hazeGrad.addColorStop(0, 'rgba(1,2,6,0)');
    hazeGrad.addColorStop(1, `rgba(1,2,6,${d * 0.25})`);
    ctx.fillStyle = hazeGrad;
    ctx.fillRect(0, waterY - hazeH, W, hazeH);
  }

  // Waterline ripple — thin undulating highlight at the surface
  if (d > 0.05) {
    ctx.strokeStyle = `rgba(140,160,200,${d * 0.18})`;
    ctx.lineWidth   = 0.5 + d * 0.6;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 4) {
      const ripple = Math.sin(x * 0.02 + t * 1.2) * 2.5 * d
                   + Math.sin(x * 0.035 + t * 0.7) * 1.5 * d;
      const py = waterY + ripple;
      if (x === 0) ctx.moveTo(x, py);
      else ctx.lineTo(x, py);
    }
    ctx.stroke();
  }

  // At high drowning, a faint cold tint washes over everything above waterline too
  if (d > 0.3) {
    const topWash = (d - 0.3) * 0.14;
    ctx.fillStyle = `rgba(2,4,12,${topWash})`;
    ctx.fillRect(0, 0, W, waterY);
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

// ─── Three.js Glass Refraction Layer ────────────────────────────────────────
// Renders a plane of dark glass with real refraction / specular caustics
// behind the 2D canvas. Falls back gracefully if WebGL / Three.js unavailable.

function initGlassRefraction() {
  if (typeof THREE === 'undefined') return;

  const glassCanvas = document.getElementById('glass-canvas');
  if (!glassCanvas) return;

  try {
    const renderer = new THREE.WebGLRenderer({
      canvas: glassCanvas,
      alpha: true,
      antialias: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      45, window.innerWidth / window.innerHeight, 0.1, 100
    );
    camera.position.z = 2.5;

    // Glass plane with custom shader material
    const uniforms = {
      uTime:        { value: 0 },
      uConvergence: { value: 0 },
      uCursorX:     { value: 0.5 },
      uCursorY:     { value: 0.5 },
      uResolution:  { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    };

    const vertexShader = `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vUv = uv;
        vNormal = normalMatrix * normal;
        vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform float uTime;
      uniform float uConvergence;
      uniform float uCursorX;
      uniform float uCursorY;
      uniform vec2 uResolution;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;

      // Simple pseudo-noise
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      void main() {
        vec2 uv = vUv;
        vec2 cursor = vec2(uCursorX, 1.0 - uCursorY);

        // Glass distortion: subtle refraction ripples
        float distFromCursor = length(uv - cursor);
        float cursorInfluence = smoothstep(0.5, 0.0, distFromCursor) * 0.02;

        // Time-based surface perturbation (glass imperfections)
        float n1 = noise(uv * 8.0 + uTime * 0.15) * 0.008;
        float n2 = noise(uv * 16.0 - uTime * 0.08) * 0.004;
        vec2 refracted = uv + vec2(n1 + cursorInfluence, n2 + cursorInfluence * 0.5);

        // Specular caustics — bright light concentrations from refraction
        float caustic1 = noise(refracted * 12.0 + uTime * 0.2);
        float caustic2 = noise(refracted * 24.0 - uTime * 0.15);
        float caustics = pow(caustic1 * caustic2, 3.0) * 2.0;

        // Fresnel-like edge brightening
        float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(-vPosition))), 3.0);

        // Base glass colour: very dark, slightly blue-tinted
        vec3 glassBase = vec3(0.01, 0.015, 0.025);

        // Specular highlights — drifting light across the surface
        float spec1 = pow(max(0.0, noise(refracted * 6.0 + vec2(uTime * 0.1, 0.0))), 8.0);
        float spec2 = pow(max(0.0, noise(refracted * 4.0 + vec2(0.0, uTime * 0.07))), 12.0);
        vec3 specular = vec3(0.45, 0.48, 0.55) * (spec1 * 0.15 + spec2 * 0.08);

        // Combine
        vec3 color = glassBase;
        color += vec3(0.35, 0.38, 0.45) * caustics * 0.12 * uConvergence;
        color += specular * (0.3 + uConvergence * 0.4);
        color += vec3(0.25, 0.28, 0.35) * fresnel * 0.08;

        // Cursor proximity adds warm refraction highlight
        color += vec3(0.4, 0.3, 0.2) * cursorInfluence * 8.0;

        float alpha = 0.15 + fresnel * 0.12 + caustics * 0.05 * uConvergence;
        alpha = min(alpha, 0.35);

        gl_FragColor = vec4(color, alpha);
      }
    `;

    const material = new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
    });

    const geometry = new THREE.PlaneGeometry(4, 3, 32, 32);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    state.glass.renderer = renderer;
    state.glass.scene    = scene;
    state.glass.camera   = camera;
    state.glass.mesh     = mesh;
    state.glass.uniforms = uniforms;
    state.glass.ready    = true;

    // Handle resize
    window.addEventListener('resize', () => {
      if (!state.glass.ready) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      state.glass.renderer.setSize(w, h);
      state.glass.camera.aspect = w / h;
      state.glass.camera.updateProjectionMatrix();
      state.glass.uniforms.uResolution.value.set(w, h);
    });
  } catch (e) {
    // WebGL not available — graceful degradation
    state.glass.ready = false;
  }
}

function updateGlassRefraction(t) {
  if (!state.glass.ready) return;

  const u = state.glass.uniforms;
  u.uTime.value = t;
  u.uConvergence.value = state.portrait.convergence;
  u.uCursorX.value = state.mirrorCursor.x / window.innerWidth;
  u.uCursorY.value = state.mirrorCursor.y / window.innerHeight;

  state.glass.renderer.render(state.glass.scene, state.glass.camera);
}

// ─── Portrait Export (canvas → PNG download) ────────────────────────────────

function exportPortrait() {
  const canvas = document.getElementById('mirror-canvas');
  if (!canvas) return;

  // Create a temporary link and trigger download
  const link = document.createElement('a');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  link.download = `mirror-portrait-${timestamp}.png`;

  // Use toBlob for better performance on large canvases
  canvas.toBlob(function(blob) {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.click();
    // Clean up the object URL after a delay
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, 'image/png');
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
  // Silent temperament: no text fragments — the mirror watches in silence
  if (state.temperament === 'silent') return;
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
    pulse      : +p.pulse.toFixed(3),
    autonomy   : +p.autonomy.toFixed(3),
    drowning   : +p.drowning.toFixed(3),
    brightness : +p.brightness.toFixed(3),
    delRatio   : inter.typing.count > 0
      ? +(inter.typing.deletions / inter.typing.count).toFixed(3)
      : 0,
    temperament: state.temperament,
    sessionDuration: Math.floor((now - state.startTime) / 1000),
    heatScarCount: state.heatScars.length,
    crackCount: state.cracks.length,
  };

  const memory = {
    visits     : (prev.visits || 0) + 1,
    firstVisit : prev.firstVisit || now,
    lastVisit  : now,
    scars      : [scar, ...(prev.scars || [])].slice(0, CONFIG.maxScars),
    browser    : state.environment.browser,
    os         : state.environment.os,
    tz         : state.environment.tz,   // for geographic haunting detection
    referrer   : state.environment.referrerDomain || '',
  };

  try {
    localStorage.setItem(CONFIG.memoryKey, JSON.stringify(memory));
    state.memory = memory;
  } catch (_) { /* quota exceeded or restricted */ }
}

function clearMirrorMemory() {
  try { localStorage.removeItem(CONFIG.memoryKey); } catch (_) {}
  state.memory = null;
  showTextFragment(buildFragment());
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
    `referrer: ${env.referrerDomain || '(direct)'}${env.isSocialReferrer ? ' [social]' : ''}${env.isSearchReferrer ? ' [search]' : ''}<br>` +
    `<br><strong>temperament: ${state.temperament}</strong><br>` +
    `webgl: ${state.glass.ready ? 'active' : 'off'}<br>` +
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
    `sinkDepth: ${p.sinkDepth.toFixed(3)} | smear: ${p.smear.toFixed(3)} | drowning: ${p.drowning.toFixed(3)}<br>` +
    `breathDepth: ${p.breathDepth.toFixed(3)}<br>` +
    `autonomy: ${p.autonomy.toFixed(3)}<br>` +
    `split: ${p.split.toFixed(3)} | desync: ${p.desync.toFixed(3)}<br>` +
    `resizeInjury: ${p.resizeInjury.toFixed(3)}<br>` +
    `phase: ${state.phase}<br>` +
    `<br><strong>memory</strong><br>` +
    `visits: ${state.memory ? state.memory.visits : 0}<br>` +
    `scars: ${state.memory ? state.memory.scars.length : 0}<br>` +
    `ghosts: ${state.scarGhosts.length}<br>` +
    `fingerTrails: ${state.interaction.fingerTrails.length}`;
}

// ─── Main Loop ──────────────────────────────────────────────────────────────
let lastFrameTime = Date.now();

function mainLoop() {
  const now = Date.now();
  const dt  = Math.min(now - lastFrameTime, CONFIG.maxFrameDeltaMs);
  lastFrameTime = now;
  const t   = now * 0.001;

  // Update drifting polygons and metaballs every frame (even before awaken)
  updateDriftPolys(dt);
  updateMetaballs(dt);
  updateCursorTrail(dt);
  updateHeatScars(dt);
  updateFingerTrails(dt);
  propagateCracks(dt);
  updateRipples(dt);
  state.ritualPhase += dt * 0.001;  // slow rotation for ritual geometry

  // Update Three.js glass refraction layer
  updateGlassRefraction(t);

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
  chooseTemperament();
  initScarGhosts();
  rebuildShards();
  initDriftPolys();
  initMetaballs();
  initGlassRefraction();
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
  document.getElementById('save-btn').addEventListener('click', exportPortrait);
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
