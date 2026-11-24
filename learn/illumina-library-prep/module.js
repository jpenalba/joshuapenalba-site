/*
  Illumina library prep module (spec §7), scroll layout.

  Per user feedback (2026-11-24): instead of one shared stage scrubbed by
  step controls, every step gets its own section stacked on the page; moving
  between steps is just scrolling. Each step's molecule diagram is drawn
  large, since it's the focal point of the section. Logged in
  learn/learning-spec.md §10.

  Each step renders its own static "tableau" (no longer animated continuously
  from the previous step's state, since both are simultaneously on the page).
  A light IntersectionObserver-driven fade/rise plays once as a step scrolls
  into view (skipped entirely under prefers-reduced-motion).
*/
(async function () {
  const container = document.getElementById('stepsContainer');
  const res = await fetch('content.json');
  const content = await res.json();

  document.title = `${content.title} — Learn — Dr. Joshua Peñalba`;
  document.getElementById('moduleTitle').textContent = content.title;
  document.getElementById('moduleSubtitle').textContent = content.subtitle;
  const objList = document.getElementById('objectivesList');
  content.objectives.forEach(o => {
    const li = document.createElement('li');
    li.textContent = o;
    objList.appendChild(li);
  });

  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- shared stage geometry (generous, since the molecule is the focal point) ----------
  const STAGE_W = 700, STAGE_H = 230, MID_Y = 115;
  const FOCAL_W = 320, FOCAL_H = 26, FOCAL_X = (STAGE_W - FOCAL_W) / 2;

  const REGION_DEFS = [
    { ...DNA.REGIONS.p5, width: 46 },
    { ...DNA.REGIONS.i5, width: 40 },
    { ...DNA.REGIONS.read1, width: 40 },
    { ...DNA.REGIONS.insert, width: 230 },
    { ...DNA.REGIONS.read2, width: 40 },
    { ...DNA.REGIONS.i7, width: 40 },
    { ...DNA.REGIONS.p7, width: 46 }
  ];
  const ROW_W = REGION_DEFS.reduce((s, r) => s + r.width, 0);
  const ROW_X = (STAGE_W - ROW_W) / 2;
  const ROW_H = 36;

  const REGION_INFO = {
    p5: 'P5 — binds the flow-cell surface and lets bridge amplification begin.',
    i5: 'i5 index — one half of the sample barcode, read in a separate index read.',
    read1: 'Read 1 primer site — where the first sequencing read starts.',
    insert: 'Insert — your fragment of genomic DNA. This is the part that gets sequenced.',
    read2: 'Read 2 primer site — where the second, paired-end read starts.',
    i7: 'i7 index — the other half of the sample barcode.',
    p7: 'P7 — binds the flow-cell surface at the other end.'
  };

  const SMEAR = [
    { x: 70, y: 55, w: 110 }, { x: 230, y: 175, w: 75 }, { x: 470, y: 60, w: 135 },
    { x: 545, y: 170, w: 90 }, { x: 95, y: 150, w: 80 }, { x: 560, y: 110, w: 100 },
    { x: 300, y: 115, w: 150 }
  ];

  // ---------- per-step stage drawing ----------
  function drawGenomicBulk(svg) {
    DNA.genomicStrand(svg, { x: 40, width: STAGE_W - 80, y: 55, amplitude: 16, wavelength: 170, strokeWidth: 5, phase: 0 });
    DNA.genomicStrand(svg, { x: 40, width: STAGE_W - 80, y: 115, amplitude: 16, wavelength: 170, strokeWidth: 5, phase: 1.4 });
    DNA.genomicStrand(svg, { x: 40, width: STAGE_W - 80, y: 175, amplitude: 16, wavelength: 170, strokeWidth: 5, phase: 2.8 });
  }

  // Gel electrophoresis of the raw input, before any library-prep steps.
  // Smaller fragments migrate farther (down the gel) and faster, so intact
  // high-molecular-weight DNA stays as a tight band near the well, while
  // degraded DNA trails into a smear reaching further down the lane.
  function drawGel(svg, gel) {
    const GEL_X = 60, GEL_Y = 20, GEL_W = STAGE_W - 120, GEL_H = STAGE_H - 70;
    const defs = DNA.el('defs', {}, svg);
    const gradTop = DNA.el('linearGradient', { id: 'gelFadeTop', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    DNA.el('stop', { offset: '0%', 'stop-color': 'var(--gel-band)', 'stop-opacity': 0.55 }, gradTop);
    DNA.el('stop', { offset: '100%', 'stop-color': 'var(--gel-band)', 'stop-opacity': 0 }, gradTop);
    const gradLow = DNA.el('linearGradient', { id: 'gelFadeLow', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    DNA.el('stop', { offset: '0%', 'stop-color': 'var(--gel-band)', 'stop-opacity': 0 }, gradLow);
    DNA.el('stop', { offset: '55%', 'stop-color': 'var(--gel-band)', 'stop-opacity': 0.5 }, gradLow);
    DNA.el('stop', { offset: '100%', 'stop-color': 'var(--gel-band)', 'stop-opacity': 0.15 }, gradLow);

    DNA.el('rect', { x: GEL_X, y: GEL_Y, width: GEL_W, height: GEL_H, rx: 10, fill: 'var(--gel-bg)' }, svg);

    const lanes = gel.lanes;
    const margin = 32;
    const usable = GEL_W - margin * 2;
    const laneW = Math.min(70, usable / lanes.length - 24);
    const slot = usable / lanes.length;

    lanes.forEach((lane, i) => {
      const cx = GEL_X + margin + slot * i + slot / 2;
      const lx = cx - laneW / 2;
      const wellY = GEL_Y + 16;
      DNA.el('rect', { x: lx, y: wellY, width: laneW, height: 9, rx: 2, fill: 'var(--gel-well)' }, svg);

      const bandTop = wellY + 20;
      if (lane.type === 'ladder') {
        const rungs = 7;
        for (let r = 0; r < rungs; r++) {
          DNA.el('rect', {
            x: lx, y: bandTop + r * ((GEL_H - 55) / rungs), width: laneW, height: 5, rx: 2,
            fill: 'var(--gel-band)', opacity: 0.8
          }, svg);
        }
      } else if (lane.type === 'intact') {
        DNA.el('rect', { x: lx, y: bandTop, width: laneW, height: 10, rx: 3, fill: 'var(--gel-band)' }, svg);
        DNA.el('rect', { x: lx, y: bandTop + 8, width: laneW, height: 26, fill: 'url(#gelFadeTop)' }, svg);
      } else if (lane.type === 'moderate') {
        DNA.el('rect', { x: lx, y: bandTop, width: laneW, height: 9, rx: 3, fill: 'var(--gel-band)', opacity: 0.6 }, svg);
        DNA.el('rect', { x: lx, y: bandTop + 6, width: laneW, height: GEL_H - 80, fill: 'url(#gelFadeTop)' }, svg);
      } else if (lane.type === 'degraded') {
        DNA.el('rect', { x: lx, y: bandTop, width: laneW, height: GEL_H - 55, fill: 'url(#gelFadeLow)' }, svg);
      }

      lane.label.forEach((line, li) => {
        DNA.el('text', {
          x: cx, y: GEL_Y + GEL_H + 20 + li * 14, 'text-anchor': 'middle',
          'font-family': "'IBM Plex Mono', monospace", 'font-size': 11, fill: 'var(--ink-soft)'
        }, svg).textContent = line;
      });
    });
  }

  // Both quant-method illustrations are drawn centred and stacked (icon on
  // top, caption below) rather than icon-beside-label, since the side panel
  // column is narrow — a side-by-side layout clips long labels there.
  function captionLines(svg, lines, y0) {
    lines.forEach((line, i) => {
      DNA.el('text', {
        x: 85, y: y0 + i * 13, 'text-anchor': 'middle',
        'font-family': "'IBM Plex Mono', monospace", 'font-size': 10, fill: 'var(--ink-soft)'
      }, svg).textContent = line;
    });
  }

  function drawNanodrop(svg) {
    DNA.el('circle', { cx: 85, cy: 14, r: 5, fill: 'none', stroke: 'var(--reg-p7)', 'stroke-width': 1.5 }, svg);
    DNA.el('line', { x1: 85, y1: 19, x2: 85, y2: 40, stroke: 'var(--reg-p7)', 'stroke-width': 2, 'stroke-dasharray': '3 3' }, svg);
    DNA.el('rect', { x: 60, y: 40, width: 50, height: 8, rx: 3, fill: 'var(--line-strong)' }, svg);
    DNA.el('circle', { cx: 85, cy: 50, r: 6, fill: 'var(--reg-i5)' }, svg);
    DNA.el('rect', { x: 60, y: 56, width: 50, height: 8, rx: 3, fill: 'var(--line-strong)' }, svg);
    DNA.el('line', { x1: 85, y1: 64, x2: 85, y2: 86, stroke: 'var(--reg-p7)', 'stroke-width': 2, 'stroke-dasharray': '3 3' }, svg);
    DNA.el('rect', { x: 70, y: 86, width: 30, height: 12, rx: 2, fill: 'none', stroke: 'var(--reg-p7)', 'stroke-width': 1.5 }, svg);
    captionLines(svg, ['Absorbs UV light', 'at 260 & 280 nm'], 115);
  }

  function drawQubit(svg) {
    DNA.el('path', { d: 'M72 18 L72 83 Q72 98 85 98 Q98 98 98 83 L98 18 Z', fill: 'none', stroke: 'var(--ink-soft)', 'stroke-width': 2 }, svg);
    DNA.el('path', { d: 'M74 53 L74 83 Q74 95 85 95 Q96 95 96 83 L96 53 Z', fill: 'var(--reg-read1)', opacity: 0.5 }, svg);
    [[80, 68], [89, 76], [83, 83], [92, 63]].forEach(([x, y]) => {
      DNA.el('circle', { cx: x, cy: y, r: 2.2, fill: 'var(--mol-highlight)' }, svg);
    });
    [0, 1, 2].forEach(i => {
      DNA.el('line', {
        x1: 101 + i * 5, y1: 58 - i * 6, x2: 113 + i * 6, y2: 48 - i * 8,
        stroke: 'var(--mol-highlight)', 'stroke-width': 1.5, opacity: 0.8
      }, svg);
    });
    DNA.el('line', { x1: 48, y1: 63, x2: 66, y2: 63, stroke: 'var(--reg-p7)', 'stroke-width': 2 }, svg);
    DNA.el('polygon', { points: '43,58 43,68 35,63', fill: 'var(--reg-p7)' }, svg);
    captionLines(svg, ['Dye glows only', 'on dsDNA'], 115);
  }

  function drawSmear(svg, endStyle) {
    SMEAR.forEach(f => {
      DNA.fragmentBar(svg, { x: f.x, y: f.y, width: f.w, height: 16, color: 'var(--mol-backbone)' });
      if (endStyle === 'ragged') {
        DNA.raggedCap(svg, { x: f.x, y: f.y, side: 'left', size: 11 });
        DNA.raggedCap(svg, { x: f.x + f.w, y: f.y, side: 'right', size: 11 });
      } else if (endStyle === 'repaired' || endStyle === 'atail') {
        DNA.phosphateDot(svg, { x: f.x + 4, y: f.y - 11, r: 6 });
        DNA.phosphateDot(svg, { x: f.x + f.w - 4, y: f.y + 11, r: 6 });
      }
      if (endStyle === 'atail') {
        DNA.aTailDot(svg, { x: f.x + f.w + 8, y: f.y, r: 7 });
      }
    });
  }

  function drawAdapterLigation(svg) {
    DNA.fragmentBar(svg, { x: FOCAL_X, y: MID_Y, width: FOCAL_W, height: FOCAL_H });
    DNA.yAdapterOpen(svg, { x: FOCAL_X, y: MID_Y, side: 'left', armLength: 50, spread: 26, colorOuter: 'var(--reg-p5)', colorInner: 'var(--reg-i5)' });
    DNA.yAdapterOpen(svg, { x: FOCAL_X + FOCAL_W, y: MID_Y, side: 'right', armLength: 50, spread: 26, colorOuter: 'var(--reg-p7)', colorInner: 'var(--reg-i7)' });
  }

  function drawPCR(svg, cycles) {
    [-34, -17, 17, 34].forEach(dy => {
      DNA.fragmentBar(svg, { x: FOCAL_X, y: MID_Y + dy, width: FOCAL_W, height: 9, color: 'var(--line-strong)' });
    });
    DNA.regionRow(svg, { x: ROW_X, y: MID_Y, height: ROW_H, regions: REGION_DEFS });
    const counter = DNA.el('text', {
      x: STAGE_W / 2, y: 30, 'text-anchor': 'middle', 'font-family': "'IBM Plex Mono', monospace",
      'font-size': 15, fill: 'var(--ink-soft)'
    }, svg);
    counter.textContent = `Cycle 0 / ${cycles}`;
    return counter;
  }

  function drawFinalAnatomy(svg, regionInfoEl, sizeMarkers) {
    DNA.regionRow(svg, { x: ROW_X, y: MID_Y, height: ROW_H, regions: REGION_DEFS });
    if (sizeMarkers) {
      const insertStart = ROW_X + REGION_DEFS[0].width + REGION_DEFS[1].width + REGION_DEFS[2].width;
      const insertEnd = insertStart + REGION_DEFS[3].width;
      bracket(svg, insertStart, insertEnd, MID_Y - 44, `~${sizeMarkers.insert} bp insert`);
      bracket(svg, ROW_X, ROW_X + ROW_W, MID_Y - 68, `~${sizeMarkers.library} bp library`);
    }
    let rx = ROW_X;
    REGION_DEFS.forEach(r => {
      const hit = DNA.el('rect', {
        x: rx, y: MID_Y - ROW_H / 2, width: r.width, height: ROW_H, fill: 'transparent',
        tabindex: 0, role: 'button', 'aria-label': REGION_INFO[r.key], class: 'dna-region-hit'
      }, svg);
      const show = () => { regionInfoEl.textContent = REGION_INFO[r.key]; };
      hit.addEventListener('pointerenter', show);
      hit.addEventListener('focus', show);
      hit.addEventListener('click', show);
      rx += r.width;
    });
  }

  function bracket(svg, x1, x2, y, label) {
    DNA.el('path', { d: `M ${x1} ${y + 7} L ${x1} ${y} L ${x2} ${y} L ${x2} ${y + 7}`, stroke: 'var(--ink-faint)', 'stroke-width': 1.4, fill: 'none' }, svg);
    DNA.el('text', { x: (x1 + x2) / 2, y: y - 7, 'text-anchor': 'middle', 'font-family': "'IBM Plex Mono', monospace", 'font-size': 13, fill: 'var(--ink-soft)' }, svg).textContent = label;
  }

  function drawPooled(svg) {
    const poolColors = ['var(--reg-i7)', '#8A4F7D', '#4F7D8A'];
    const scale = 0.62;
    const sw = REGION_DEFS.reduce((s, r) => s + r.width * scale, 0);
    const sx = (STAGE_W - sw) / 2;
    [-62, 0, 62].forEach((dy, i) => {
      const regions = REGION_DEFS.map(r => ({ ...r, width: r.width * scale, color: r.key === 'i7' ? poolColors[i] : r.color }));
      DNA.regionRow(svg, { x: sx, y: MID_Y + dy, height: ROW_H * scale * 1.05, regions });
    });
    return poolColors;
  }

  // ---------- size-trace chart (static per step, plus optional bead shading) ----------
  const TRACE_W = 380, TRACE_H = 150, TRACE_PAD = 28;
  const TRACE_VIEW_H = TRACE_H + 34; // extra room below the plot for larger axis labels
  function tracePathD(peaks) {
    const n = 160;
    const x = bp => TRACE_PAD + (bp / 1000) * (TRACE_W - TRACE_PAD * 2);
    const y = v => (TRACE_H - TRACE_PAD) - v * (TRACE_H - TRACE_PAD * 2);
    let d = `M ${x(0)} ${y(0)}`;
    for (let i = 0; i <= n; i++) {
      const bp = (i / n) * 1000;
      let v = 0;
      peaks.forEach(p => { v += p.height * Math.exp(-((bp - p.center) ** 2) / (2 * p.width * p.width)); });
      d += ` L ${x(bp)} ${y(v)}`;
    }
    d += ` L ${x(1000)} ${y(0)} Z`;
    return d;
  }
  function bpToX(bp) { return TRACE_PAD + (bp / 1000) * (TRACE_W - TRACE_PAD * 2); }

  function buildTrace(svg, peaks) {
    DNA.el('line', { x1: TRACE_PAD, y1: TRACE_H - TRACE_PAD, x2: TRACE_W - TRACE_PAD, y2: TRACE_H - TRACE_PAD, stroke: 'var(--line-strong)', 'stroke-width': 1 }, svg);
    [0, 250, 500, 750, 1000].forEach(bp => {
      DNA.el('text', { x: bpToX(bp), y: TRACE_H + 20, 'text-anchor': 'middle', 'font-family': "'IBM Plex Mono', monospace", 'font-size': 16, fill: 'var(--ink-soft)' }, svg).textContent = bp;
    });
    DNA.el('text', { x: TRACE_W / 2, y: TRACE_H + 33, 'text-anchor': 'middle', 'font-family': "'IBM Plex Mono', monospace", 'font-size': 15, fill: 'var(--ink-soft)' }, svg).textContent = 'fragment size (bp)';
    const path = DNA.el('path', { d: tracePathD(peaks), fill: 'var(--accent)', opacity: 0.22, stroke: 'var(--accent)', 'stroke-width': 1.6 }, svg);
    return path;
  }

  // ---------- build each step section ----------
  // Reveal is driven by a direct scroll-position check rather than
  // IntersectionObserver alone: a fast or instant scroll (keyboard "End", a
  // scrollbar drag, a flick on a small screen) can move a section through
  // the viewport between two rendered frames, so it never registers as
  // "intersecting" and would stay stuck at opacity:0 forever. Checking
  // every section's position against the current scroll offset instead
  // (on scroll/resize and once on load) always converges to "everything the
  // user has reached is visible," no matter how they got there.
  const pending = [];
  function checkReveal() {
    const limit = window.innerHeight * 1.15;
    for (let i = pending.length - 1; i >= 0; i--) {
      const section = pending[i];
      if (section.getBoundingClientRect().top < limit) {
        section.classList.add('is-visible');
        if (section._onReveal) { section._onReveal(); section._onReveal = null; }
        pending.splice(i, 1);
      }
    }
    if (pending.length === 0) {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    }
  }
  let scrollQueued = false;
  function onScroll() {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => { scrollQueued = false; checkReveal(); });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  content.steps.forEach((step, index) => {
    const section = document.createElement('section');
    section.className = 'step';
    section.id = step.id;
    if (reducedMotion) section.classList.add('is-visible');

    const stageSvgId = `svg-${step.id}`;
    section.innerHTML = `
      <div class="step-head">
        <span class="step-eyebrow mono">Step ${index + 1} of ${content.steps.length}</span>
        <h2>${step.title}</h2>
      </div>
      <p class="step-caption">${step.caption}</p>
      <div class="step-visual">
        <div class="stage-card">
          <svg class="step-stage" id="${stageSvgId}" viewBox="0 0 ${STAGE_W} ${STAGE_H}" role="img" aria-label="Diagram of the library molecule at: ${step.title}"></svg>
          ${step.id === 'step8' ? '<p class="region-info"></p>' : ''}
        </div>
        <div class="data-panel">
          ${step.trace ? `<svg class="step-trace" viewBox="0 0 ${TRACE_W} ${TRACE_VIEW_H}" role="img" aria-label="Fragment size distribution at: ${step.title}"></svg>` : ''}
          <div class="step-widgets"></div>
        </div>
      </div>
    `;
    container.appendChild(section);

    const stageSvg = section.querySelector(`#${stageSvgId}`);
    const traceSvg = section.querySelector('.step-trace');
    const widgets = section.querySelector('.step-widgets');

    // --- stage ---
    if (step.id === 'step0') {
      drawGenomicBulk(stageSvg);
    } else if (step.id === 'step1') {
      drawGel(stageSvg, step.gel);
    } else if (step.id === 'step2') {
      drawSmear(stageSvg, 'ragged');
    } else if (step.id === 'step3') {
      drawSmear(stageSvg, 'repaired');
    } else if (step.id === 'step4') {
      drawSmear(stageSvg, 'atail');
    } else if (step.id === 'step5' || step.id === 'step6') {
      drawAdapterLigation(stageSvg);
    } else if (step.id === 'step7') {
      section._pcrCounter = drawPCR(stageSvg, step.pcrCycles);
      section._pcrCycles = step.pcrCycles;
    } else if (step.id === 'step8') {
      drawFinalAnatomy(stageSvg, section.querySelector('.region-info'), step.sizeMarkers);
    } else if (step.id === 'step9') {
      section._poolColors = drawPooled(stageSvg);
    }

    // --- trace ---
    if (traceSvg) buildTrace(traceSvg, step.trace.peaks);

    // --- widgets ---
    if (step.qc) {
      widgets.innerHTML = Object.entries(step.qc).map(([k, v]) =>
        `<div class="qc-row"><span class="qc-key mono">${k.replace(/_/g, '/').toUpperCase()}</span><span class="qc-val mono">${v}</span></div>`
      ).join('');
    }
    if (step.quantMethods) {
      const acc = document.createElement('div');
      acc.className = 'quant-methods';
      step.quantMethods.forEach(m => {
        const item = document.createElement('div');
        item.className = 'quant-item';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'quant-toggle';
        btn.setAttribute('aria-expanded', 'false');
        btn.innerHTML = `<span class="quant-chevron">›</span> ${m.label}`;
        const panelId = `quant-panel-${step.id}-${m.id}`;
        btn.setAttribute('aria-controls', panelId);
        const panel = document.createElement('div');
        panel.className = 'quant-panel';
        panel.id = panelId;
        panel.hidden = true;
        panel.innerHTML = `
          <svg class="quant-illus" viewBox="0 0 170 135" role="img" aria-label="How ${m.label} works"></svg>
          <p class="quant-summary">${m.summary}</p>
          <p class="quant-detail">${m.detail}</p>
        `;
        btn.addEventListener('click', () => {
          const willOpen = panel.hidden;
          panel.hidden = !willOpen;
          btn.setAttribute('aria-expanded', String(willOpen));
          btn.classList.toggle('is-open', willOpen);
          if (willOpen && !panel.dataset.drawn) {
            const illusSvg = panel.querySelector('.quant-illus');
            if (m.id === 'nanodrop') drawNanodrop(illusSvg);
            else if (m.id === 'qubit') drawQubit(illusSvg);
            panel.dataset.drawn = '1';
          }
        });
        item.appendChild(btn);
        item.appendChild(panel);
        acc.appendChild(item);
      });
      widgets.appendChild(acc);
    }
    if (step.beadSelect) {
      const min0 = step.beadSelect.defaultMin, max0 = step.beadSelect.defaultMax;
      widgets.innerHTML = `
        <div class="bead-widget">
          <label class="bead-label mono">Lower cut-off: <span class="bead-min-val">${min0}</span> bp</label>
          <input type="range" class="bead-min" min="0" max="500" step="10" value="${min0}">
          <label class="bead-label mono">Upper cut-off: <span class="bead-max-val">${max0}</span> bp</label>
          <input type="range" class="bead-max" min="200" max="1000" step="10" value="${max0}">
        </div>
      `;
      const shadeLeft = DNA.el('rect', { x: TRACE_PAD, y: 0, width: 0, height: TRACE_H - TRACE_PAD, fill: 'var(--bg)', opacity: 0.72 }, traceSvg);
      const shadeRight = DNA.el('rect', { x: 0, y: 0, width: 0, height: TRACE_H - TRACE_PAD, fill: 'var(--bg)', opacity: 0.72 }, traceSvg);
      function updateShade(min, max) {
        shadeLeft.setAttribute('width', Math.max(0, bpToX(min) - TRACE_PAD));
        shadeRight.setAttribute('x', bpToX(max));
        shadeRight.setAttribute('width', Math.max(0, (TRACE_W - TRACE_PAD) - bpToX(max)));
      }
      updateShade(min0, max0);
      widgets.querySelector('.bead-min').addEventListener('input', (e) => {
        widgets.querySelector('.bead-min-val').textContent = e.target.value;
        updateShade(+e.target.value, +widgets.querySelector('.bead-max').value);
      });
      widgets.querySelector('.bead-max').addEventListener('input', (e) => {
        widgets.querySelector('.bead-max-val').textContent = e.target.value;
        updateShade(+widgets.querySelector('.bead-min').value, +e.target.value);
      });
    } else if (step.pcrCycles) {
      widgets.innerHTML = `<div class="pcr-widget">Each PCR cycle roughly doubles the number of molecules — and any bias with them.</div>`;
    } else if (step.sizeMarkers) {
      widgets.innerHTML = `<div class="size-marker-widget mono">Insert ≈ ${step.sizeMarkers.insert} bp &nbsp;•&nbsp; Library ≈ ${step.sizeMarkers.library} bp</div>`;
      widgets.closest('.step').querySelector('.region-info').textContent = 'Hover or tap a region above to see what it does.';
    } else if (step.pool) {
      widgets.innerHTML = step.pool.samples.map((s, i) =>
        `<div class="pool-row"><span class="pool-swatch" style="background:${section._poolColors[i]}"></span><span class="mono">${s} — ${Math.round(step.pool.shares[i] * 100)}%</span></div>`
      ).join('');
    }

    // --- reveal on scroll ---
    if (!reducedMotion) {
      gsap.set(section, { opacity: 0, y: 18 });
      section._onReveal = () => {
        gsap.to(section, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' });
        if (step.id === 'step7') animatePcrCounter(section);
      };
      pending.push(section);
    } else if (step.id === 'step7') {
      section._pcrCounter.textContent = `Cycle ${step.pcrCycles} / ${step.pcrCycles}`;
    }
  });
  checkReveal();

  function animatePcrCounter(section) {
    let cycle = 0;
    const timer = setInterval(() => {
      cycle = Math.min(section._pcrCycles, cycle + 1);
      section._pcrCounter.textContent = `Cycle ${cycle} / ${section._pcrCycles}`;
      if (cycle >= section._pcrCycles) clearInterval(timer);
    }, 300);
  }
})();
