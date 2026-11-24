/*
  Shared step-player for Learn modules (spec §5, player.js).

  Wraps a GSAP timeline whose labels mark each step's resting state. Renders
  caption text, prev / play-pause / next controls and a row of step markers,
  and wires up keyboard navigation (Left/Right to step, Space to play/pause).

  Usage:
    const player = LearnPlayer.create({
      mount: document.querySelector('#player'),
      timeline: gsapTimeline,     // labels already added, in order, via tl.addLabel()
      steps: [{ id:'step0', caption:'...' }, ...],  // same order as the labels
      stepDuration: 0.7,          // seconds for the tween between two step states
      dwell: 2600,                // ms to hold a step during autoplay before advancing
      onStep: (index, step) => {} // called after the active step changes
    });
*/
const LearnPlayer = (() => {

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function create(opts) {
    const { mount, timeline, steps, onStep } = opts;
    const stepDuration = opts.stepDuration ?? 0.7;
    const dwell = opts.dwell ?? 2600;

    let current = 0;
    let playing = false;
    let playTimer = null;
    let seeking = null; // GSAP tween currently moving between labels, if any

    mount.innerHTML = `
      <p class="lp-caption" id="lpCaption" aria-live="polite"></p>
      <div class="lp-controls">
        <button type="button" class="lp-btn" id="lpPrev" aria-label="Previous step">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M16 4 7 12l9 8" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button type="button" class="lp-btn lp-btn-play" id="lpPlay" aria-label="Play">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" id="lpPlayIcon"><path d="M6 4l14 8-14 8V4z" fill="currentColor"/></svg>
        </button>
        <button type="button" class="lp-btn" id="lpNext" aria-label="Next step">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M8 4l9 8-9 8" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="lp-track" id="lpTrack" role="group" aria-label="Steps"></div>
      </div>
    `;

    const captionEl = mount.querySelector('#lpCaption');
    const prevBtn = mount.querySelector('#lpPrev');
    const nextBtn = mount.querySelector('#lpNext');
    const playBtn = mount.querySelector('#lpPlay');
    const playIcon = mount.querySelector('#lpPlayIcon');
    const track = mount.querySelector('#lpTrack');

    const dots = steps.map((step, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lp-dot';
      b.setAttribute('aria-label', `Step ${i + 1} of ${steps.length}: ${step.title || step.id}`);
      b.addEventListener('click', () => { stopPlaying(); goTo(i); });
      track.appendChild(b);
      return b;
    });

    function render() {
      const step = steps[current];
      captionEl.textContent = step.caption;
      dots.forEach((d, i) => d.classList.toggle('is-current', i === current));
      prevBtn.disabled = current === 0;
      nextBtn.disabled = current === steps.length - 1;
      if (onStep) onStep(current, step);
    }

    function goTo(index, { instant = false } = {}) {
      index = Math.max(0, Math.min(steps.length - 1, index));
      if (index === current && !instant) return;
      current = index;
      const label = steps[current].id;
      if (seeking) seeking.kill();
      if (instant || prefersReducedMotion()) {
        timeline.seek(label, false);
      } else {
        seeking = gsap.to(timeline, {
          time: timeline.labels[label],
          duration: stepDuration,
          ease: 'power2.inOut',
          onComplete: () => { seeking = null; }
        });
      }
      render();
    }

    function stopPlaying() {
      playing = false;
      clearTimeout(playTimer);
      playBtn.setAttribute('aria-label', 'Play');
      playIcon.innerHTML = '<path d="M6 4l14 8-14 8V4z" fill="currentColor"/>';
    }

    function startPlaying() {
      if (current === steps.length - 1) goTo(0, { instant: true });
      playing = true;
      playBtn.setAttribute('aria-label', 'Pause');
      playIcon.innerHTML = '<path d="M5 4h4v16H5zM15 4h4v16h-4z" fill="currentColor"/>';
      advance();
    }

    function advance() {
      if (!playing) return;
      if (current >= steps.length - 1) { stopPlaying(); return; }
      playTimer = setTimeout(() => {
        if (!playing) return;
        goTo(current + 1);
        playTimer = setTimeout(() => { if (playing) advance(); }, dwell);
      }, dwell);
    }

    prevBtn.addEventListener('click', () => { stopPlaying(); goTo(current - 1); });
    nextBtn.addEventListener('click', () => { stopPlaying(); goTo(current + 1); });
    playBtn.addEventListener('click', () => { playing ? stopPlaying() : startPlaying(); });

    document.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!mount.closest('body').contains(mount)) return;
      if (e.key === 'ArrowRight') { stopPlaying(); goTo(current + 1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { stopPlaying(); goTo(current - 1); e.preventDefault(); }
      else if (e.key === ' ') { playing ? stopPlaying() : startPlaying(); e.preventDefault(); }
    });

    goTo(0, { instant: true });

    return {
      goTo: (i) => { stopPlaying(); goTo(i); },
      current: () => current
    };
  }

  return { create, prefersReducedMotion };
})();
