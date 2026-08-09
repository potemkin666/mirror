(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const canvas = document.createElement('canvas');
  canvas.id = 'signal-decay';
  canvas.setAttribute('aria-hidden', 'true');

  const text = document.createElement('div');
  text.id = 'fracture-text';
  text.setAttribute('aria-hidden', 'true');

  const flash = document.createElement('div');
  flash.id = 'fracture-flash';
  flash.setAttribute('aria-hidden', 'true');

  document.body.append(canvas, text, flash);

  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0;
  let h = 0;
  let burstUntil = 0;
  let burstPower = 0;
  let lastNoiseFrame = 0;
  let lastPointerAt = performance.now();
  let lastX = innerWidth / 2;
  let lastY = innerHeight / 2;
  let pointerVelocity = 0;
  let returnCount = 0;

  const whispers = [
    'you moved first',
    'no, that was before',
    'again',
    'stay still',
    'there you are',
    'wrong side of the glass',
    'i remember this differently',
    'do not correct it',
    'almost the same',
    'something moved behind you',
    'you were gone longer last time',
    'this is not the first frame'
  ];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = Math.max(1, innerWidth);
    h = Math.max(1, innerHeight);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function memoryWeight() {
    try {
      const raw = localStorage.getItem('the_mirror_v1');
      if (!raw) return 0;
      const memory = JSON.parse(raw);
      const scars = Array.isArray(memory?.scars) ? memory.scars.length : 0;
      return Math.min(1, scars / 6);
    } catch {
      return 0;
    }
  }

  function setMicroDrift() {
    if (reduceMotion) return;
    const x = (Math.random() - .5) * .7;
    const y = (Math.random() - .5) * .55;
    const skew = (Math.random() - .5) * .06;
    root.style.setProperty('--fracture-x', `${x}px`);
    root.style.setProperty('--fracture-y', `${y}px`);
    root.style.setProperty('--fracture-r', `${skew}deg`);
    root.style.setProperty('--fracture-brightness', (1 + Math.random() * .018).toFixed(3));
    root.style.setProperty('--fracture-saturation', (.965 + Math.random() * .05).toFixed(3));
    root.classList.add('fracture-soft');
  }

  function corruptString(source) {
    const marks = ['̷','̸','̴','̵','̶','͟','͞','̼','̯','̺','̻','̹','̘','̙','̝','̞','̟','̠','̤','̥','̦','̩','̪','̫','̬','̭','̮'];
    return [...source].map((ch, i) => {
      if (ch === ' ' || Math.random() > .46) return ch;
      const count = 1 + (Math.random() > .72 ? 1 : 0);
      let out = ch;
      for (let n = 0; n < count; n++) out += marks[(Math.random() * marks.length) | 0];
      if (i > 0 && Math.random() < .08) out = `${ch}${ch}${out.slice(1)}`;
      return out;
    }).join('');
  }

  function showWhisper(power = .5) {
    const phrase = whispers[(Math.random() * whispers.length) | 0];
    text.textContent = corruptString(phrase);
    text.style.opacity = String(.18 + power * .62);
    text.style.transform = `translate(${(Math.random() - .5) * 42}px, ${(Math.random() - .5) * 26}px) skewX(${(Math.random() - .5) * 3}deg)`;

    const life = 50 + Math.random() * 170;
    setTimeout(() => {
      text.style.opacity = '0';
      text.textContent = '';
    }, life);
  }

  function flashFrame(power = .5) {
    if (reduceMotion) return;
    flash.style.opacity = String(.025 + power * .11);
    setTimeout(() => { flash.style.opacity = '0'; }, 22 + Math.random() * 42);
  }

  function burst(power = .55, reason = 'ambient') {
    if (reduceMotion && reason === 'ambient') return;

    burstPower = Math.max(burstPower, Math.min(1, power));
    burstUntil = performance.now() + 90 + power * 260;

    root.classList.remove('fracture-drop', 'fracture-invert');
    root.classList.add('fracture-hard');

    if (Math.random() < .18 + power * .28) root.classList.add('fracture-drop');
    if (power > .76 && Math.random() < .11) root.classList.add('fracture-invert');

    if (Math.random() < .22 + power * .5) showWhisper(power);
    if (Math.random() < .3 + power * .4) flashFrame(power);

    setTimeout(() => {
      root.classList.remove('fracture-hard', 'fracture-drop', 'fracture-invert');
      setMicroDrift();
    }, 135 + power * 120);
  }

  function drawDecay(now) {
    requestAnimationFrame(drawDecay);
    if (!ctx || now - lastNoiseFrame < 70) return;
    lastNoiseFrame = now;

    ctx.clearRect(0, 0, w, h);

    const active = now < burstUntil;
    const memory = memoryWeight();
    const idleSeconds = (now - lastPointerAt) / 1000;
    const baseline = .012 + memory * .012 + Math.min(.012, idleSeconds / 3000);

    // Barely-visible dirty signal even when nothing is "happening".
    const dustCount = active ? 14 + ((burstPower * 40) | 0) : 2;
    for (let i = 0; i < dustCount; i++) {
      const y = Math.random() * h;
      const barH = active ? 1 + Math.random() * (3 + burstPower * 14) : 1;
      const x = active ? Math.random() * w * .35 : Math.random() * w;
      const width = active ? w * (.25 + Math.random() * .95) : 20 + Math.random() * 130;
      const alpha = active ? .025 + Math.random() * (.05 + burstPower * .12) : baseline;
      ctx.fillStyle = `rgba(${Math.random() < .3 ? 190 : 235},${Math.random() < .3 ? 215 : 240},255,${alpha})`;
      ctx.fillRect(x, y, width, barH);
    }

    if (!active) {
      burstPower *= .92;
      return;
    }

    // Horizontal displacement ghosts.
    for (let i = 0; i < 4 + burstPower * 12; i++) {
      const y = Math.random() * h;
      const bandH = 2 + Math.random() * (8 + burstPower * 34);
      const offset = (Math.random() - .5) * (8 + burstPower * 90);

      ctx.fillStyle = `rgba(255,18,55,${.018 + burstPower * .035})`;
      ctx.fillRect(Math.max(0, offset), y, w, bandH);
      ctx.fillStyle = `rgba(0,218,255,${.016 + burstPower * .032})`;
      ctx.fillRect(Math.max(0, -offset), y + 1, w, Math.max(1, bandH - 2));
    }

    // Vertical sync tears.
    if (Math.random() < .45) {
      const x = Math.random() * w;
      const tearW = 1 + Math.random() * (2 + burstPower * 9);
      const grad = ctx.createLinearGradient(x, 0, x + tearW, 0);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(.45, `rgba(220,238,255,${.03 + burstPower * .09})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, tearW, h);
    }
  }

  function scheduleAmbientBurst() {
    const memory = memoryWeight();
    const idleSeconds = (performance.now() - lastPointerAt) / 1000;

    // Stillness makes the mirror less frequent but more deliberate.
    const idleBonus = Math.min(.24, idleSeconds / 180);
    const power = .32 + Math.random() * .34 + memory * .16 + idleBonus;

    if (Math.random() < .72) burst(power, 'ambient');

    const base = idleSeconds > 45 ? 5200 : 1800;
    const span = idleSeconds > 45 ? 9000 : 6000;
    setTimeout(scheduleAmbientBurst, base + Math.random() * span);
  }

  function scheduleFalseFrame() {
    if (!reduceMotion) {
      const idleSeconds = (performance.now() - lastPointerAt) / 1000;
      if (idleSeconds > 18 && Math.random() < .5) {
        const oldX = root.style.getPropertyValue('--fracture-x');
        const oldY = root.style.getPropertyValue('--fracture-y');
        root.style.setProperty('--fracture-x', `${(Math.random() - .5) * 5}px`);
        root.style.setProperty('--fracture-y', `${(Math.random() - .5) * 3}px`);
        setTimeout(() => {
          root.style.setProperty('--fracture-x', oldX || '0px');
          root.style.setProperty('--fracture-y', oldY || '0px');
        }, 28 + Math.random() * 55);
      }
    }
    setTimeout(scheduleFalseFrame, 9000 + Math.random() * 23000);
  }

  window.addEventListener('pointermove', (event) => {
    const now = performance.now();
    const dt = Math.max(1, now - lastPointerAt);
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    pointerVelocity = Math.hypot(dx, dy) / dt;
    lastX = event.clientX;
    lastY = event.clientY;
    lastPointerAt = now;

    if (pointerVelocity > 1.9 && Math.random() < .025) {
      burst(Math.min(.78, .38 + pointerVelocity * .08), 'movement');
    }
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      returnCount++;
      setTimeout(() => {
        burst(Math.min(.95, .56 + returnCount * .04), 'return');
        if (returnCount > 1 && Math.random() < .45) showWhisper(.72);
      }, 180 + Math.random() * 900);
    }
  });

  window.addEventListener('focus', () => {
    if (document.visibilityState === 'visible' && Math.random() < .2) {
      setTimeout(() => burst(.42, 'focus'), 80 + Math.random() * 300);
    }
  });

  window.addEventListener('resize', resize, { passive: true });

  resize();
  setMicroDrift();
  requestAnimationFrame(drawDecay);
  setTimeout(scheduleAmbientBurst, 900 + Math.random() * 2100);
  setTimeout(scheduleFalseFrame, 7000 + Math.random() * 9000);
})();
