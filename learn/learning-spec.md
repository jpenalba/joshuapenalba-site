# Learning Modules Spec: Sequencing & Bioinformatics Animations

> Planning document for Claude Code. Read this before working on anything under `learn/`.
> Status: **v0.1 draft. Module 1 (Illumina library prep) only.** Further modules will be added to this file later.

---

## 1. Purpose

Add a "Learn" section to my personal academic website: interactive, animated explainers of how high-throughput sequencing works, and later how the bioinformatic steps work.

**Audience:** advanced undergraduates, MSc/PhD students and early-career researchers in ecology, evolution and genomics. Assume basic molecular biology (DNA structure, PCR, ligation). Assume no hands-on sequencing experience.

**What makes it different from existing resources:** vendor and outreach videos are play-only and gloss over failure modes. Hands-on training (Galaxy Training Network, sandbox.bio) teaches how to run tools, not the physical process behind the data. These modules sit in between. Each one:
1. Lets the learner step through the process at their own pace.
2. Connects each lab step to what it produces in the data.
3. Shows what goes wrong and the trace each failure leaves in QC plots.

---

## 2. Site context and constraints

- The site is **static HTML** hosted on **GitHub Pages**. No server, no backend, no build step unless clearly justified (ask me first).
- Match the existing site's look (fonts, header/nav, colours) so the Learn pages feel native. Inspect the existing pages before writing new CSS.
- Every module must work offline once loaded, and degrade sensibly on mobile (≥ 360 px wide).
- Don't restructure or restyle existing pages without asking.

---

## 3. Design principles (apply to every module)

1. **Step-through, not video.** Controls: ◀ previous · ▶ play/pause · ▶| next · a scrubber/progress bar with step markers. Keyboard: ←/→ for steps, space for play/pause.
2. **One caption per step.** 1–3 sentences, plain language, shown beside or below the stage. Technical terms are clickable to open a short glossary popover.
3. **Anchor object.** Each module has one central visual that builds up over the steps. In Module 1 this is the library molecule.
4. **Data panel.** A side panel showing the data-side consequence of the current state, e.g. a TapeStation-style size trace or a FastQC-style plot.
5. **Branch toggles.** Where protocols differ, a toggle swaps the animation for that step only.
6. **"Break it" mode.** The learner picks a failure. The animation shows where it arises and the data panel shows its fingerprint.
7. **Consistency.** Shared colours, shapes and controls across all modules (see §5).

---

## 4. Tech approach

- **Rendering:** inline **SVG**, animated with **GSAP** (timeline per step, loaded from CDN with a pinned version, or vendored into `learn/vendor/`). Use **D3** only for data-driven plots in the data panel.
- **Structure:** each step is a GSAP timeline label. The player controls move between labels, so pausing, stepping and scrubbing all come from one mechanism.
- **Content kept separate from code:** steps, captions, branch definitions and failure definitions live in a per-module JSON or JS data file, so I can edit the science without touching animation code.
- **Accessibility:**
  - Respect `prefers-reduced-motion` (jump between end-states instead of tweening).
  - Base colours must be colour-blind safe **and** labelled with letters.
  - All controls keyboard-accessible with ARIA labels. Captions are real text, not baked into SVG.
- **Embed mode:** `?embed=1` hides the site header and footer so instructors can iframe a module.
- **Licence:** CC BY 4.0 for content. Show it in each module's footer.

---

## 5. Shared component kit (`learn/shared/`)

Build these once and reuse them in every module:

| Component | Notes |
|---|---|
| `player.js` | Step controls, scrubber, keyboard handling, caption display, reduced-motion handling |
| `dna.js` | Draws a double- or single-stranded DNA segment of given length; supports coloured regions, nicks, overhangs (A/T), blunt ends, damaged bases |
| `palette.css` | Base colours (A/C/G/T) plus region colours: P5, i5, Read 1 primer site, insert, Read 2 primer site, i7, P7 |
| `glossary.js` + `glossary.json` | Term popovers shared by all modules |
| `datapanel.js` | Small plot types: size-distribution trace, duplication histogram, adapter-content line, GC-content curve, per-base content |
| `toggle.js` | Branch toggle and "break it" selector UI |

Region colours must stay identical across every module, because the library molecule reappears in later ones (cluster generation, sequencing by synthesis, demultiplexing).

---

## 6. Proposed file structure

```
learn/
  index.html                  # landing page listing modules
  shared/                     # component kit (§5)
  vendor/                     # pinned GSAP/D3 if not using CDN
  illumina-library-prep/
    index.html
    module.js                 # animation timelines
    content.json              # steps, captions, branches, failures
```

---

## 7. Module 1: Illumina library prep

### 7.1 Learning objectives
After the module, a learner can:
- Draw and label a finished Illumina library molecule.
- Explain what each prep step does and why it is needed.
- Name the main ways protocols differ and what each choice changes.
- Recognise common library-prep failures from their QC signatures.

### 7.2 Anchor object
The final library molecule, built up step by step:

```
P5 — i5 — Read 1 primer site — [ INSERT ] — Read 2 primer site — i7 — P7
```

Once it is complete, show a labelled "anatomy" view where hovering or tapping a region explains its role. Note that **library size ≈ insert size + adapter length (~120 bp for typical full-length adapters)**, and show both on the size trace.

### 7.3 Core steps (storyboard)

| # | Step | On stage | Caption idea | Data panel |
|---|---|---|---|---|
| 0 | Starting material | Long genomic DNA strands (a few shown at higher zoom) | We start with high-molecular-weight genomic DNA from the sample. | Size trace: one high-MW peak |
| 1 | Input QC | DNA in a tube with three gauges: quantity, integrity, purity | Before anything else: how much DNA, how intact, how clean? | Example readouts: concentration, integrity, 260/280, 260/230 |
| 2 | Fragmentation | DNA breaks into a distribution of shorter pieces | DNA is sheared into fragments near the target insert size. | Peak moves left and broadens |
| 3 | End repair | Ragged ends (5′/3′ overhangs) become blunt; 5′ phosphates added | Shearing leaves messy ends; enzymes trim or fill them to blunt, phosphorylated ends. | No change |
| 4 | A-tailing | A single A added to each 3′ end | A single A on each 3′ end lets adapters with a T overhang ligate, and stops fragments ligating to each other. | No change |
| 5 | Adapter ligation | Y-shaped adapters (coloured regions) join both ends | Adapters carry everything the sequencer needs: flow-cell binding sites, primer sites and indexes. | Peak shifts right by the adapter length; small adapter-dimer peak appears |
| 6 | Bead clean-up / size selection | SPRI beads capture fragments; ratio slider shows which sizes are kept | Magnetic beads remove leftover adapters and fragments that are too short or too long. The bead ratio sets the cut-off. | Interactive: the bead-ratio slider changes the trace |
| 7 | Library PCR | Cycles copy molecules; counter shows cycle number | PCR completes or enriches full-length molecules and raises the yield. Each cycle adds bias. | Yield rises; duplication histogram starts to build |
| 8 | Library QC | Size trace plus qPCR curve | Check the size distribution and measure molarity by qPCR, which counts only molecules that can actually be sequenced. | Final trace with insert vs library size marked |
| 9 | Pool, normalise, load | Libraries with different indexes mixed at equal molarity | Libraries are pooled in equal amounts, denatured and loaded onto the flow cell. | Pie/bar of the reads expected per sample |

Step 9 should end with a "Next: cluster generation →" link (future module).

### 7.4 Branch toggles (v1)

| Branch | Options | Steps affected |
|---|---|---|
| Fragmentation & adapters | **Mechanical/enzymatic shearing + ligation** (default) vs **tagmentation** (transposase cuts and inserts adapter sequences in one step; PCR adds the rest) | Tagmentation collapses steps 2–5 into one animation |
| Amplification | **PCR** (default) vs **PCR-free** | Step 7 skipped; data panel shows lower duplication; note the higher input needed |
| Indexing | **Single index** vs **combinatorial dual** vs **unique dual indexes (UDI)** (default); optional **UMI** overlay | Steps 5/7 and 9; ties into the index-hopping failure |

**Deferred to a later "Library types" module:** RADseq (restriction digest), target capture, RNA-seq (cDNA), Hi-C, and museum/ancient DNA (no shearing, damage repair, single-stranded prep).

### 7.5 "Break it" failures

Each failure needs:
- **where** it arises (highlight the step)
- **what happens** to the molecules (an altered animation)
- **its fingerprint** (data panel)
- **a fix or mitigation** (one sentence)

| Failure | Arises at | Mechanism | Fingerprint | Mitigation |
|---|---|---|---|---|
| Low library complexity | 0–1, 7 | Little or degraded input; many copies of few molecules | High duplication rate | More input, fewer PCR cycles, UMIs |
| Adapter dimers | 5–6 | Excess adapter ligates to itself; poor clean-up | Peak around 120–130 bp; reads made entirely of adapter | Adapter titration, stricter bead clean-up |
| Inserts shorter than read length | 2 (or degraded input) | Reads run past the insert into the adapter | Adapter-content curve rising along the read | Adapter trimming; adjust fragmentation |
| GC bias | 2 (tagmentation), 7 | Sequence preference of the enzyme and uneven PCR efficiency | GC curve distorted; coverage drops in GC-rich and AT-rich regions | Fewer cycles, PCR-free, bias-tolerant polymerases |
| PCR artefacts | 7 | Over-amplification: chimeras, heteroduplex "bubble" products, jackpotting | Size-trace shoulder or second high-MW peak; duplicates | Fewer cycles, monitor with qPCR |
| Index hopping / misassignment | 5, 9 | Free adapters or index primers swap indexes; reused index combinations | Reads assigned to the wrong sample | UDIs, thorough clean-up |
| Mis-quantification | 8 | Fluorometric quantification counts molecules that can't be sequenced | Over- or under-clustered flow cell | qPCR-based quantification |
| Low base diversity | 9 | Amplicon-like libraries all read the same base each cycle | Poor run quality metrics | Spike in PhiX, stagger or mix libraries |
| Cross-sample contamination | 0–9 | Handling or reagent contamination | Reads from unexpected samples or taxa | Blanks/negative controls, careful handling |

Ancient/museum DNA damage (C→T excess at read ends) is mentioned as a teaser and covered fully in the Library types module.

### 7.6 Science accuracy notes
- Keep protocols generic (no kit or brand names in the main flow). Where a step differs by kit, say so in a caption footnote.
- Numbers (adapter-dimer size, adapter length) are labelled as "typical". Check every caption with me before finalising.
- Captions and failure text live in `content.json` so I can edit them directly.

---

## 8. Scope for the first draft

**Build first (prototype):**
1. `learn/shared/player.js`, `palette.css`, `dna.js`: the minimum needed.
2. Module 1, steps 0–9 with the default path only and placeholder captions from §7.3.
3. A simple data panel with just the size trace.

**Then, once I've reviewed the prototype:**
- Branch toggles (§7.4)
- "Break it" mode (§7.5) and the remaining data-panel plot types
- Glossary popovers, embed mode, `learn/index.html` landing page

**Out of scope for now:** cluster generation, sequencing by synthesis, PacBio, Nanopore and all bioinformatics modules. Each will get its own section in this spec.

---

## 9. Working agreements for Claude Code

- Start by reading the existing site structure and styles, then propose a short plan before writing code.
- Run a local server (e.g. `python3 -m http.server`) and check the module in a browser at desktop and mobile widths.
- Keep commits small and descriptive. Don't push to the deployed branch without my go-ahead.
- If something in this spec is ambiguous or seems wrong scientifically, ask rather than guess.
- Update this spec when decisions change, and log them in §10.

---

## 10. Decision log

| Date | Decision |
|---|---|
| 2026-11-24 | Spec created. Module 1 = Illumina library prep. Tech: static SVG + GSAP (+ D3 for plots). Library-type variants deferred to a later module. |
| 2026-11-24 | First-draft prototype built per §8: `learn/shared/{player.js,dna.js,palette.css}`, `learn/illumina-library-prep/{index.html,module.js,content.json}`, default path only, steps 0–9, size-trace data panel. Region palette uses the Okabe–Ito colour-blind-safe set (P5/i5/Read1 cool, Read2/i7/P7 warm, insert neutral tan), each region also letter-labelled. GSAP 3.12.5 vendored into `learn/vendor/` rather than loaded from a CDN, so modules have no runtime dependency on CDN availability (satisfies the "must work offline once loaded" constraint) — D3 was not pulled in for this prototype since the only chart needed (the size trace) is a straightforward hand-rolled SVG path; D3 is deferred to when the shared `datapanel.js` gains the other plot types (duplication histogram, adapter-content, GC-content, per-base content). Steps 7 and 9's non-trace data-panel visuals (duplication histogram, reads-per-sample chart) are stood in for with light-weight DOM widgets (a cycle counter, a 3-row legend) rather than new chart types, to avoid pulling in D3 before it's otherwise needed. `learn/index.html` landing page and nav wiring into the three existing site pages are intentionally not done yet, per the scope note in §8 — existing pages were not touched. Not yet built: branch toggles (§7.4), "break it" mode (§7.5), glossary, embed mode. |
