(() => {
  const audio = document.getElementById('siteAudio');
  const toggle = document.getElementById('audioToggle');
  if (!audio || !toggle) return;

  let enabled = true;
  let started = false;
  let fadeTimer = 0;
  const targetVolume = 0.72;

  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = 0;

  const label = () => {
    toggle.textContent = enabled ? '[ AUDIO: ON ]' : '[ AUDIO: OFF ]';
    toggle.setAttribute('aria-pressed', String(enabled));
  };

  const stopFade = () => { if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = 0; } };

  function fadeIn(ms = 6200) {
    stopFade();
    audio.volume = 0;
    const startedAt = performance.now();
    fadeTimer = setInterval(() => {
      const p = Math.min(1, (performance.now() - startedAt) / ms);
      audio.volume = Number((targetVolume * p).toFixed(3));
      if (p >= 1) stopFade();
    }, 70);
  }

  function fadeOut(ms = 700) {
    stopFade();
    const start = audio.volume;
    const startedAt = performance.now();
    fadeTimer = setInterval(() => {
      const p = Math.min(1, (performance.now() - startedAt) / ms);
      audio.volume = Math.max(0, Number((start * (1 - p)).toFixed(3)));
      if (p >= 1) {
        audio.pause();
        stopFade();
      }
    }, 50);
  }

  async function start() {
    if (!enabled) return false;
    try {
      if (audio.paused) await audio.play();
      started = true;
      if (audio.volume < targetVolume) fadeIn();
      return true;
    } catch {
      return false;
    }
  }

  toggle.addEventListener('click', async () => {
    enabled = !enabled;
    label();
    if (enabled) await start(); else fadeOut();
  });

  // Browsers may block autoplay. Keep AUDIO: ON, then unlock on the first real gesture.
  ['pointerdown', 'touchstart', 'keydown'].forEach((type) => {
    window.addEventListener(type, () => {
      if (!started && enabled) start();
    }, { passive: true, once: false });
  });

  window.beforeYouAudio = { start, stop: () => fadeOut(), isEnabled: () => enabled };
  label();

  // Attempt autoplay immediately; the first click will retry if the browser rejected it.
  start();
})();
