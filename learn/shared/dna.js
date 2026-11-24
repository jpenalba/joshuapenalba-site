/*
  Shared schematic drawing helpers for Learn modules (spec §5, dna.js).

  These draw simple, diagrammatic (not literally double-helical) representations
  of DNA molecules as coloured horizontal bars, matching the way library
  structure is conventionally drawn in sequencing documentation: a row of
  labelled blocks for a finished library, a wavy bar for long genomic DNA,
  and small marker glyphs for the features that get added or removed at each
  prep step (ragged/blunt ends, 5' phosphate, 3' A-tail, Y-shaped adapters).

  Every function draws into an existing <svg> (or <g>) element and returns the
  <g> it created, so a module can grab that reference and animate it with GSAP.
*/
const DNA = (() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs = {}, parent) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  function group(parent, attrs = {}) {
    return el('g', attrs, parent);
  }

  // A long, gently wavy double strand representing high-molecular-weight genomic DNA.
  function genomicStrand(parent, { x, y, width, amplitude = 9, wavelength = 130, phase = 0, color = 'var(--mol-backbone)', strokeWidth = 3 } = {}) {
    const g = group(parent, { class: 'dna-genomic-strand' });
    [-1, 1].forEach((dir) => {
      const samples = Math.max(24, Math.round(width / 6));
      const pts = [];
      for (let i = 0; i <= samples; i++) {
        const px = x + (width * i) / samples;
        const py = y + dir * 4 + Math.sin((i / samples) * (width / wavelength) * Math.PI * 2 + phase) * amplitude;
        pts.push([px, py]);
      }
      let d = `M ${pts[0][0]} ${pts[0][1]}`;
      for (let i = 1; i < pts.length; i++) {
        const [px0, py0] = pts[i - 1];
        const [px1, py1] = pts[i];
        const mx = (px0 + px1) / 2, my = (py0 + py1) / 2;
        d += ` Q ${px0} ${py0}, ${mx} ${my}`;
      }
      d += ` T ${pts[pts.length - 1][0]} ${pts[pts.length - 1][1]}`;
      el('path', { d, stroke: color, 'stroke-width': strokeWidth, fill: 'none', 'stroke-linecap': 'round', opacity: 0.85 }, g);
    });
    return g;
  }

  // A short, straight fragment bar (double-stranded backbone, undifferentiated colour).
  function fragmentBar(parent, { x, y, width, height = 10, color = 'var(--mol-backbone)', rx = 2 } = {}) {
    const g = group(parent, { class: 'dna-fragment' });
    el('rect', { x, y: y - height / 2, width, height, rx, fill: color }, g);
    return g;
  }

  // A row of coloured, labelled region blocks -- the core "library molecule" glyph.
  // regions: [{ key, label, width, color }], left to right.
  function regionRow(parent, { x, y, height = 18, regions, rx = 3 } = {}) {
    const g = group(parent, { class: 'dna-region-row' });
    let cx = x;
    regions.forEach((r) => {
      el('rect', { x: cx, y: y - height / 2, width: r.width, height, rx, fill: r.color, class: `dna-region dna-region-${r.key}` }, g);
      if (r.label) {
        el('text', {
          x: cx + r.width / 2, y: y + 4, 'text-anchor': 'middle',
          'font-family': "'IBM Plex Mono', monospace", 'font-size': 9, fill: '#fff', 'font-weight': 600
        }, g).textContent = r.label;
      }
      cx += r.width;
    });
    return g;
  }

  // Jagged / ragged end-cap (pre end-repair), drawn as a small zig-zag past x.
  function raggedCap(parent, { x, y, side = 'right', size = 9, color = 'var(--mol-backbone)' } = {}) {
    const dir = side === 'right' ? 1 : -1;
    const pts = [
      [x, y - size], [x + dir * size * 0.6, y - size * 0.3],
      [x + dir * size * 0.2, y + size * 0.1], [x + dir * size * 0.9, y + size * 0.6], [x, y + size]
    ];
    return el('polyline', {
      points: pts.map(p => p.join(',')).join(' '),
      fill: 'none', stroke: color, 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      class: 'dna-ragged-cap'
    }, parent);
  }

  // A freshly-sheared fragment: two strands drawn as separate bars, stacked
  // with a small gap, each extending past the double-stranded core by its
  // own amount at each end -- a 5'/3' overhang, rather than a single blunt
  // bar. overhangs = { topLeft, topRight, bottomLeft, bottomRight } in px.
  function fragmentOverhang(parent, { x, y, width, height = 7, gap = 5, color = 'var(--mol-backbone)', overhangs = {}, rx = 2.5 } = {}) {
    const g = group(parent, { class: 'dna-fragment-overhang' });
    const { topLeft = 0, topRight = 0, bottomLeft = 0, bottomRight = 0 } = overhangs;
    const strandH = height;
    const topY = y - gap / 2 - strandH;
    const botY = y + gap / 2;
    el('rect', { x: x - topLeft, y: topY, width: width + topLeft + topRight, height: strandH, rx, fill: color }, g);
    el('rect', { x: x - bottomLeft, y: botY, width: width + bottomLeft + bottomRight, height: strandH, rx, fill: color }, g);
    return g;
  }

  // 5' phosphate marker.
  function phosphateDot(parent, { x, y, r = 4 } = {}) {
    const g = group(parent, { class: 'dna-phosphate' });
    el('circle', { cx: x, cy: y, r, fill: '#fff', stroke: 'var(--mol-backbone)', 'stroke-width': 1.3 }, g);
    el('text', { x, y: y + 3, 'text-anchor': 'middle', 'font-family': "'IBM Plex Mono', monospace", 'font-size': 7, fill: 'var(--mol-backbone)' }, g).textContent = 'P';
    return g;
  }

  // 3' A-tail marker.
  function aTailDot(parent, { x, y, r = 5 } = {}) {
    const g = group(parent, { class: 'dna-atail' });
    el('circle', { cx: x, cy: y, r, fill: 'var(--mol-highlight)', stroke: 'var(--mol-backbone)', 'stroke-width': 1 }, g);
    el('text', { x, y: y + 3.5, 'text-anchor': 'middle', 'font-family': "'IBM Plex Mono', monospace", 'font-size': 8, 'font-weight': 700, fill: 'var(--mol-backbone)' }, g).textContent = 'A';
    return g;
  }

  // Open Y-shaped adapter (before PCR fills it in). side: 'left' | 'right'.
  function yAdapterOpen(parent, { x, y, armLength = 26, spread = 13, side = 'left', colorOuter, colorInner } = {}) {
    const dir = side === 'left' ? -1 : 1;
    const g = group(parent, { class: `dna-yadapter dna-yadapter-${side}` });
    el('path', {
      d: `M ${x} ${y} L ${x + dir * armLength} ${y - spread}`,
      stroke: colorOuter, 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round'
    }, g);
    el('path', {
      d: `M ${x} ${y} L ${x + dir * armLength} ${y + spread}`,
      stroke: colorInner, 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round'
    }, g);
    return g;
  }

  return {
    el, group, genomicStrand, fragmentBar, regionRow, raggedCap, fragmentOverhang, phosphateDot, aTailDot, yAdapterOpen,
    REGIONS: {
      p5:    { key: 'p5',    label: 'P5', color: 'var(--reg-p5)' },
      i5:    { key: 'i5',    label: 'i5', color: 'var(--reg-i5)' },
      read1: { key: 'read1', label: 'R1', color: 'var(--reg-read1)' },
      insert:{ key: 'insert',label: '',   color: 'var(--reg-insert)' },
      read2: { key: 'read2', label: 'R2', color: 'var(--reg-read2)' },
      i7:    { key: 'i7',    label: 'i7', color: 'var(--reg-i7)' },
      p7:    { key: 'p7',    label: 'P7', color: 'var(--reg-p7)' }
    }
  };
})();
