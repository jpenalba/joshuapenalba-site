/*
  Illumina library prep module (spec §7). Builds the stage (library molecule),
  the data panel (size trace + per-step widgets), the GSAP master timeline, and
  wires both to the shared LearnPlayer.

  Note on scope (prototype / first draft, spec §8): only the default path
  (no branch toggles) and the size-trace plot are implemented. The duplication
  histogram and reads-per-sample chart called for at steps 7 and 9 are stood in
  for with a light-weight DOM widget rather than a second chart type, so this
  module doesn't have to pull in D3 before the rest of the shared data panel
  (histogram, adapter-content, GC-content, per-base content) exists. Logged in
  learn/learning-spec.md §10.
*/
(async function () {
  const stage = document.getElementById('stage');
  const traceSvg = document.getElementById('traceSvg');
  const qcBox = document.getElementById('qcBox');
  const beadBox = document.getElementById('beadBox');
  const pcrBox = document.getElementById('pcrBox');
  const poolBox = document.getElementById('poolBox');
  const sizeMarkerBox = document.getElementById('sizeMarkerBox');
  const regionInfo = document.getElementById('regionInfo');

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

  const STAGE_W = 640, STAGE_H = 200, MID_Y = 100;
  const FOCAL_X = 240, FOCAL_W = 160, FOCAL_H = 14;
  const ROW_X = 190, ROW_W = 260;

  const svg = (tag, attrs = {}) => DNA.el(tag, attrs, stage);

  // ---------- persistent groups ----------
  const gGenomic = DNA.group(stage, { class: 'g-genomic' });
  DNA.genomicStrand(gGenomic, { x: 50, width: 540, y: 60, phase: 0 });
  DNA.genomicStrand(gGenomic, { x: 50, width: 540, y: 100, phase: 1.4 });
  DNA.genomicStrand(gGenomic, { x: 50, width: 540, y: 140, phase: 2.8 });

  const SMEAR = [
    { x: 60, y: 60, w: 70 }, { x: 150, y: 150, w: 50 }, { x: 420, y: 65, w: 90 },
    { x: 480, y: 145, w: 60 }, { x: 70, y: 120, w: 55 }, { x: 520, y: 95, w: 65 }
  ];
  const gSmear = DNA.group(stage, { class: 'g-smear', opacity: 0 });
  SMEAR.forEach(f => DNA.fragmentBar(gSmear, { x: f.x, y: f.y, width: f.w, height: 9, color: 'var(--mol-removed)' }));

  const gFocal = DNA.group(stage, { class: 'g-focal', opacity: 0 });
  const focalBar = DNA.fragmentBar(gFocal, { x: FOCAL_X, y: MID_Y, width: FOCAL_W, height: FOCAL_H });

  const gRagged = DNA.group(stage, { opacity: 0 });
  DNA.raggedCap(gRagged, { x: FOCAL_X, y: MID_Y, side: 'left' });
  DNA.raggedCap(gRagged, { x: FOCAL_X + FOCAL_W, y: MID_Y, side: 'right' });

  const gPhosphate = DNA.group(stage, { opacity: 0 });
  DNA.phosphateDot(gPhosphate, { x: FOCAL_X + 3, y: MID_Y - FOCAL_H / 2 - 2 });
  DNA.phosphateDot(gPhosphate, { x: FOCAL_X + FOCAL_W - 3, y: MID_Y + FOCAL_H / 2 + 2 });

  const gATail = DNA.group(stage, { opacity: 0 });
  DNA.aTailDot(gATail, { x: FOCAL_X + FOCAL_W + 6, y: MID_Y });

  const gAdapterOpen = DNA.group(stage, { opacity: 0 });
  DNA.yAdapterOpen(gAdapterOpen, { x: FOCAL_X, y: MID_Y, side: 'left', colorOuter: 'var(--reg-p5)', colorInner: 'var(--reg-i5)' });
  DNA.yAdapterOpen(gAdapterOpen, { x: FOCAL_X + FOCAL_W, y: MID_Y, side: 'right', colorOuter: 'var(--reg-p7)', colorInner: 'var(--reg-i7)' });

  const gPCRCopies = DNA.group(stage, { class: 'g-pcr-copies', opacity: 0 });
  [-28, -14, 14, 28].forEach((dy, i) => {
    DNA.fragmentBar(gPCRCopies, { x: FOCAL_X, y: MID_Y + dy, width: FOCAL_W, height: 7, color: 'var(--line-strong)' });
  });
  const pcrCounter = DNA.el('text', {
    x: STAGE_W / 2, y: 28, 'text-anchor': 'middle', 'font-family': "'IBM Plex Mono', monospace",
    'font-size': 12, fill: 'var(--ink-soft)'
  }, gPCRCopies);

  const REGION_DEFS = [
    { ...DNA.REGIONS.p5, width: 26 },
    { ...DNA.REGIONS.i5, width: 22 },
    { ...DNA.REGIONS.read1, width: 22 },
    { ...DNA.REGIONS.insert, width: 120 },
    { ...DNA.REGIONS.read2, width: 22 },
    { ...DNA.REGIONS.i7, width: 22 },
    { ...DNA.REGIONS.p7, width: 26 }
  ];
  const REGION_INFO = {
    p5: 'P5 — binds the flow-cell surface and lets bridge amplification begin.',
    i5: 'i5 index — one half of the sample barcode, read in a separate index read.',
    read1: 'Read 1 primer site — where the first sequencing read starts.',
    insert: 'Insert — your fragment of genomic DNA. This is the part that gets sequenced.',
    read2: 'Read 2 primer site — where the second, paired-end read starts.',
    i7: 'i7 index — the other half of the sample barcode.',
    p7: 'P7 — binds the flow-cell surface at the other end.'
  };

  const gFinalRow = DNA.group(stage, { class: 'g-final-row', opacity: 0 });
  DNA.regionRow(gFinalRow, { x: ROW_X, y: MID_Y, height: 20, regions: REGION_DEFS });
  // Make each region focusable/hoverable for the "anatomy" view.
  let rx = ROW_X;
  REGION_DEFS.forEach(r => {
    const hit = DNA.el('rect', {
      x: rx, y: MID_Y - 10, width: r.width, height: 20, fill: 'transparent',
      tabindex: 0, role: 'button', 'aria-label': REGION_INFO[r.key], class: 'dna-region-hit'
    }, gFinalRow);
    const show = () => { regionInfo.textContent = REGION_INFO[r.key]; };
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('focus', show);
    hit.addEventListener('click', show);
    rx += r.width;
  });

  const gSizeBracket = DNA.group(stage, { opacity: 0 });
  function bracket(x1, x2, y, label) {
    const g = DNA.group(gSizeBracket);
    DNA.el('path', { d: `M ${x1} ${y + 6} L ${x1} ${y} L ${x2} ${y} L ${x2} ${y + 6}`, stroke: 'var(--ink-faint)', 'stroke-width': 1.2, fill: 'none' }, g);
    DNA.el('text', { x: (x1 + x2) / 2, y: y - 6, 'text-anchor': 'middle', 'font-family': "'IBM Plex Mono', monospace", 'font-size': 10, fill: 'var(--ink-soft)' }, g).textContent = label;
  }
  bracket(ROW_X + 26 + 22 + 22, ROW_X + 26 + 22 + 22 + 120, MID_Y - 34, '~260 bp insert');
  bracket(ROW_X, ROW_X + ROW_W, MID_Y - 54, '~380 bp library');

  const gPool = DNA.group(stage, { class: 'g-pool', opacity: 0 });
  const poolColors = ['var(--reg-i7)', '#8A4F7D', '#4F7D8A'];
  [-48, 0, 48].forEach((dy, i) => {
    const regions = REGION_DEFS.map(r => r.key === 'i7' ? { ...r, color: poolColors[i] } : r);
    DNA.regionRow(gPool, { x: ROW_X + 40, y: MID_Y + dy, height: 14, regions: regions.map(r => ({ ...r, width: r.width * 0.72 })) });
  });

  // ---------- size-trace data panel ----------
  const TRACE_W = 380, TRACE_H = 150, TRACE_PAD = 28;
  function tracePath(peaks) {
    const pts = [];
    const n = 160;
    for (let i = 0; i <= n; i++) {
      const bp = (i / n) * 1000;
      let y = 0;
      peaks.forEach(p => {
        if (p.height <= 0) return;
        y += p.height * Math.exp(-((bp - p.center) ** 2) / (2 * p.width * p.width));
      });
      pts.push([bp, y]);
    }
    const x = bp => TRACE_PAD + (bp / 1000) * (TRACE_W - TRACE_PAD * 2);
    const y = v => (TRACE_H - TRACE_PAD) - v * (TRACE_H - TRACE_PAD * 2);
    let d = `M ${x(0)} ${y(0)}`;
    pts.forEach(([bp, v]) => { d += ` L ${x(bp)} ${y(v)}`; });
    d += ` L ${x(1000)} ${y(0)} Z`;
    return d;
  }

  DNA.el('line', { x1: TRACE_PAD, y1: TRACE_H - TRACE_PAD, x2: TRACE_W - TRACE_PAD, y2: TRACE_H - TRACE_PAD, stroke: 'var(--line-strong)', 'stroke-width': 1 }, traceSvg);
  [0, 250, 500, 750, 1000].forEach(bp => {
    const x = TRACE_PAD + (bp / 1000) * (TRACE_W - TRACE_PAD * 2);
    DNA.el('text', { x, y: TRACE_H - TRACE_PAD + 16, 'text-anchor': 'middle', 'font-family': "'IBM Plex Mono', monospace", 'font-size': 9, fill: 'var(--ink-faint)' }, traceSvg).textContent = bp;
  });
  DNA.el('text', { x: TRACE_W / 2, y: TRACE_H - 4, 'text-anchor': 'middle', 'font-family': "'IBM Plex Mono', monospace", 'font-size': 9, fill: 'var(--ink-faint)' }, traceSvg).textContent = 'fragment size (bp)';

  const tracePathEl = DNA.el('path', { fill: 'var(--accent)', opacity: 0.22, stroke: 'var(--accent)', 'stroke-width': 1.6 }, traceSvg);
  const traceState = { c0: 900, h0: 1.0, w0: 70, c1: 125, h1: 0, w1: 20 };
  function drawTrace() {
    tracePathEl.setAttribute('d', tracePath([
      { center: traceState.c0, height: traceState.h0, width: traceState.w0 },
      { center: traceState.c1, height: traceState.h1, width: traceState.w1 }
    ]));
  }
  drawTrace();

  // bead cutoff shading (drawn over the trace, shown only on step6)
  const beadShadeLeft = DNA.el('rect', { x: TRACE_PAD, y: 0, width: 0, height: TRACE_H - TRACE_PAD, fill: 'var(--bg)', opacity: 0.72 }, traceSvg);
  const beadShadeRight = DNA.el('rect', { x: 0, y: 0, width: 0, height: TRACE_H - TRACE_PAD, fill: 'var(--bg)', opacity: 0.72 }, traceSvg);
  beadShadeLeft.style.display = 'none';
  beadShadeRight.style.display = 'none';
  function bpToX(bp) { return TRACE_PAD + (bp / 1000) * (TRACE_W - TRACE_PAD * 2); }
  function updateBeadShade(min, max) {
    beadShadeLeft.setAttribute('width', Math.max(0, bpToX(min) - TRACE_PAD));
    beadShadeRight.setAttribute('x', bpToX(max));
    beadShadeRight.setAttribute('width', Math.max(0, (TRACE_W - TRACE_PAD) - bpToX(max)));
  }

  // ---------- GSAP master timeline ----------
  gsap.set(gGenomic, { opacity: 1 });
  const tl = gsap.timeline({ paused: true });
  tl.addLabel('step0');
  tl.addLabel('step1'); // no stage change; QC readouts are a plain DOM toggle

  tl.to(gGenomic, { opacity: 0, duration: 0.8 }, 'f0')
    .to(gSmear, { opacity: 1, duration: 0.8 }, 'f0')
    .to(gFocal, { opacity: 1, duration: 0.8 }, 'f0')
    .to(traceState, { c0: 260, w0: 110, h0: 0.8, duration: 0.8, onUpdate: drawTrace }, 'f0');
  tl.addLabel('step2');

  tl.to(gRagged, { opacity: 0, duration: 0.01 }, 'f1')
    .to(gPhosphate, { opacity: 1, duration: 0.5 }, 'f1');
  tl.addLabel('step3');

  tl.to(gATail, { opacity: 1, duration: 0.4 });
  tl.addLabel('step4');

  tl.to(gSmear, { opacity: 0, duration: 0.6 }, 'f2')
    .to(gATail, { opacity: 0, duration: 0.3 }, 'f2')
    .to(gPhosphate, { opacity: 0, duration: 0.3 }, 'f2')
    .to(gAdapterOpen, { opacity: 1, duration: 0.6 }, 'f2')
    .to(traceState, { c0: 380, c1: 125, h1: 0.18, duration: 0.6, onUpdate: drawTrace }, 'f2');
  tl.addLabel('step5');

  tl.addLabel('step6'); // bead slider UI handled as a plain DOM toggle

  tl.to(gAdapterOpen, { opacity: 0, duration: 0.5 }, 'f3')
    .to(gFinalRow, { opacity: 1, duration: 0.5 }, 'f3')
    .to(gPCRCopies, { opacity: 1, duration: 0.5 }, 'f3')
    .to(traceState, { h0: 1.0, w0: 100, h1: 0, duration: 0.5, onUpdate: drawTrace }, 'f3');
  tl.addLabel('step7');

  tl.to(gPCRCopies, { opacity: 0, duration: 0.4 }, 'f4')
    .to(gSizeBracket, { opacity: 1, duration: 0.4 }, 'f4');
  tl.addLabel('step8');

  tl.to(gSizeBracket, { opacity: 0, duration: 0.4 }, 'f5')
    .to(gFinalRow, { opacity: 0, duration: 0.4 }, 'f5')
    .to(gPool, { opacity: 1, duration: 0.4 }, 'f5');
  tl.addLabel('step9');

  // ---------- per-step DOM widgets (QC box, bead slider, PCR counter, pool legend) ----------
  const WIDGET_IDS = { qcBox, beadBox, pcrBox, poolBox, sizeMarkerBox };
  function hideAllWidgets() {
    Object.values(WIDGET_IDS).forEach(el => { if (el) el.hidden = true; });
    beadShadeLeft.style.display = 'none';
    beadShadeRight.style.display = 'none';
  }

  let beadMin = content.steps.find(s => s.id === 'step6').beadSelect.defaultMin;
  let beadMax = content.steps.find(s => s.id === 'step6').beadSelect.defaultMax;
  function renderBeadBox() {
    beadBox.innerHTML = `
      <label class="bead-label mono">Lower cut-off: <span id="beadMinVal">${beadMin}</span> bp</label>
      <input type="range" id="beadMinSlider" min="0" max="500" step="10" value="${beadMin}">
      <label class="bead-label mono">Upper cut-off: <span id="beadMaxVal">${beadMax}</span> bp</label>
      <input type="range" id="beadMaxSlider" min="200" max="1000" step="10" value="${beadMax}">
    `;
    beadBox.querySelector('#beadMinSlider').addEventListener('input', (e) => {
      beadMin = +e.target.value;
      beadBox.querySelector('#beadMinVal').textContent = beadMin;
      updateBeadShade(beadMin, beadMax);
    });
    beadBox.querySelector('#beadMaxSlider').addEventListener('input', (e) => {
      beadMax = +e.target.value;
      beadBox.querySelector('#beadMaxVal').textContent = beadMax;
      updateBeadShade(beadMin, beadMax);
    });
    updateBeadShade(beadMin, beadMax);
  }
  renderBeadBox();

  function onStep(index, step) {
    hideAllWidgets();
    regionInfo.textContent = step.id === 'step8'
      ? 'Hover or tap a region below to see what it does.'
      : '';
    if (step.qc) {
      qcBox.hidden = false;
      qcBox.innerHTML = Object.entries(step.qc).map(([k, v]) =>
        `<div class="qc-row"><span class="qc-key mono">${k.replace(/_/g, '/').toUpperCase()}</span><span class="qc-val mono">${v}</span></div>`
      ).join('');
    }
    if (step.beadSelect) {
      beadBox.hidden = false;
      beadShadeLeft.style.display = '';
      beadShadeRight.style.display = '';
      updateBeadShade(beadMin, beadMax);
    }
    if (step.pcrCycles) {
      pcrBox.hidden = false;
      let cycle = 0;
      clearInterval(onStep._pcrTimer);
      pcrCounter.textContent = `Cycle ${cycle} / ${step.pcrCycles}`;
      onStep._pcrTimer = setInterval(() => {
        cycle = Math.min(step.pcrCycles, cycle + 1);
        pcrCounter.textContent = `Cycle ${cycle} / ${step.pcrCycles}`;
        if (cycle >= step.pcrCycles) clearInterval(onStep._pcrTimer);
      }, 350);
    }
    if (step.sizeMarkers) {
      sizeMarkerBox.hidden = false;
      sizeMarkerBox.innerHTML = `<span class="mono">Insert ≈ ${step.sizeMarkers.insert} bp &nbsp;•&nbsp; Library ≈ ${step.sizeMarkers.library} bp</span>`;
    }
    if (step.pool) {
      poolBox.hidden = false;
      poolBox.innerHTML = step.pool.samples.map((s, i) =>
        `<div class="pool-row"><span class="pool-swatch" style="background:${poolColors[i]}"></span><span class="mono">${s} — ${Math.round(step.pool.shares[i] * 100)}%</span></div>`
      ).join('');
    }
  }

  const mount = document.getElementById('player');
  LearnPlayer.create({
    mount,
    timeline: tl,
    steps: content.steps,
    stepDuration: 0.7,
    dwell: 2800,
    onStep
  });
})();
