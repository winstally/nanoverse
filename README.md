# nanoverse

A browser-only research toolkit for routine lab work. It requires no backend;
project data is stored locally in the browser with IndexedDB.

## Tools

### Mask Design for Maskless Lithography

- Draw and edit mask shapes directly in micrometer units.
- Export DMD-resolution **1-bit BMP** masks and GDS files.
- Keep the instrument calibration model for `20x, 1 cm = 14 µm`.
- Supports rectangles, ellipses, lines, text, stripe arrays, and grids.
- Replaces a PowerPoint-based mask layout workflow with editable saved projects.

### Spectroscopy Analysis

- Drop measurement text files and plot them immediately.
- Publication-oriented defaults: mirrored axes, inward ticks, and Times New Roman styling.
- Supports PL (`nm` / `eV`), Raman shift (`cm⁻¹`), and XRD (`2θ`).
- Per-trace styling, legend placement, baseline correction, and normalization.
- Gaussian / Lorentzian peak fitting with center, FWHM, area, and PNG/SVG/CSV export.

## Tech Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui (Base UI) · IndexedDB

## Development

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm build && pnpm start
```

Each user runs the app locally and works from their browser.

## License

MIT
