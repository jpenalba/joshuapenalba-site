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

  const PCR_ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  const PCR_ICON_REPLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>';

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

  // oh = the 5'/3' overhang left by shearing at each strand end, px --
  // deliberately uneven and varied fragment-to-fragment (real shearing
  // produces a range of overhang sizes, not one fixed kind).
  const SMEAR = [
    { x: 70, y: 55, w: 110, oh: { topLeft: 4, topRight: 10, bottomLeft: 8, bottomRight: 3 } },
    { x: 230, y: 175, w: 75, oh: { topLeft: 12, topRight: 2, bottomLeft: 3, bottomRight: 9 } },
    { x: 470, y: 60, w: 135, oh: { topLeft: 2, topRight: 14, bottomLeft: 10, bottomRight: 4 } },
    { x: 545, y: 170, w: 90, oh: { topLeft: 9, topRight: 5, bottomLeft: 2, bottomRight: 12 } },
    { x: 95, y: 150, w: 80, oh: { topLeft: 6, topRight: 3, bottomLeft: 11, bottomRight: 6 } },
    { x: 560, y: 110, w: 100, oh: { topLeft: 3, topRight: 11, bottomLeft: 5, bottomRight: 2 } },
    { x: 300, y: 115, w: 150, oh: { topLeft: 10, topRight: 6, bottomLeft: 4, bottomRight: 13 } }
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

      // Bands are drawn a little wider than their well and with soft, rounded
      // ends -- real bands diffuse laterally past the lane they were loaded
      // in, rather than staying inside a crisp rectangle.
      const bx = lx - 5, bw = laneW + 10;
      const bandTop = wellY + 20;
      if (lane.type === 'ladder') {
        const rungs = 7;
        for (let r = 0; r < rungs; r++) {
          DNA.el('rect', {
            x: lx - 3, y: bandTop + r * ((GEL_H - 55) / rungs), width: laneW + 6, height: 5, rx: 2.5,
            fill: 'var(--gel-band)', opacity: 0.8
          }, svg);
        }
      } else if (lane.type === 'intact') {
        DNA.el('rect', { x: bx, y: bandTop, width: bw, height: 10, rx: 5, fill: 'var(--gel-band)' }, svg);
        DNA.el('rect', { x: bx, y: bandTop + 8, width: bw, height: 26, fill: 'url(#gelFadeTop)' }, svg);
      } else if (lane.type === 'moderate') {
        DNA.el('rect', { x: bx, y: bandTop, width: bw, height: 9, rx: 4.5, fill: 'var(--gel-band)', opacity: 0.6 }, svg);
        DNA.el('rect', { x: bx, y: bandTop + 6, width: bw, height: GEL_H - 80, fill: 'url(#gelFadeTop)' }, svg);
      } else if (lane.type === 'degraded') {
        DNA.el('rect', { x: bx, y: bandTop, width: bw, height: GEL_H - 55, fill: 'url(#gelFadeLow)' }, svg);
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

  function drawSonication(svg) {
    DNA.el('rect', { x: 80, y: 6, width: 10, height: 36, fill: 'var(--line-strong)' }, svg);
    DNA.el('path', { d: 'M80 42 L90 42 L87 55 L83 55 Z', fill: 'var(--line-strong)' }, svg);
    [0, 1, 2, 3, 4].forEach(i => {
      const a = (i / 4) * Math.PI + Math.PI;
      DNA.el('line', {
        x1: 85 + Math.cos(a) * 8, y1: 58 + Math.sin(a) * 6,
        x2: 85 + Math.cos(a) * 18, y2: 58 + Math.sin(a) * 13,
        stroke: 'var(--mol-highlight)', 'stroke-width': 1.8, opacity: 0.85
      }, svg);
    });
    DNA.el('path', { d: 'M65 65 L65 92 Q65 102 85 102 Q105 102 105 92 L105 65 Z', fill: 'none', stroke: 'var(--ink-soft)', 'stroke-width': 2 }, svg);
    DNA.el('path', { d: 'M67 82 L67 92 Q67 100 85 100 Q103 100 103 92 L103 82 Z', fill: 'var(--reg-read1)', opacity: 0.35 }, svg);
    DNA.el('rect', { x: 72, y: 90, width: 10, height: 4, rx: 2, fill: 'var(--mol-backbone)' }, svg);
    DNA.el('rect', { x: 86, y: 94, width: 8, height: 4, rx: 2, fill: 'var(--mol-backbone)' }, svg);
    DNA.el('rect', { x: 95, y: 88, width: 7, height: 4, rx: 2, fill: 'var(--mol-backbone)' }, svg);
    captionLines(svg, ['High-frequency sound', 'waves shear the DNA'], 118);
  }

  function drawEnzymatic(svg) {
    [[20, 30], [58, 28], [94, 30], [132, 26]].forEach(([x, w]) => {
      DNA.el('rect', { x, y: 56, width: w, height: 8, rx: 3, fill: 'var(--mol-backbone)' }, svg);
    });
    [53, 89, 127].forEach(x => {
      DNA.el('circle', { cx: x, cy: 46, r: 8.5, fill: 'var(--reg-i7)' }, svg);
      DNA.el('path', { d: `M${x} 46 L${x + 8.5} 46 A8.5 8.5 0 0 1 ${x} 54.5 Z`, fill: 'var(--bg-raised)' }, svg);
      DNA.el('line', { x1: x, y1: 54, x2: x, y2: 60, stroke: 'var(--reg-i7)', 'stroke-width': 1.5, 'stroke-dasharray': '2 2' }, svg);
    });
    captionLines(svg, ['Enzymes nick and cut', 'DNA at semi-random sites'], 118);
  }

  function drawTagmentation(svg) {
    DNA.el('rect', { x: 25, y: 56, width: 45, height: 8, rx: 3, fill: 'var(--mol-backbone)' }, svg);
    DNA.el('rect', { x: 100, y: 56, width: 45, height: 8, rx: 3, fill: 'var(--mol-backbone)' }, svg);
    DNA.el('rect', { x: 68, y: 53, width: 13, height: 13, rx: 2, fill: 'var(--reg-p7)' }, svg);
    DNA.el('rect', { x: 89, y: 53, width: 13, height: 13, rx: 2, fill: 'var(--reg-i7)' }, svg);
    DNA.el('ellipse', { cx: 85, cy: 38, rx: 24, ry: 14, fill: 'var(--reg-read1)', opacity: 0.55 }, svg);
    DNA.el('text', { x: 85, y: 42, 'text-anchor': 'middle', 'font-family': "'IBM Plex Mono', monospace", 'font-size': 10, fill: 'var(--ink)' }, svg).textContent = 'Tn5';
    captionLines(svg, ['Cuts and tags DNA', 'in a single step'], 118);
  }

  const ILLUS_DRAWERS = { nanodrop: drawNanodrop, qubit: drawQubit, sonication: drawSonication, enzymatic: drawEnzymatic, tagmentation: drawTagmentation };

  // Shared expandable "method" accordion used both for DNA-quantification
  // methods (mounted in the data panel) and fragmentation methods (mounted
  // in the stage card). Illustrations are drawn lazily, the first time a
  // panel is opened.
  function buildMethodAccordion(mount, methods, idPrefix) {
    const acc = document.createElement('div');
    acc.className = 'method-accordion';
    methods.forEach(m => {
      const item = document.createElement('div');
      item.className = 'method-item';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'method-toggle';
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = `<span class="method-chevron">›</span> ${m.label}`;
      const panelId = `method-panel-${idPrefix}-${m.id}`;
      btn.setAttribute('aria-controls', panelId);
      const panel = document.createElement('div');
      panel.className = 'method-panel';
      panel.id = panelId;
      panel.hidden = true;
      panel.innerHTML = `
        <svg class="method-illus" viewBox="0 0 170 135" role="img" aria-label="How ${m.label} works"></svg>
        <p class="method-summary">${m.summary}</p>
        <p class="method-detail">${m.detail}</p>
      `;
      btn.addEventListener('click', () => {
        const willOpen = panel.hidden;
        panel.hidden = !willOpen;
        btn.setAttribute('aria-expanded', String(willOpen));
        btn.classList.toggle('is-open', willOpen);
        if (willOpen && !panel.dataset.drawn) {
          const illusSvg = panel.querySelector('.method-illus');
          const draw = ILLUS_DRAWERS[m.id];
          if (draw) draw(illusSvg);
          panel.dataset.drawn = '1';
        }
      });
      item.appendChild(btn);
      item.appendChild(panel);
      acc.appendChild(item);
    });
    mount.appendChild(acc);
    return acc;
  }

  function drawSmear(svg, endStyle) {
    SMEAR.forEach(f => {
      if (endStyle === 'ragged') {
        // Freshly sheared: the two strands don't end at the same point, so
        // each fragment gets its own 5'/3' overhangs instead of a single
        // blunt bar.
        DNA.fragmentOverhang(svg, { x: f.x, y: f.y, width: f.w, height: 7, gap: 5, overhangs: f.oh });
        return;
      }
      // Blunt, end-repaired and A-tailed: two equal-length strand bars
      // (zero overhang), each strand's 5' phosphate and 3' A diagonally
      // opposite each other, since the strands are antiparallel.
      const height = 7, gap = 5;
      DNA.fragmentOverhang(svg, { x: f.x, y: f.y, width: f.w, height, gap, overhangs: {} });
      const topY = f.y - gap / 2 - height / 2;
      const botY = f.y + gap / 2 + height / 2;
      DNA.phosphateDot(svg, { x: f.x, y: topY, r: 6 });
      DNA.aTailSquare(svg, { x: f.x + f.w, y: topY, size: 11 });
      DNA.aTailSquare(svg, { x: f.x, y: botY, size: 11 });
      DNA.phosphateDot(svg, { x: f.x + f.w, y: botY, r: 6 });
    });
  }

  // Background fragments already carrying Y-adapters -- kept in the top and
  // bottom margins so they never overlap the large focal fragment in the
  // centre of the stage.
  const LIGATION_BG = [
    { x: 50, y: 32, w: 70 }, { x: 260, y: 22, w: 60 }, { x: 480, y: 35, w: 80 },
    { x: 70, y: 198, w: 65 }, { x: 420, y: 205, w: 70 }, { x: 560, y: 188, w: 55 }
  ];

  // One ligated adapter end: a short double-stranded "stem" (the primer
  // binding site) runs parallel, just past the insert, before each strand
  // peels off into its own single-stranded Y arm -- so the strands stay
  // parallel for a beat rather than forking the instant they clear the
  // insert.
  function drawYAdapterEnd(svg, { x, y, dir, fh, fgap, stemW, stemColor, armLength, spread, colorTop, colorBottom }) {
    const topY = y - fgap / 2 - fh / 2, botY = y + fgap / 2 + fh / 2;
    const stemX = dir === -1 ? x - stemW : x;
    DNA.fragmentOverhang(svg, { x: stemX, y, width: stemW, height: fh, gap: fgap, color: stemColor, overhangs: {} });
    const armX = dir === -1 ? x - stemW : x + stemW;
    DNA.yAdapterEnd(svg, { x: armX, topY, botY, dir, armLength, spread, strokeWidth: fh, colorTop, colorBottom });
  }

  function drawAdapterLigation(svg) {
    LIGATION_BG.forEach(f => {
      const fh = 5, fgap = 3, stemW = 6, armLength = 12, spread = 7;
      DNA.fragmentOverhang(svg, { x: f.x, y: f.y, width: f.w, height: fh, gap: fgap, overhangs: {} });
      drawYAdapterEnd(svg, {
        x: f.x, y: f.y, dir: -1, fh, fgap, stemW, stemColor: 'var(--reg-read1)', armLength, spread,
        colorTop: 'var(--reg-p5)', colorBottom: 'var(--reg-i5)'
      });
      drawYAdapterEnd(svg, {
        x: f.x + f.w, y: f.y, dir: 1, fh, fgap, stemW, stemColor: 'var(--reg-read2)', armLength, spread,
        colorTop: 'var(--reg-p7)', colorBottom: 'var(--reg-i7)'
      });
    });

    // Focal fragment: two equal strand bars (as in End repair/A-tailing),
    // each continuing into a short primer-site stem and then its own
    // Y-adapter arm -- top strand becomes the P5/P7 arm, bottom strand
    // becomes the i5/i7 arm -- with the A/T overhang pairing that gives
    // the ligation its specificity called out at each junction.
    const fh = 12, fgap = 8, stemW = 18, armLength = 44, spread = 26;
    DNA.fragmentOverhang(svg, { x: FOCAL_X, y: MID_Y, width: FOCAL_W, height: fh, gap: fgap, overhangs: {} });
    drawYAdapterEnd(svg, {
      x: FOCAL_X, y: MID_Y, dir: -1, fh, fgap, stemW, stemColor: 'var(--reg-read1)', armLength, spread,
      colorTop: 'var(--reg-p5)', colorBottom: 'var(--reg-i5)'
    });
    drawYAdapterEnd(svg, {
      x: FOCAL_X + FOCAL_W, y: MID_Y, dir: 1, fh, fgap, stemW, stemColor: 'var(--reg-read2)', armLength, spread,
      colorTop: 'var(--reg-p7)', colorBottom: 'var(--reg-i7)'
    });

    // A/T pairing at each junction, diagonally opposite as in End repair/
    // A-tailing: the insert's own A-tail sits top-right/bottom-left, and
    // the adapter's complementary T-overhang sits top-left/bottom-right.
    const markerSize = 13;
    const topMarkerY = MID_Y - markerSize / 2 - 1;
    const botMarkerY = MID_Y + markerSize / 2 + 1;
    DNA.tOverhangSquare(svg, { x: FOCAL_X, y: topMarkerY, size: markerSize });
    DNA.aTailSquare(svg, { x: FOCAL_X, y: botMarkerY, size: markerSize });
    DNA.aTailSquare(svg, { x: FOCAL_X + FOCAL_W, y: topMarkerY, size: markerSize });
    DNA.tOverhangSquare(svg, { x: FOCAL_X + FOCAL_W, y: botMarkerY, size: markerSize });
  }

  // ---------- Library PCR: replayable exponential-amplification animation ----------
  // A single molecule (the Y-adapter-ligated fragment carried over from Step
  // 5) is placed on a 16x16 grid of "slots" in a fixed local coordinate
  // space; a camera group then scales/pans over that space so cycle 1 reads
  // as a large, detailed close-up and cycle 8 reads as a zoomed-out box
  // packed with 256 tiny molecules -- one continuous zoom standing in for
  // "slowly fill the box," without animating 256 molecules individually.
  const PCR_COLS = 16, PCR_ROWS = 16, PCR_CELL_W = 40, PCR_CELL_H = 22;
  const PCR_VIEW_W = 660, PCR_VIEW_H = 178, PCR_VIEW_X = (STAGE_W - PCR_VIEW_W) / 2, PCR_VIEW_Y = 44;
  const PCR_PAD_X = 10, PCR_PAD_Y = 8;

  function pcrSlotPos(i) {
    const col = i % PCR_COLS, row = Math.floor(i / PCR_COLS);
    return { x: col * PCR_CELL_W + PCR_CELL_W / 2, y: row * PCR_CELL_H + PCR_CELL_H / 2 };
  }

  // Frames a bounding box (plus a fixed padding, so molecule ends are never
  // flush with the stage edge) centered in the view, capped at 6x so a
  // single molecule doesn't blow up absurdly large.
  function pcrCameraFromBBox(centerX, centerY, bboxW, bboxH) {
    const w = bboxW + PCR_PAD_X * 2, h = bboxH + PCR_PAD_Y * 2;
    const s = Math.min(6, PCR_VIEW_W / w, PCR_VIEW_H / h);
    return {
      s,
      tx: PCR_VIEW_X + PCR_VIEW_W / 2 - s * centerX,
      ty: PCR_VIEW_Y + PCR_VIEW_H / 2 - s * centerY
    };
  }

  function pcrCameraForGrid(activeCount) {
    const rows = Math.max(1, Math.ceil(activeCount / PCR_COLS));
    const cols = rows === 1 ? activeCount : PCR_COLS;
    const bboxW = cols * PCR_CELL_W, bboxH = rows * PCR_CELL_H;
    return pcrCameraFromBBox(bboxW / 2, bboxH / 2, bboxW, bboxH);
  }

  function pcrSetCamera(cameraGroup, cam) {
    cameraGroup.setAttribute('transform', `translate(${cam.tx},${cam.ty}) scale(${cam.s})`);
  }

  // A resolved, fully double-stranded molecule: a grey core (the insert +
  // primer-binding sites) capped with small coloured segments at each end
  // (P5/P7 on the strand that reads as "top", i5/i7 on the strand that
  // reads as "bottom") so even tiny, heavily-amplified copies still read
  // as "this came from an adapter-ligated fragment," not a plain grey bar.
  function pcrMoleculeWithCaps(parent, x, y, w, capW) {
    const g = DNA.group(parent, { class: 'pcr-molecule' });
    const fh = 3, fgap = 2;
    const rows = [
      { y: y - fgap / 2 - fh, left: 'var(--reg-p5)', right: 'var(--reg-p7)' },
      { y: y + fgap / 2, left: 'var(--reg-i5)', right: 'var(--reg-i7)' }
    ];
    rows.forEach(r => {
      DNA.el('rect', { x: x - w / 2, y: r.y, width: capW, height: fh, fill: r.left }, g);
      DNA.el('rect', { x: x - w / 2 + capW, y: r.y, width: w - capW * 2, height: fh, rx: 1, fill: 'var(--mol-backbone)' }, g);
      DNA.el('rect', { x: x + w / 2 - capW, y: r.y, width: capW, height: fh, fill: r.right }, g);
    });
    return g;
  }

  function buildPCRAnimation(svg, cycles) {
    svg.innerHTML = '';
    const counter = DNA.el('text', {
      x: STAGE_W / 2, y: 22, 'text-anchor': 'middle', 'font-family': "'IBM Plex Mono', monospace",
      'font-size': 15, fill: 'var(--ink-soft)'
    }, svg);
    counter.textContent = `Cycle 0 of ${cycles}`;

    const camera = DNA.group(svg, { class: 'pcr-camera' });

    // innerW is the inner grey span that never changes; bluntW (= innerW +
    // 2*capW) is the fully-resolved molecule's total width, matching every
    // other molecule on the grid. Pre-resolution, each arm reaches out an
    // extra armLength beyond innerW, diagonally -- cycle 1 straightens and
    // shortens that reach down to exactly capW, so the arm ends up
    // occupying precisely where its resolved end-cap belongs.
    const fh = 3, fgap = 2, armLength = 13, spread = 9, innerW = 18, capW = 6, bluntW = innerW + capW * 2;
    const p0 = pcrSlotPos(0), p1 = pcrSlotPos(1);
    const topY = p0.y - fgap / 2 - fh, botY = p0.y + fgap / 2;

    // The seed camera frames the whole molecule -- core plus both diagonal
    // arms -- so the colourful adapter ends are the focus from the very
    // first frame, not just the grey insert in the middle.
    const seedCam = pcrCameraFromBBox(p0.x, p0.y, innerW + armLength * 2, 2 * (fgap / 2 + fh / 2 + spread));
    pcrSetCamera(camera, seedCam);
    const cam = { s: seedCam.s, tx: seedCam.tx, ty: seedCam.ty };

    // Seed molecule: the Y-adapter-ligated fragment from Step 5, drawn as two
    // independent strand groups so they can be pulled apart on denaturing.
    const topStrand = DNA.group(camera, { class: 'pcr-top-strand' });
    const botStrand = DNA.group(camera, { class: 'pcr-bot-strand' });
    DNA.el('rect', { x: p0.x - innerW / 2, y: topY, width: innerW, height: fh, fill: 'var(--mol-backbone)' }, topStrand);
    DNA.el('rect', { x: p0.x - innerW / 2, y: botY, width: innerW, height: fh, fill: 'var(--mol-backbone)' }, botStrand);
    const topLeftArm = DNA.el('line', { x1: p0.x - innerW / 2, y1: topY + fh / 2, x2: p0.x - innerW / 2 - armLength, y2: topY + fh / 2 - spread, stroke: 'var(--reg-p5)', 'stroke-width': fh, 'stroke-linecap': 'round' }, topStrand);
    const topRightArm = DNA.el('line', { x1: p0.x + innerW / 2, y1: topY + fh / 2, x2: p0.x + innerW / 2 + armLength, y2: topY + fh / 2 - spread, stroke: 'var(--reg-p7)', 'stroke-width': fh, 'stroke-linecap': 'round' }, topStrand);
    const botLeftArm = DNA.el('line', { x1: p0.x - innerW / 2, y1: botY + fh / 2, x2: p0.x - innerW / 2 - armLength, y2: botY + fh / 2 + spread, stroke: 'var(--reg-i5)', 'stroke-width': fh, 'stroke-linecap': 'round' }, botStrand);
    const botRightArm = DNA.el('line', { x1: p0.x + innerW / 2, y1: botY + fh / 2, x2: p0.x + innerW / 2 + armLength, y2: botY + fh / 2 + spread, stroke: 'var(--reg-i7)', 'stroke-width': fh, 'stroke-linecap': 'round' }, botStrand);

    // Primers (hidden until cycle 1's anneal step, which only happens once
    // each strand has finished straightening): one at the far end of the
    // top strand's left arm, one at the far end of the bottom strand's
    // right arm -- the actual P5/P7 sequence, not the core edge.
    // The primer anneals to the template strand but, being antiparallel,
    // physically sits on the opposite (complementary) row -- the row the
    // new strand it seeds will occupy -- not on the template's own row.
    const primerLen = 6;
    const primerTop = DNA.el('rect', { x: p0.x - bluntW / 2, y: botY, width: primerLen, height: fh, fill: 'var(--accent)', opacity: 0 }, topStrand);
    const primerBot = DNA.el('rect', { x: p0.x + bluntW / 2 - primerLen, y: topY, width: primerLen, height: fh, fill: 'var(--accent)', opacity: 0 }, botStrand);

    // New complementary strand for the top-strand molecule, grown outward
    // from its primer during cycle 1's extend step -- scaleX anchored at
    // the primer end so the bar reads as "growing," spanning the full
    // resolved width and already carrying the i5/i7 end-caps its finished
    // form will keep (the opposite colour pairing from the template
    // strand it's completing).
    const newStrandTop = DNA.group(topStrand, { class: 'pcr-new-strand' });
    DNA.el('rect', { x: p0.x - bluntW / 2, y: botY, width: capW, height: fh, fill: 'var(--reg-i5)' }, newStrandTop);
    DNA.el('rect', { x: p0.x - bluntW / 2 + capW, y: botY, width: bluntW - capW * 2, height: fh, fill: 'var(--mol-backbone)' }, newStrandTop);
    DNA.el('rect', { x: p0.x + bluntW / 2 - capW, y: botY, width: capW, height: fh, fill: 'var(--reg-i7)' }, newStrandTop);
    gsap.set(newStrandTop, { scaleX: 0, transformOrigin: 'left center' });

    const newStrandBot = DNA.group(botStrand, { class: 'pcr-new-strand' });
    DNA.el('rect', { x: p0.x - bluntW / 2, y: topY, width: capW, height: fh, fill: 'var(--reg-p5)' }, newStrandBot);
    DNA.el('rect', { x: p0.x - bluntW / 2 + capW, y: topY, width: bluntW - capW * 2, height: fh, fill: 'var(--mol-backbone)' }, newStrandBot);
    DNA.el('rect', { x: p0.x + bluntW / 2 - capW, y: topY, width: capW, height: fh, fill: 'var(--reg-p7)' }, newStrandBot);
    gsap.set(newStrandBot, { scaleX: 0, transformOrigin: 'right center' });

    // Pre-built molecules for every slot beyond the first two -- hidden
    // until the cycle they're born in pops them into view. Pre-building
    // (rather than drawing on the fly) is what makes the whole sequence
    // cleanly replayable: nothing is created or destroyed during playback,
    // only animated.
    const laterMolecules = [];
    for (let i = 2; i < PCR_COLS * PCR_ROWS; i++) {
      const p = pcrSlotPos(i);
      const g = pcrMoleculeWithCaps(camera, p.x, p.y, bluntW, capW);
      gsap.set(g, { opacity: 0, scale: 0.3, transformOrigin: '50% 50%' });
      laterMolecules.push(g);
    }

    const tl = gsap.timeline({ paused: true });
    function camTo(activeCount, duration) {
      const target = pcrCameraForGrid(activeCount);
      tl.to(cam, { s: target.s, tx: target.tx, ty: target.ty, duration, onUpdate: () => pcrSetCamera(camera, cam) }, '<');
    }

    // Reset everything a plain JS object (the camera) or plain text
    // (the counter) holds -- these aren't DOM style properties, so
    // restarting the timeline doesn't revert them on its own the way it
    // does for opacity/scale/etc; without this, Replay would start the
    // molecule count and counter from wherever cycle 8 left them.
    tl.set(cam, { s: seedCam.s, tx: seedCam.tx, ty: seedCam.ty, onComplete: () => pcrSetCamera(camera, cam) }, 0)
      .call(() => { counter.textContent = `Cycle 0 of ${cycles}`; }, null, 0);

    // --- Cycle 1: denature -> bend each arm straight -> anneal (one primer
    // per strand, now at the straightened tip) -> extend -> settle ---
    tl.to(topStrand, { y: -9, duration: 1.1, ease: 'power1.inOut' }, 0)
      .to(botStrand, { y: 9, duration: 1.1, ease: 'power1.inOut' }, '<')
      .to(topLeftArm, { attr: { x2: p0.x - bluntW / 2, y2: topY + fh / 2 }, duration: 1.2, ease: 'power1.inOut' }, '>')
      .to(topRightArm, { attr: { x2: p0.x + bluntW / 2, y2: topY + fh / 2 }, duration: 1.2, ease: 'power1.inOut' }, '<')
      .to(botLeftArm, { attr: { x2: p0.x - bluntW / 2, y2: botY + fh / 2 }, duration: 1.2, ease: 'power1.inOut' }, '<')
      .to(botRightArm, { attr: { x2: p0.x + bluntW / 2, y2: botY + fh / 2 }, duration: 1.2, ease: 'power1.inOut' }, '<')
      .to([primerTop, primerBot], { opacity: 1, duration: 0.55 })
      .to(newStrandTop, { scaleX: 1, duration: 1.4, ease: 'none' }, '>')
      .to(newStrandBot, { scaleX: 1, duration: 1.4, ease: 'none' }, '<')
      .to([primerTop, primerBot], { opacity: 0, duration: 0.5 }, '<0.7')
      .call(() => { counter.textContent = `Cycle 1 of ${cycles}`; })
      .to(topStrand, { x: 0, y: 0, duration: 0.9, ease: 'power1.inOut' }, '>')
      .to(botStrand, { x: p1.x - p0.x, y: 0, duration: 0.9, ease: 'power1.inOut' }, '<');
    camTo(2, 0.9);

    // --- Cycles 2-8: primers now anneal at both ends of every molecule;
    // shown as a generic doubling pulse rather than redrawing the full
    // denature/anneal/extend sequence on every one of up to 128 molecules. ---
    for (let c = 2; c <= cycles; c++) {
      const before = Math.min(1 << (c - 1), PCR_COLS * PCR_ROWS);
      const after = Math.min(1 << c, PCR_COLS * PCR_ROWS);
      const visibleBefore = [topStrand, botStrand, ...laterMolecules.slice(0, before - 2)];
      tl.to(visibleBefore, { scale: 1.12, duration: 0.27, yoyo: true, repeat: 1, transformOrigin: '50% 50%' }, '>0.15');
      const newOnes = laterMolecules.slice(before - 2, after - 2);
      if (newOnes.length) {
        tl.to(newOnes, { opacity: 1, scale: 1, duration: 0.6, stagger: 0.012 }, '<0.22');
      }
      camTo(after, 0.75);
      tl.call(() => { counter.textContent = `Cycle ${c} of ${cycles}`; }, null, '<0.3');
    }

    return { timeline: tl };
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

  // "Anatomy of the final library" -- a callback sub-section consolidated
  // into Library PCR, self-contained so it no longer needs special-casing
  // by step id in the main per-step loop.
  function buildFinalAnatomySection(mount, data) {
    mount.innerHTML = `
      <div class="breakit-head"><h3>${data.title}</h3></div>
      <div class="stage-card final-anatomy-stage-card">
        <svg class="final-anatomy-stage" viewBox="0 0 ${STAGE_W} ${STAGE_H}" role="img" aria-label="Anatomy of the final sequencer-ready library molecule"></svg>
        <p class="region-info">Hover or tap a region above to see what it does.</p>
        <p class="size-marker-widget mono">Insert ≈ ${data.sizeMarkers.insert} bp &nbsp;•&nbsp; Library ≈ ${data.sizeMarkers.library} bp</p>
      </div>
    `;
    drawFinalAnatomy(mount.querySelector('.final-anatomy-stage'), mount.querySelector('.region-info'), data.sizeMarkers);
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
  const TRACE_VIEW_H = TRACE_H + 48; // extra room below the plot for larger axis labels, with space between the two rows
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

  function drawTraceAxis(svg) {
    DNA.el('line', { x1: TRACE_PAD, y1: TRACE_H - TRACE_PAD, x2: TRACE_W - TRACE_PAD, y2: TRACE_H - TRACE_PAD, stroke: 'var(--line-strong)', 'stroke-width': 1 }, svg);
    [0, 250, 500, 750, 1000].forEach(bp => {
      DNA.el('text', { x: bpToX(bp), y: TRACE_H + 18, 'text-anchor': 'middle', 'font-family': "'IBM Plex Mono', monospace", 'font-size': 16, fill: 'var(--ink-soft)' }, svg).textContent = bp;
    });
    DNA.el('text', { x: TRACE_W / 2, y: TRACE_H + 42, 'text-anchor': 'middle', 'font-family': "'IBM Plex Mono', monospace", 'font-size': 15, fill: 'var(--ink-soft)' }, svg).textContent = 'fragment size (bp)';
  }

  function buildTrace(svg, peaks) {
    drawTraceAxis(svg);
    const path = DNA.el('path', { d: tracePathD(peaks), fill: 'var(--accent)', opacity: 0.22, stroke: 'var(--accent)', 'stroke-width': 1.6 }, svg);
    return path;
  }

  // Calls out one peak on the trace with a short leader line + label, e.g.
  // identifying a small secondary peak as adapter contamination.
  function drawTraceAnnotation(svg, peak, label) {
    const x = TRACE_PAD + (peak.center / 1000) * (TRACE_W - TRACE_PAD * 2);
    const y = (TRACE_H - TRACE_PAD) - peak.height * (TRACE_H - TRACE_PAD * 2);
    DNA.el('line', { x1: x, y1: y - 4, x2: x, y2: y - 24, stroke: 'var(--ink-faint)', 'stroke-width': 1.3 }, svg);
    DNA.el('text', { x: x + 6, y: y - 16, 'text-anchor': 'start', 'font-family': "'IBM Plex Mono', monospace", 'font-size': 11, fill: 'var(--ink-soft)' }, svg).textContent = label;
  }

  // ---------- Fragmentation QC: a gel of under/perfectly/over-sheared samples
  // next to their size-distribution curves, cross-linked by hover/focus. Both
  // are derived from the same { center, width, height } per sample, so the
  // gel band and its curve always agree.
  // Joins a two-line gel label ("Under-"/"sheared") into one line without an
  // odd space after a hyphen that was only there to break the gel caption.
  function joinLabel(label) {
    return label.reduce((acc, part) => acc + (acc.endsWith('-') ? '' : acc ? ' ' : '') + part, '');
  }

  const GELQC_BP_MIN = 60, GELQC_BP_MAX = 1050;
  function bpToGelY(bp, yTop, yBottom) {
    const t = (bp - GELQC_BP_MIN) / (GELQC_BP_MAX - GELQC_BP_MIN);
    return yBottom - t * (yBottom - yTop);
  }

  function drawFragQCGel(svg, data) {
    const GEL_X = 60, GEL_Y = 20, GEL_W = STAGE_W - 120, GEL_H = STAGE_H - 70;
    DNA.el('rect', { x: GEL_X, y: GEL_Y, width: GEL_W, height: GEL_H, rx: 10, fill: 'var(--gel-bg)' }, svg);

    const yTop = GEL_Y + 34, yBottom = GEL_Y + GEL_H - 14;
    const lanes = ['ladder', ...data.samples.map(s => s.id)];
    const margin = 32;
    const usable = GEL_W - margin * 2;
    const slot = usable / lanes.length;
    const laneW = Math.min(70, slot - 24);
    const hitRects = {};

    lanes.forEach((laneId, i) => {
      const cx = GEL_X + margin + slot * i + slot / 2;
      const lx = cx - laneW / 2;
      DNA.el('rect', { x: lx, y: GEL_Y + 16, width: laneW, height: 9, rx: 2, fill: 'var(--gel-well)' }, svg);

      // Bands are drawn a little wider than their well, with soft rounded
      // ends -- real bands diffuse laterally past the lane they were loaded
      // in, rather than staying inside a crisp rectangle.
      const bx = lx - 5, bw = laneW + 10;

      if (laneId === 'ladder') {
        data.ladderBands.forEach(bp => {
          const y = bpToGelY(bp, yTop, yBottom);
          const bright = data.ladderBright.includes(bp);
          DNA.el('rect', { x: lx - 3, y: y - 2.5, width: laneW + 6, height: 5, rx: 2.5, fill: 'var(--gel-band)', opacity: bright ? 0.95 : 0.5 }, svg);
        });
        DNA.el('text', { x: cx, y: GEL_Y + GEL_H + 20, 'text-anchor': 'middle', 'font-family': "'IBM Plex Mono', monospace", 'font-size': 11, fill: 'var(--ink-soft)' }, svg).textContent = 'Ladder';
        return;
      }

      const s = data.samples.find(x => x.id === laneId);
      const steps = 44;
      for (let k = 0; k <= steps; k++) {
        const bp = GELQC_BP_MIN + (GELQC_BP_MAX - GELQC_BP_MIN) * (k / steps);
        const v = s.height * Math.exp(-((bp - s.center) ** 2) / (2 * s.width * s.width));
        if (v < 0.03) continue;
        const y = bpToGelY(bp, yTop, yBottom);
        const h = (yBottom - yTop) / steps + 1.4;
        DNA.el('rect', { x: bx, y: y - h / 2, width: bw, height: h, rx: Math.min(h / 2, 2.5), fill: s.color, opacity: Math.min(0.92, v) }, svg);
      }

      const hit = DNA.el('rect', {
        x: bx - 2, y: GEL_Y + 10, width: bw + 4, height: GEL_H - 6, fill: 'transparent',
        tabindex: 0, role: 'button', 'aria-label': `${joinLabel(s.label)} sample`, class: 'dna-region-hit'
      }, svg);
      hitRects[s.id] = hit;

      s.label.forEach((line, li) => {
        DNA.el('text', {
          x: cx, y: GEL_Y + GEL_H + 20 + li * 14, 'text-anchor': 'middle',
          'font-family': "'IBM Plex Mono', monospace", 'font-size': 11, fill: 'var(--ink-soft)'
        }, svg).textContent = line;
      });
    });

    return hitRects;
  }

  function drawFragQCTraces(svg, data) {
    drawTraceAxis(svg);
    const paths = {};
    data.samples.forEach(s => {
      const d = tracePathD([{ center: s.center, height: s.height, width: s.width }]);
      paths[s.id] = DNA.el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2.4 }, svg);
    });
    return paths;
  }

  // A qPCR amplification curve: lag phase, exponential rise through a
  // threshold, then plateau. Ct (the cycle at which the curve crosses the
  // threshold) is what quantification actually reads off the plot.
  function drawQPCRCurve(svg, data) {
    const padL = 64, padR = 30, padT = 24, padB = 44;
    const x0 = padL, x1 = STAGE_W - padR, y0 = STAGE_H - padB, y1 = padT;
    DNA.el('line', { x1: x0, y1: y0, x2: x1, y2: y0, stroke: 'var(--line-strong)', 'stroke-width': 1 }, svg);
    DNA.el('line', { x1: x0, y1: y0, x2: x0, y2: y1, stroke: 'var(--line-strong)', 'stroke-width': 1 }, svg);

    const maxCycle = data.maxCycle || 40;
    const xAt = c => x0 + (c / maxCycle) * (x1 - x0);
    [0, 10, 20, 30, 40].forEach(c => {
      DNA.el('text', { x: xAt(c), y: y0 + 20, 'text-anchor': 'middle', 'font-family': "'IBM Plex Mono', monospace", 'font-size': 13, fill: 'var(--ink-soft)' }, svg).textContent = c;
    });
    DNA.el('text', { x: (x0 + x1) / 2, y: y0 + 38, 'text-anchor': 'middle', 'font-family': "'IBM Plex Mono', monospace", 'font-size': 13, fill: 'var(--ink-soft)' }, svg).textContent = 'PCR cycle';
    DNA.el('text', {
      x: padL - 46, y: (y0 + y1) / 2, 'text-anchor': 'middle', 'font-family': "'IBM Plex Mono', monospace", 'font-size': 12, fill: 'var(--ink-soft)',
      transform: `rotate(-90 ${padL - 46} ${(y0 + y1) / 2})`
    }, svg).textContent = 'Fluorescence (RFU)';

    const ct = data.ct || 22, k = 1.3, baseline = 0.04, plateau = 0.92;
    const yAt = v => y0 - v * (y0 - y1);
    const thresholdV = baseline + (plateau - baseline) * 0.12;

    const n = 100;
    let d = '';
    for (let i = 0; i <= n; i++) {
      const c = (i / n) * maxCycle;
      const v = baseline + (plateau - baseline) / (1 + Math.exp(-(c - ct) / k));
      d += (i === 0 ? 'M' : ' L') + ` ${xAt(c)} ${yAt(v)}`;
    }
    DNA.el('path', { d, fill: 'none', stroke: 'var(--reg-p7)', 'stroke-width': 2.6 }, svg);

    DNA.el('line', { x1: x0, y1: yAt(thresholdV), x2: x1, y2: yAt(thresholdV), stroke: 'var(--ink-faint)', 'stroke-width': 1.5, 'stroke-dasharray': '4 4' }, svg);
    DNA.el('text', { x: x1, y: yAt(thresholdV) - 7, 'text-anchor': 'end', 'font-family': "'IBM Plex Mono', monospace", 'font-size': 11, fill: 'var(--ink-faint)' }, svg).textContent = 'threshold';

    DNA.el('line', { x1: xAt(ct), y1: yAt(thresholdV), x2: xAt(ct), y2: y0, stroke: 'var(--reg-p7)', 'stroke-width': 1.3, 'stroke-dasharray': '3 3' }, svg);
    DNA.el('text', { x: xAt(ct) + 8, y: yAt(thresholdV) + 20, 'text-anchor': 'start', 'font-family': "'IBM Plex Mono', monospace", 'font-size': 13, fill: 'var(--reg-p7)', 'font-weight': 700 }, svg).textContent = `Ct ≈ ${ct}`;
  }

  // "Library QC (optional)" -- consolidated into Library PCR rather than a
  // standalone step, same as Fragmentation QC. Two side-by-side images:
  // a gel (does the library look roughly the right size?) and a qPCR
  // amplification curve (how many molecules are actually there?).
  function buildLibraryQC(mount, data) {
    mount.innerHTML = `
      <div class="breakit-head"><h3>${data.title}</h3></div>
      <p class="breakit-text">${data.caption}</p>
      <div class="libqc-visual">
        <div class="stage-card">
          <svg class="libqc-gel" viewBox="0 0 ${STAGE_W} ${STAGE_H}" role="img" aria-label="Gel electrophoresis of three successful libraries against a 100bp ladder"></svg>
        </div>
        <div class="stage-card">
          <svg class="libqc-qpcr" viewBox="0 0 ${STAGE_W} ${STAGE_H}" role="img" aria-label="qPCR amplification curve used to quantify a library"></svg>
        </div>
      </div>
    `;
    drawFragQCGel(mount.querySelector('.libqc-gel'), data.gel);
    drawQPCRCurve(mount.querySelector('.libqc-qpcr'), data.qpcr);
  }

  // ---------- "Break it" mode: common fragmentation failures ----------
  const BREAKIT_W = 640, BREAKIT_H = 140;

  // Under/over-shearing: the same handful of fragments, scaled larger or
  // smaller than the target size -- the quickest way to show "too big" or
  // "too small" without a full population smear.
  function drawBreakItSizeFailure(svg, scale) {
    const xs = [55, 190, 325, 430, 545];
    const baseWidths = [55, 80, 40, 95, 65];
    const ys = [55, 90, 60, 95, 45];
    xs.forEach((x, i) => {
      DNA.fragmentBar(svg, { x, y: ys[i], width: baseWidths[i] * scale, height: 14, color: 'var(--reg-p7)' });
    });
  }

  // GC bias: a strand of alternating GC-rich / AT-rich stretches, cut mostly
  // near the GC-rich edges rather than evenly along its length.
  function drawBreakItGCBias(svg) {
    const y = 78;
    const segs = [
      { x: 30, w: 70, gc: true }, { x: 100, w: 50, gc: false }, { x: 150, w: 65, gc: true },
      { x: 215, w: 55, gc: false }, { x: 270, w: 70, gc: true }, { x: 340, w: 60, gc: false },
      { x: 400, w: 75, gc: true }, { x: 475, w: 55, gc: false }, { x: 530, w: 60, gc: true }
    ];
    segs.forEach(s => {
      DNA.el('rect', { x: s.x, y: y - 7, width: s.w, height: 14, fill: s.gc ? 'var(--reg-read1)' : 'var(--reg-i5)', opacity: 0.55 }, svg);
    });
    [100, 150, 270, 340, 400, 530].forEach(x => {
      DNA.el('line', { x1: x, y1: y - 16, x2: x, y2: y + 16, stroke: 'var(--ink)', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, svg);
    });
    DNA.el('rect', { x: 30, y: 18, width: 12, height: 12, rx: 2, fill: 'var(--reg-read1)', opacity: 0.55 }, svg);
    DNA.el('text', { x: 48, y: 28, 'font-family': "'IBM Plex Mono', monospace", 'font-size': 11, fill: 'var(--ink-soft)' }, svg).textContent = 'GC-rich';
    DNA.el('rect', { x: 125, y: 18, width: 12, height: 12, rx: 2, fill: 'var(--reg-i5)', opacity: 0.55 }, svg);
    DNA.el('text', { x: 143, y: 28, 'font-family': "'IBM Plex Mono', monospace", 'font-size': 11, fill: 'var(--ink-soft)' }, svg).textContent = 'AT-rich';
  }

  function drawGCCoverageChart(svg) {
    DNA.el('line', { x1: TRACE_PAD, y1: TRACE_H - TRACE_PAD, x2: TRACE_W - TRACE_PAD, y2: TRACE_H - TRACE_PAD, stroke: 'var(--line-strong)', 'stroke-width': 1 }, svg);
    [0, 25, 50, 75, 100].forEach(g => {
      const gx = TRACE_PAD + (g / 100) * (TRACE_W - TRACE_PAD * 2);
      DNA.el('text', { x: gx, y: TRACE_H + 18, 'text-anchor': 'middle', 'font-family': "'IBM Plex Mono', monospace", 'font-size': 16, fill: 'var(--ink-soft)' }, svg).textContent = g;
    });
    DNA.el('text', { x: TRACE_W / 2, y: TRACE_H + 42, 'text-anchor': 'middle', 'font-family': "'IBM Plex Mono', monospace", 'font-size': 15, fill: 'var(--ink-soft)' }, svg).textContent = '% GC content';

    const topY = TRACE_PAD, botY = TRACE_H - TRACE_PAD, range = botY - topY;
    const x = g => TRACE_PAD + (g / 100) * (TRACE_W - TRACE_PAD * 2);
    const covY = v => botY - v * 0.55 * range;

    DNA.el('line', { x1: TRACE_PAD, y1: covY(1), x2: TRACE_W - TRACE_PAD, y2: covY(1), stroke: 'var(--ink-faint)', 'stroke-width': 1.5, 'stroke-dasharray': '4 4' }, svg);
    DNA.el('text', { x: TRACE_W - TRACE_PAD, y: covY(1) - 7, 'text-anchor': 'end', 'font-family': "'IBM Plex Mono', monospace", 'font-size': 11, fill: 'var(--ink-faint)' }, svg).textContent = 'expected (even)';

    const n = 100;
    let d = '';
    for (let i = 0; i <= n; i++) {
      const g = (i / n) * 100;
      const v = 1 - 0.65 * (((g - 50) / 50) ** 2);
      d += (i === 0 ? 'M' : ' L') + ` ${x(g)} ${covY(v)}`;
    }
    DNA.el('path', { d, fill: 'none', stroke: 'var(--reg-p7)', 'stroke-width': 2.4 }, svg);
  }

  // Adapter dimer: two Y-adapters ligated straight to each other, with the
  // "insert" collapsed to almost nothing -- the short, no-insert product
  // that out-competes real library molecules during PCR.
  function drawBreakItAdapterDimer(svg) {
    const cx = BREAKIT_W / 2, cy = BREAKIT_H / 2;
    const fh = 11, fgap = 7, stemW = 14, armLength = 38, spread = 25;
    const topY = cy - fgap / 2 - fh / 2, botY = cy + fgap / 2 + fh / 2;
    const w = 26;
    const leftX = cx - w / 2, rightX = cx + w / 2;
    DNA.fragmentOverhang(svg, { x: leftX, y: cy, width: w, height: fh, gap: fgap, overhangs: {} });
    drawYAdapterEnd(svg, {
      x: leftX, y: cy, dir: -1, fh, fgap, stemW, stemColor: 'var(--reg-read1)', armLength, spread,
      colorTop: 'var(--reg-p5)', colorBottom: 'var(--reg-i5)'
    });
    drawYAdapterEnd(svg, {
      x: rightX, y: cy, dir: 1, fh, fgap, stemW, stemColor: 'var(--reg-read2)', armLength, spread,
      colorTop: 'var(--reg-p7)', colorBottom: 'var(--reg-i7)'
    });
    DNA.el('text', {
      x: cx, y: topY - spread - 10, 'text-anchor': 'middle',
      'font-family': "'IBM Plex Mono', monospace", 'font-size': 13, fill: 'var(--ink-soft)'
    }, svg).textContent = '~120 bp, no insert';
  }

  // Chimeric ligation: two insert fragments joined directly to each other
  // (no adapter at the junction) before adapters cap the two true outer
  // ends -- a fusion the trace can't distinguish from a real long insert.
  function drawBreakItChimera(svg) {
    const cx = BREAKIT_W / 2, cy = BREAKIT_H / 2;
    const fh = 11, fgap = 7, stemW = 14, armLength = 38, spread = 25;
    const topY = cy - fgap / 2 - fh / 2, botY = cy + fgap / 2 + fh / 2;
    const segW = 120, totalW = segW * 2;
    const leftX = cx - totalW / 2, rightX = cx + totalW / 2;
    DNA.fragmentOverhang(svg, { x: leftX, y: cy, width: totalW, height: fh, gap: fgap, overhangs: {} });
    drawYAdapterEnd(svg, {
      x: leftX, y: cy, dir: -1, fh, fgap, stemW, stemColor: 'var(--reg-read1)', armLength, spread,
      colorTop: 'var(--reg-p5)', colorBottom: 'var(--reg-i5)'
    });
    drawYAdapterEnd(svg, {
      x: rightX, y: cy, dir: 1, fh, fgap, stemW, stemColor: 'var(--reg-read2)', armLength, spread,
      colorTop: 'var(--reg-p7)', colorBottom: 'var(--reg-i7)'
    });
    const midX = leftX + segW;
    DNA.el('line', {
      x1: midX, y1: topY - 6, x2: midX, y2: botY + 6,
      stroke: 'var(--reg-p7)', 'stroke-width': 2.5, 'stroke-dasharray': '3 3'
    }, svg);
    DNA.el('text', {
      x: midX, y: topY - 14, 'text-anchor': 'middle',
      'font-family': "'IBM Plex Mono', monospace", 'font-size': 12, fill: 'var(--reg-p7)'
    }, svg).textContent = 'fusion junction';
  }

  // Over-amplification: a handful of original molecules, each surrounded
  // by a tight cluster of dim, identical copies -- most of what's there
  // traces back to only a few starting templates.
  function drawBreakItDuplicates(svg) {
    const originX = [110, 320, 530];
    const originY = [55, 85, 58];
    const w = 30, capW = 6;
    const dupOffsets = [[20, 16], [38, 8], [14, 30], [44, 26], [-18, 18], [28, -14], [-10, 30]];
    originX.forEach((ox, i) => {
      const oy = originY[i];
      dupOffsets.forEach(([dx, dy]) => {
        const g = pcrMoleculeWithCaps(svg, ox + dx, oy + dy, w * 0.55, capW * 0.55);
        g.setAttribute('opacity', '0.3');
      });
      pcrMoleculeWithCaps(svg, ox, oy, w, capW);
    });
  }

  // Unique reads fall off with every extra cycle once a library is mostly
  // re-copying the same molecules rather than amplifying new ones.
  function drawDuplicateRateChart(svg) {
    DNA.el('line', { x1: TRACE_PAD, y1: TRACE_H - TRACE_PAD, x2: TRACE_W - TRACE_PAD, y2: TRACE_H - TRACE_PAD, stroke: 'var(--line-strong)', 'stroke-width': 1 }, svg);
    [0, 2, 4, 6, 8].forEach(c => {
      const cx = TRACE_PAD + (c / 8) * (TRACE_W - TRACE_PAD * 2);
      DNA.el('text', { x: cx, y: TRACE_H + 18, 'text-anchor': 'middle', 'font-family': "'IBM Plex Mono', monospace", 'font-size': 16, fill: 'var(--ink-soft)' }, svg).textContent = c;
    });
    DNA.el('text', { x: TRACE_W / 2, y: TRACE_H + 42, 'text-anchor': 'middle', 'font-family': "'IBM Plex Mono', monospace", 'font-size': 15, fill: 'var(--ink-soft)' }, svg).textContent = 'PCR cycle';

    const topY = TRACE_PAD, botY = TRACE_H - TRACE_PAD, range = botY - topY;
    const x = c => TRACE_PAD + (c / 8) * (TRACE_W - TRACE_PAD * 2);
    const y = v => botY - v * range;

    DNA.el('text', { x: TRACE_W - TRACE_PAD, y: topY - 6, 'text-anchor': 'end', 'font-family': "'IBM Plex Mono', monospace", 'font-size': 11, fill: 'var(--ink-faint)' }, svg).textContent = '% unique reads';

    const n = 80;
    let d = '';
    for (let i = 0; i <= n; i++) {
      const c = (i / n) * 8;
      const v = 1 / (1 + Math.exp((c - 4.3) * 1.3));
      d += (i === 0 ? 'M' : ' L') + ` ${x(c)} ${y(v)}`;
    }
    DNA.el('path', { d, fill: 'none', stroke: 'var(--reg-p7)', 'stroke-width': 2.4 }, svg);
  }

  function buildBreakIt(mount, data) {
    mount.innerHTML = `
      <button type="button" class="breakit-toggle" aria-expanded="false">
        <span class="breakit-chevron">›</span><h3>${data.title}</h3>
      </button>
      <div class="breakit-body" hidden>
        <div class="breakit-tabs" role="tablist"></div>
        <p class="breakit-text"></p>
        <div class="breakit-visual">
          <div class="stage-card breakit-stage-card">
            <svg class="breakit-stage" viewBox="0 0 ${BREAKIT_W} ${BREAKIT_H}" role="img" aria-label="Diagram of the selected failure"></svg>
          </div>
          <div class="data-panel">
            <p class="data-panel-title mono breakit-chart-title"></p>
            <svg class="breakit-chart" viewBox="0 0 ${TRACE_W} ${TRACE_VIEW_H}" role="img" aria-label="Fingerprint of the selected failure"></svg>
            <p class="breakit-mitigation"></p>
          </div>
        </div>
      </div>
    `;
    const toggleBtn = mount.querySelector('.breakit-toggle');
    const body = mount.querySelector('.breakit-body');
    const tabs = mount.querySelector('.breakit-tabs');
    const textEl = mount.querySelector('.breakit-text');
    const stageSvg = mount.querySelector('.breakit-stage');
    const chartSvg = mount.querySelector('.breakit-chart');
    const chartTitle = mount.querySelector('.breakit-chart-title');
    const mitigationEl = mount.querySelector('.breakit-mitigation');

    const buttons = {};
    data.failures.forEach(f => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'breakit-tab';
      btn.textContent = f.label;
      btn.setAttribute('role', 'tab');
      btn.addEventListener('click', () => show(f.id));
      tabs.appendChild(btn);
      buttons[f.id] = btn;
    });

    function show(id) {
      const f = data.failures.find(x => x.id === id);
      Object.entries(buttons).forEach(([bid, b]) => {
        b.classList.toggle('is-active', bid === id);
        b.setAttribute('aria-selected', String(bid === id));
      });
      textEl.textContent = f.mechanism + ' ' + f.fingerprint;
      mitigationEl.innerHTML = `<strong>Mitigation:</strong> ${f.mitigation}`;
      stageSvg.innerHTML = '';
      chartSvg.innerHTML = '';
      if (f.gc) {
        chartTitle.textContent = 'Coverage vs. GC content';
        drawBreakItGCBias(stageSvg);
        drawGCCoverageChart(chartSvg);
      } else if (f.visual === 'dimer') {
        chartTitle.textContent = 'DNA fragment distribution';
        drawBreakItAdapterDimer(stageSvg);
        buildTrace(chartSvg, f.traces || [f.trace]);
      } else if (f.visual === 'chimera') {
        chartTitle.textContent = 'DNA fragment distribution';
        drawBreakItChimera(stageSvg);
        buildTrace(chartSvg, f.traces || [f.trace]);
      } else if (f.visual === 'duplicates') {
        chartTitle.textContent = 'Unique reads vs. PCR cycle';
        drawBreakItDuplicates(stageSvg);
        drawDuplicateRateChart(chartSvg);
      } else {
        chartTitle.textContent = 'DNA fragment distribution';
        drawBreakItSizeFailure(stageSvg, f.scale);
        buildTrace(chartSvg, [f.trace]);
      }
    }

    let built = false;
    toggleBtn.addEventListener('click', () => {
      const willOpen = body.hidden;
      body.hidden = !willOpen;
      toggleBtn.setAttribute('aria-expanded', String(willOpen));
      toggleBtn.classList.toggle('is-open', willOpen);
      if (willOpen && !built) {
        built = true;
        show(data.failures[0].id);
      }
    });
  }

  // Optional "Fragmentation QC" sub-section -- a gel of under/perfectly/
  // over-sheared samples cross-linked to their size-distribution curves,
  // consolidated into the Fragmentation step rather than its own step.
  function buildFragQC(mount, data) {
    mount.innerHTML = `
      <div class="breakit-head"><h3>${data.title}</h3></div>
      <p class="breakit-text">${data.caption}</p>
      <div class="fragqc-visual">
        <div class="stage-card">
          <svg class="fragqc-stage" viewBox="0 0 ${STAGE_W} ${STAGE_H}" role="img" aria-label="Gel electrophoresis comparing under-, perfectly- and over-sheared samples"></svg>
        </div>
        <div class="data-panel">
          <p class="data-panel-title mono">DNA fragment distribution</p>
          <svg class="fragqc-chart" viewBox="0 0 ${TRACE_W} ${TRACE_VIEW_H}" role="img" aria-label="Size-distribution curves for under-, perfectly- and over-sheared samples"></svg>
          <div class="fragqc-legend"></div>
        </div>
      </div>
    `;
    const stageSvg = mount.querySelector('.fragqc-stage');
    const chartSvg = mount.querySelector('.fragqc-chart');
    const legendMount = mount.querySelector('.fragqc-legend');

    const hitRects = drawFragQCGel(stageSvg, data.gel);
    const tracePaths = drawFragQCTraces(chartSvg, data.gel);

    const highlight = (id) => {
      Object.entries(tracePaths).forEach(([pid, p]) => {
        p.setAttribute('stroke-width', pid === id ? 3.6 : 2.4);
        p.setAttribute('opacity', pid === id ? 1 : 0.3);
      });
    };
    const reset = () => {
      Object.values(tracePaths).forEach(p => { p.setAttribute('stroke-width', 2.4); p.setAttribute('opacity', 1); });
    };

    data.gel.samples.forEach(s => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'fragqc-legend-row';
      row.innerHTML = `<span class="pool-swatch" style="background:${s.color}"></span><span class="mono">${joinLabel(s.label)}</span>`;
      row.addEventListener('pointerenter', () => highlight(s.id));
      row.addEventListener('focus', () => highlight(s.id));
      row.addEventListener('pointerleave', reset);
      row.addEventListener('blur', reset);
      legendMount.appendChild(row);
      const hit = hitRects[s.id];
      if (hit) {
        hit.addEventListener('pointerenter', () => highlight(s.id));
        hit.addEventListener('focus', () => highlight(s.id));
        hit.addEventListener('pointerleave', reset);
        hit.addEventListener('blur', reset);
      }
    });
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
          ${step.fragMethods ? '<div class="stage-methods"></div>' : ''}
          ${step.pcrCycles ? `<button type="button" class="pcr-play-btn" aria-label="Play PCR animation">${PCR_ICON_PLAY}</button>` : ''}
        </div>
        <div class="data-panel">
          ${step.trace ? `<p class="data-panel-title mono">DNA fragment distribution</p><svg class="step-trace" viewBox="0 0 ${TRACE_W} ${TRACE_VIEW_H}" role="img" aria-label="Fragment size distribution at: ${step.title}"></svg>` : ''}
          <div class="step-widgets"></div>
        </div>
      </div>
      ${step.breakIt ? '<div class="breakit-block"></div>' : ''}
      ${step.fragQC ? '<div class="breakit-block fragqc-block"></div>' : ''}
      ${step.libraryQC ? '<div class="breakit-block libqc-block"></div>' : ''}
      ${step.finalAnatomy ? '<div class="breakit-block final-anatomy-block"></div>' : ''}
    `;
    container.appendChild(section);

    const stageSvg = section.querySelector(`#${stageSvgId}`);
    const traceSvg = section.querySelector('.step-trace');
    const widgets = section.querySelector('.step-widgets');
    const stageMethods = section.querySelector('.stage-methods');

    // --- stage ---
    if (step.id === 'step0') {
      drawGenomicBulk(stageSvg);
    } else if (step.id === 'step1') {
      drawGel(stageSvg, step.gel);
    } else if (step.id === 'step2') {
      drawSmear(stageSvg, 'ragged');
    } else if (step.id === 'step3') {
      drawSmear(stageSvg, 'blunt');
    } else if (step.id === 'step5') {
      drawAdapterLigation(stageSvg);
    } else if (step.id === 'step7') {
      const pcr = buildPCRAnimation(stageSvg, step.pcrCycles);
      section._pcrTimeline = pcr.timeline;
      const playBtn = section.querySelector('.pcr-play-btn');
      let pcrStarted = false;
      playBtn.addEventListener('click', () => {
        if (!pcrStarted) {
          pcrStarted = true;
          playBtn.innerHTML = PCR_ICON_REPLAY;
          playBtn.setAttribute('aria-label', 'Replay PCR animation');
          pcr.timeline.play();
        } else {
          pcr.timeline.restart();
        }
      });
    } else if (step.id === 'step9') {
      section._poolColors = drawPooled(stageSvg);
    }

    // --- trace ---
    if (traceSvg && step.trace) buildTrace(traceSvg, step.trace.peaks);
    if (traceSvg && step.traceAnnotation) {
      drawTraceAnnotation(traceSvg, step.trace.peaks[step.traceAnnotation.peakIndex], step.traceAnnotation.label);
    }

    // --- widgets ---
    if (step.qc) {
      widgets.innerHTML = Object.entries(step.qc).map(([k, v]) =>
        `<div class="qc-row"><span class="qc-key mono">${k.replace(/_/g, '/').toUpperCase()}</span><span class="qc-val mono">${v}</span></div>`
      ).join('');
    }
    if (step.quantMethods) {
      buildMethodAccordion(widgets, step.quantMethods, step.id);
    }
    if (step.fragMethods) {
      buildMethodAccordion(stageMethods, step.fragMethods, step.id);
    }
    if (step.pcrCycles) {
      widgets.innerHTML = `<div class="pcr-widget">Each PCR cycle roughly doubles the number of molecules — and any bias with them.</div>`;
    } else if (step.pool) {
      widgets.innerHTML = step.pool.samples.map((s, i) =>
        `<div class="pool-row"><span class="pool-swatch" style="background:${section._poolColors[i]}"></span><span class="mono">${s} — ${Math.round(step.pool.shares[i] * 100)}%</span></div>`
      ).join('');
    }

    if (step.breakIt) {
      buildBreakIt(section.querySelector('.breakit-block'), step.breakIt);
    }
    if (step.fragQC) {
      buildFragQC(section.querySelector('.fragqc-block'), step.fragQC);
    }
    if (step.libraryQC) {
      buildLibraryQC(section.querySelector('.libqc-block'), step.libraryQC);
    }
    if (step.finalAnatomy) {
      buildFinalAnatomySection(section.querySelector('.final-anatomy-block'), step.finalAnatomy);
    }

    // --- reveal on scroll ---
    if (!reducedMotion) {
      gsap.set(section, { opacity: 0, y: 18 });
      section._onReveal = () => {
        gsap.to(section, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' });
      };
      pending.push(section);
    }
  });
  checkReveal();
})();
