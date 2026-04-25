/**
 * Tanzillo.ai design system — inline CSS for Luca's server-rendered pages.
 *
 * Mirrors the tokens from the tanzillo-ai-design-system bundle:
 *   locked palette (fuchsia / teal / navy / sage),
 *   Fraunces + Bricolage Grotesque + JetBrains Mono,
 *   editorial-craft feel, suspension-style shadows, restrained radii.
 *
 * The legacy --nxb-* custom-property names are preserved (they're referenced
 * from route-level inline styles) but now resolve to palette-aligned values.
 */

/** Google Fonts <link> tags + favicon — drop into every <head>. */
export const fontLinks = `
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23142235'/%3E%3Csvg x='4' y='4' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23D4246F' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2'/%3E%3Cline x1='16' y1='2' x2='16' y2='6'/%3E%3Cline x1='8' y1='2' x2='8' y2='6'/%3E%3Cline x1='3' y1='10' x2='21' y2='10'/%3E%3Cpath d='M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01'/%3E%3C/svg%3E%3C/svg%3E" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,200..800;1,6..72,200..800&family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">`;

/** Inline SVG of the calendar icon (dark bg variant — landing/login). */
export const logoSvgDark = `<div style="width:32px;height:32px;border-radius:8px;background:rgba(212,36,111,0.12);border:1px solid rgba(212,36,111,0.25);display:flex;align-items:center;justify-content:center;">
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4246F" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>
</div>`;

/** Inline SVG of the calendar icon — for dashboard/settings headers (light bg). */
export const logoSvg = `<div style="width:32px;height:32px;border-radius:8px;background:rgba(212,36,111,0.08);border:1px solid rgba(212,36,111,0.15);display:flex;align-items:center;justify-content:center;">
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4246F" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>
</div>`;

/** Shared reset + tokens + base component styles. */
export const baseStyles = `
  /* ── Reset ─────────────────────────────────────── */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  button { cursor: pointer; font-family: inherit; font-size: inherit; border: none; background: none; }
  input, textarea, select { font-family: inherit; font-size: inherit; }

  /* ── Tanzillo palette + typography tokens ────────── */
  :root {
    /* Primary locked palette */
    --color-fuchsia: #D4246F;
    --color-teal:    #0D5C52;
    --color-navy:    #142235;
    --color-sage:    #F0F5F3;

    /* Fuchsia ramp */
    --fuchsia-50:  #FAE8F1;
    --fuchsia-100: #F3B4D2;
    --fuchsia-200: #E880B0;
    --fuchsia-400: #DE528C;
    --fuchsia-600: #D4246F;
    --fuchsia-800: #A01A54;
    --fuchsia-900: #6A1038;

    /* Teal ramp */
    --teal-50:  #D4EFEC;
    --teal-100: #91D5CE;
    --teal-200: #4CB8AF;
    --teal-400: #239085;
    --teal-600: #0D5C52;
    --teal-800: #09403A;
    --teal-900: #052620;

    /* Navy ramp */
    --navy-50:  #D6DEE9;
    --navy-100: #9BAAC1;
    --navy-200: #5E7189;
    --navy-400: #334A66;
    --navy-600: #142235;
    --navy-800: #0C172A;
    --navy-900: #060D1A;

    /* Sage ramp */
    --sage-50:  #FFFFFF;
    --sage-100: #F8FBF9;
    --sage-200: #F0F5F3;
    --sage-400: #E0EDEA;
    --sage-600: #C4D9D5;
    --sage-800: #8CAAA5;
    --sage-900: #527872;

    /* Extended berry-arc family */
    --violet-600: #7E3E9E;
    --violet-100: #DCC8E8;
    --azure-600:  #3B5A8C;
    --azure-100:  #C4CEE0;

    /* Semantic */
    --success-600: #2B8A6E;
    --success-100: #C9E6DB;
    --warning-600: #D0682A;
    --warning-100: #F4D3BA;
    --danger-600:  #A83A4A;
    --danger-100:  #F0CCD4;

    /* Typefaces */
    --font-serif: 'Newsreader', 'Times New Roman', Georgia, serif;
    --font-sans:  'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif;
    --font-mono:  'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;

    /* Motion */
    --ease-settle:   cubic-bezier(0.34, 1.35, 0.64, 1);
    --ease-pendulum: cubic-bezier(0.37, 0, 0.22, 1.15);
    --ease-curtain:  cubic-bezier(0.83, 0, 0.17, 1);
    --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
    --ease-hang:     cubic-bezier(0.25, 0.1, 0.25, 1);
    --dur-1: 120ms; --dur-2: 220ms; --dur-3: 420ms; --dur-4: 700ms; --dur-5: 1100ms;

    /* Elevation — suspension-style */
    --shadow-hang-sm: 0 1px 2px rgba(11,20,30,0.04), 0 2px 6px rgba(11,20,30,0.04);
    --shadow-hang-md: 0 2px 4px rgba(11,20,30,0.04), 0 8px 24px rgba(11,20,30,0.08);
    --shadow-hang-lg: 0 4px 8px rgba(11,20,30,0.06), 0 24px 48px rgba(11,20,30,0.12);
    --shadow-suspend: 0 18px 24px -16px rgba(11,20,30,0.35);

    /* ── Legacy --nxb-* aliases, repointed to the palette ── */
    --nxb-color-bg: var(--sage-200);
    --nxb-color-surface: var(--sage-50);
    --nxb-color-surface-elevated: var(--sage-100);
    --nxb-color-border: rgba(11, 20, 30, 0.08);
    --nxb-color-border-light: rgba(11, 20, 30, 0.16);
    --nxb-color-text: var(--navy-600);
    --nxb-color-text-secondary: var(--navy-400);
    --nxb-color-text-muted: var(--navy-200);
    --nxb-color-primary: var(--teal-600);
    --nxb-color-primary-hover: var(--teal-800);
    --nxb-color-primary-ring: rgba(13, 92, 82, 0.15);
    --nxb-color-primary-ghost: rgba(13, 92, 82, 0.06);
    --nxb-color-accent: var(--fuchsia-600);
    --nxb-color-accent-hover: var(--fuchsia-800);
    --nxb-color-success: var(--success-600);
    --nxb-color-danger:  var(--danger-600);
    --nxb-radius-sm: 4px;
    --nxb-radius-md: 6px;
    --nxb-radius-lg: 10px;
    --nxb-shadow-sm: var(--shadow-hang-sm);
    --nxb-shadow-md: var(--shadow-hang-md);
    --nxb-shadow-lg: var(--shadow-hang-lg);
    --nxb-transition-fast: 220ms var(--ease-out-expo);
  }

  /* ── Base ───────────────────────────────────────── */
  html {
    font-size: 20px;
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
  }
  @media (min-width: 641px) {
    html { font-size: 16px; }
  }
  body {
    font-family: var(--font-sans);
    background: var(--nxb-color-bg);
    color: var(--nxb-color-text);
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    font-feature-settings: "ss01", "ss02", "kern", "liga";
    hanging-punctuation: first last;
  }

  /* ── Typography ────────────────────────────────── */
  h1 {
    font-family: var(--font-serif);
    font-size: 1.75rem;
    font-weight: 600;
    line-height: 1.1;
    letter-spacing: -0.025em;
    font-variation-settings: 'opsz' 48, 'WONK' 1;
    color: var(--nxb-color-text);
    text-wrap: balance;
  }
  h1 em { color: var(--fuchsia-600); font-style: italic; font-weight: 600; }
  h2 {
    font-family: var(--font-serif);
    font-size: 1.15rem;
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: -0.015em;
    font-variation-settings: 'opsz' 24, 'WONK' 1;
    color: var(--nxb-color-text);
    margin: 2rem 0 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--sage-600);
  }
  h3 {
    font-family: var(--font-serif);
    font-size: 1.05rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    font-variation-settings: 'opsz' 24, 'WONK' 0;
    color: var(--nxb-color-text);
  }
  .text-sm { font-size: 0.82rem; }
  .text-muted { color: var(--nxb-color-text-muted); }
  .italic { font-style: italic; font-family: var(--font-serif); }

  code, .mono {
    font-family: var(--font-mono);
    font-size: 0.88em;
    font-feature-settings: "zero", "ss02";
    color: var(--teal-800);
    background: var(--teal-50);
    padding: 0.1em 0.3em;
    border-radius: var(--nxb-radius-sm);
  }

  /* ── Layout ────────────────────────────────────── */
  .container { max-width: 640px; margin: 0 auto; padding: 2rem; }

  /* ── Card ──────────────────────────────────────── */
  .card {
    background: var(--nxb-color-surface);
    border-radius: var(--nxb-radius-md);
    padding: 1rem;
    margin-bottom: 0.75rem;
    border: 1px solid var(--nxb-color-border);
    transition: border-color var(--nxb-transition-fast), box-shadow var(--nxb-transition-fast);
  }
  .card-header { display: flex; flex-direction: column; gap: 0.25rem; }
  .card-header-row { display: flex; justify-content: space-between; align-items: flex-start; }
  .card-actions { display: flex; gap: 0.5rem; align-items: center; flex-shrink: 0; }
  .card-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: var(--nxb-color-surface);
    border-radius: var(--nxb-radius-sm);
    border: 1px solid var(--nxb-color-border);
    margin-bottom: 0.5rem;
    overflow: hidden;
    min-width: 0;
  }
  .card-row > div:first-child { min-width: 0; flex: 1; overflow: hidden; }
  .card-row .text-muted { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* ── Badge ─────────────────────────────────────── */
  .badge {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    border-radius: var(--nxb-radius-sm);
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin-left: 0.5rem;
    background: var(--sage-400);
    color: var(--nxb-color-text-secondary);
  }
  .badge.default   { background: var(--azure-100);  color: var(--azure-600); }
  .badge.online    { background: var(--violet-100); color: var(--violet-600); }
  .badge.in-person { background: var(--warning-100); color: var(--warning-600); }

  /* ── Buttons ───────────────────────────────────── */
  .btn {
    padding: 0.5rem 1rem;
    border-radius: var(--nxb-radius-md);
    font-weight: 600;
    font-size: 0.88rem;
    letter-spacing: -0.005em;
    border: 1px solid transparent;
    transition: background var(--nxb-transition-fast),
                color var(--nxb-transition-fast),
                border-color var(--nxb-transition-fast),
                box-shadow var(--nxb-transition-fast),
                transform var(--nxb-transition-fast);
  }
  .btn:active { transform: translateY(1px); }
  .btn-primary {
    background: var(--fuchsia-600);
    color: #fff;
    box-shadow: 0 12px 22px -14px rgba(212,36,111,0.55), 0 1px 0 rgba(255,255,255,0.15) inset;
  }
  .btn-primary:hover { background: var(--fuchsia-800); transform: translateY(-1px); }
  .btn-secondary {
    background: transparent;
    color: var(--fuchsia-600);
    border: 1.5px solid var(--fuchsia-600);
  }
  .btn-secondary:hover {
    background: rgba(212, 36, 111, 0.06);
    color: var(--fuchsia-800);
    border-color: var(--fuchsia-800);
  }
  .btn-danger {
    background: none;
    color: var(--danger-600);
    border: none;
    cursor: pointer;
    font-size: 0.8rem;
  }
  .btn-danger:hover { text-decoration: underline; }
  .btn-sm { padding: 0.25rem 0.75rem; font-size: 0.8rem; }
  .btn-ghost {
    background: transparent;
    color: var(--nxb-color-text);
    border: 1px solid var(--navy-100);
    font-weight: 500;
  }
  .btn-ghost:hover {
    background: rgba(20, 34, 53, 0.03);
    border-color: var(--navy-200);
  }

  /* ── Forms ─────────────────────────────────────── */
  .form-group { margin-bottom: 0.75rem; }
  .form-group label {
    display: block;
    font-family: var(--font-sans);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    margin-bottom: 0.25rem;
    color: var(--nxb-color-text-secondary);
  }
  .form-group input, .form-group select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--nxb-color-border-light);
    border-radius: var(--nxb-radius-sm);
    font-size: 0.92rem;
    background: var(--sage-100);
    color: var(--nxb-color-text);
    transition: border-color var(--nxb-transition-fast),
                box-shadow var(--nxb-transition-fast),
                background var(--nxb-transition-fast);
  }
  .form-group input[type="checkbox"] {
    width: auto;
    padding: 0;
    border: revert;
    border-radius: revert;
    background: revert;
    accent-color: var(--fuchsia-600);
    vertical-align: middle;
    margin-right: 0.375rem;
  }
  .form-group label:has(input[type="checkbox"]) {
    display: flex;
    align-items: center;
    font-size: 0.88rem;
    font-weight: 500;
    letter-spacing: 0;
    text-transform: none;
    color: var(--nxb-color-text);
    cursor: pointer;
  }
  .checkbox-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }
  .checkbox-group label {
    display: flex;
    align-items: center;
    font-size: 0.88rem;
    font-weight: 500;
    letter-spacing: 0;
    text-transform: none;
    color: var(--nxb-color-text);
    cursor: pointer;
    margin: 0;
  }
  .checkbox-group input[type="checkbox"] {
    width: auto;
    padding: 0;
    border: revert;
    border-radius: revert;
    background: revert;
    accent-color: var(--fuchsia-600);
    margin: 0 0.375rem 0 0;
  }
  .form-group input:focus, .form-group select:focus {
    outline: none;
    border-color: var(--fuchsia-600);
    background: var(--sage-50);
    box-shadow: 0 0 0 3px rgba(212, 36, 111, 0.12);
  }
  .form-row { display: flex; gap: 0.75rem; }
  .form-row > * { flex: 1; }

  /* ── Modal ─────────────────────────────────────── */
  .modal {
    display: none;
    position: fixed; inset: 0;
    background: rgba(11, 20, 30, 0.4);
    backdrop-filter: blur(12px);
    z-index: 1000;
    justify-content: center;
    align-items: center;
    padding: 16px;
  }
  .modal.active { display: flex; }
  .modal-content {
    background: var(--sage-50);
    border: 1px solid var(--nxb-color-border);
    border-radius: var(--nxb-radius-lg);
    box-shadow: var(--shadow-hang-lg);
    width: 100%;
    max-width: 420px;
    max-height: 90vh;
    overflow-y: auto;
  }
  .modal-header {
    padding: 18px 22px;
    border-bottom: 1px solid var(--nxb-color-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .modal-title {
    font-family: var(--font-serif);
    font-size: 1.4rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.2;
    font-variation-settings: 'opsz' 48, 'WONK' 1;
    color: var(--nxb-color-text);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .modal-close {
    width: 44px; height: 44px;
    border-radius: var(--nxb-radius-sm);
    font-size: 1.1rem;
    color: var(--nxb-color-text-secondary);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    transition: background var(--nxb-transition-fast), color var(--nxb-transition-fast);
  }
  .modal-close:hover { background: var(--sage-400); color: var(--nxb-color-text); }
  .modal-body { padding: 22px; }
  .modal-footer {
    padding: 14px 22px;
    border-top: 1px solid var(--nxb-color-border);
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
  @media (max-width: 768px) {
    .modal-content {
      max-width: none;
      margin: 0;
      border-radius: var(--nxb-radius-lg) var(--nxb-radius-lg) 0 0;
      max-height: 85vh;
      position: fixed;
      bottom: 0; left: 0; right: 0;
    }
    .modal { align-items: flex-end; padding: 0; }
  }

  /* ── Toggle ────────────────────────────────────── */
  .toggle { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }
  .toggle input { width: 1rem; height: 1rem; accent-color: var(--fuchsia-600); }
  .toggle-label { font-size: 0.8rem; color: var(--nxb-color-text-secondary); }

  /* ── Toast ─────────────────────────────────────── */
  #toast {
    display: none;
    position: fixed;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    background: var(--navy-600);
    color: var(--sage-200);
    padding: 0.75rem 1.5rem;
    border-radius: var(--nxb-radius-md);
    font-size: 0.88rem;
    font-weight: 500;
    z-index: 100;
    box-shadow: var(--shadow-suspend);
  }
  #toast.show { display: block; }

  /* ── Misc ──────────────────────────────────────── */
  .powered-by {
    text-align: center;
    margin-top: 3rem;
    color: var(--nxb-color-text-muted);
    font-size: 0.75rem;
    letter-spacing: 0.04em;
  }
  .section-title {
    font-family: var(--font-sans);
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--nxb-color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.2em;
    margin: 0.75rem 0 0.5rem;
  }
  .user-info { color: var(--nxb-color-text-secondary); margin-bottom: 2rem; font-size: 0.88rem; }
  a {
    color: var(--fuchsia-600);
    text-decoration: none;
    text-underline-offset: 3px;
    transition: color var(--nxb-transition-fast);
  }
  a:hover { color: var(--fuchsia-800); text-decoration: underline; text-decoration-thickness: 1px; }

  ::selection { background: var(--fuchsia-100); color: var(--fuchsia-900); }

  /* ── Mobile: base ────────────────────────────────── */
  @media (max-width: 768px) {
    .form-group input, .form-group select, .form-group textarea { font-size: 16px; }
    .btn { min-height: 44px; }
    .btn-sm { min-height: 44px; }
    .btn-ghost { min-height: 44px; }
    .form-group input, .form-group select { min-height: 44px; }
  }
  @media (max-width: 640px) {
    .container { padding: 1rem; }
    .modal-header { padding: 14px 16px; }
    .modal-body { padding: 16px; }
    .modal-footer { padding: 12px 16px; }
    .modal-title { font-size: 1.2rem; }
    #toast {
      left: 16px;
      right: 16px;
      transform: none;
      text-align: center;
      max-width: 100%;
    }
    .card-header-row { flex-wrap: wrap; gap: 0.5rem; }
    .card-actions { flex-wrap: wrap; }
    .card-row { flex-wrap: wrap; gap: 0.5rem; }
    .toggle { min-height: 44px; }
    .badge { margin-left: 0.25rem; }
  }`;

/** Shared app header/nav styles — editorial chrome with Fraunces wordmark. */
export const headerStyles = `
  .app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 24px;
    background: var(--sage-100);
    border-bottom: 1px solid var(--nxb-color-border);
    position: relative;
  }
  .app-header::after {
    /* a subtle pinstripe — the design system's "stage scrim" motif at low opacity */
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(11,20,30,0.02) 39px, rgba(11,20,30,0.02) 40px);
  }
  .app-header > * { position: relative; z-index: 1; }
  .app-header-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
    color: var(--nxb-color-text);
    transition: color var(--nxb-transition-fast);
  }
  .app-header-brand:hover { text-decoration: none; color: var(--fuchsia-800); }
  .app-name {
    font-family: var(--font-serif);
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    font-variation-settings: 'opsz' 24, 'WONK' 1;
    color: inherit;
  }
  .app-header-nav {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .header-btn {
    width: 34px;
    height: 34px;
    border-radius: var(--nxb-radius-sm);
    border: 1px solid var(--nxb-color-border);
    background: var(--sage-50);
    color: var(--nxb-color-text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background var(--nxb-transition-fast),
                color var(--nxb-transition-fast),
                border-color var(--nxb-transition-fast);
    -webkit-tap-highlight-color: transparent;
  }
  .header-btn:hover,
  .header-btn:active {
    background: var(--sage-50);
    color: var(--fuchsia-600);
    border-color: rgba(212, 36, 111, 0.25);
  }
  @media (max-width: 768px) {
    .app-header { padding: 14px 16px; }
    .header-btn { width: 44px; height: 44px; }
    .app-header-nav { gap: 8px; }
  }
`;

/** Settings-specific styles (availability, calendars, locations, week grid). */
export const settingsStyles = `
  .day-label { font-weight: 500; min-width: 100px; flex-shrink: 0; }
  .avail-row { flex-wrap: wrap; gap: 0.5rem; }
  .avail-slots { flex: 1; display: flex; flex-wrap: wrap; gap: 0.25rem; align-items: center; }
  .avail-slot {
    display: inline-flex; align-items: center; gap: 0.25rem;
    background: var(--success-100); border: 1px solid rgba(43,138,110,0.3); color: var(--success-600);
    padding: 0.125rem 0.5rem; border-radius: 999px;
    font-size: 0.78rem; font-weight: 500;
  }
  .btn-inline-delete {
    background: none; border: none; color: var(--nxb-color-text-muted);
    cursor: pointer; font-size: 1rem; line-height: 1; padding: 0 0.125rem;
    min-width: 44px; min-height: 44px;
    display: inline-flex; align-items: center; justify-content: center;
    transition: color var(--nxb-transition-fast);
  }
  .btn-inline-delete:hover { color: var(--danger-600); }
  .locations-section { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--nxb-color-border); }
  .location-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 0.5rem; margin-bottom: 0.25rem;
    border-radius: var(--nxb-radius-sm);
    transition: background var(--nxb-transition-fast);
  }
  .location-row:hover { background: var(--sage-200); }
  .pac-container {
    z-index: 10000 !important;
    border-radius: var(--nxb-radius-sm);
    border: 1px solid var(--nxb-color-border);
    box-shadow: var(--shadow-hang-md);
    font-family: var(--font-sans);
    background: var(--sage-50);
  }
  .pac-item { padding: 0.5rem 0.75rem; font-size: 0.88rem; cursor: pointer; }
  .pac-item:hover { background: var(--sage-200); }
  .pac-item-selected { background: var(--fuchsia-50); }
  .pac-icon { display: none; }
  .pac-item-query { font-weight: 600; font-size: 0.88rem; }
  .autocomplete-hint { font-size: 0.72rem; color: var(--nxb-color-text-muted); margin-top: 0.25rem; }

  @media (max-width: 640px) {
    .day-label { min-width: 70px; font-size: 0.85rem; }
    .avail-row { gap: 0.375rem; }
    .avail-slot { font-size: 0.72rem; padding: 0.125rem 0.375rem; }
    .location-row { flex-wrap: wrap; gap: 0.5rem; }
    .location-row > div { min-width: 0; overflow: hidden; }
    .location-row > div .text-muted { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  }

  /* Weekly calendar */
  .week-calendar { margin-bottom: 1.25rem; }
  .week-nav {
    display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;
  }
  .week-nav-label { font-weight: 600; font-size: 0.9rem; min-width: 160px; text-align: center; }
  .week-today-btn { margin-left: auto; }
  .week-grid {
    display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.375rem;
    min-height: 120px;
  }
  .week-loading {
    grid-column: 1 / -1; text-align: center; padding: 2rem;
    color: var(--nxb-color-text-muted); font-size: 0.85rem;
  }
  .week-day-col {
    background: var(--nxb-color-surface); border: 1px solid var(--nxb-color-border);
    border-radius: var(--nxb-radius-sm); overflow: hidden; min-height: 100px;
  }
  .week-day-header {
    display: flex; justify-content: space-between; align-items: baseline;
    padding: 0.375rem 0.5rem; background: var(--sage-200);
    border-bottom: 1px solid var(--nxb-color-border);
    font-size: 0.72rem;
  }
  .week-day-name { font-weight: 600; }
  .week-day-date { color: var(--nxb-color-text-muted); }
  .week-day-events { padding: 0.25rem; display: flex; flex-direction: column; gap: 0.25rem; }
  .week-event {
    padding: 0.3rem 0.4rem; border-radius: var(--nxb-radius-sm);
    background: var(--azure-100); border-left: 3px solid var(--azure-600);
    cursor: pointer;
    transition: opacity var(--nxb-transition-fast),
                background var(--nxb-transition-fast),
                box-shadow var(--nxb-transition-fast);
    font-size: 0.72rem;
    position: relative;
  }
  .week-event:hover { opacity: 0.9; background: var(--azure-100); box-shadow: var(--shadow-hang-sm); z-index: 2; }
  .week-event:hover .week-event-name { white-space: normal; overflow: visible; }
  .week-event.ignored {
    opacity: 0.4; text-decoration: line-through;
    background: var(--sage-200); border-left-color: var(--nxb-color-border);
  }
  .week-event-name {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: white-space 0s;
  }
  .week-event-time { color: var(--nxb-color-text-muted); font-size: 0.68rem; }
  .week-event-none {
    font-size: 0.68rem; color: var(--nxb-color-text-muted);
    padding: 0.25rem; text-align: center;
  }

  @media (max-width: 768px) { .week-grid { grid-template-columns: repeat(3, 1fr); } }
  @media (max-width: 480px) {
    .week-grid { grid-template-columns: repeat(2, 1fr); }
    .week-day-col:last-child:nth-child(odd) { grid-column: 1 / -1; }
  }

  /* Allowed-days chip row */
  .days-checkbox-row { display: flex; gap: 0.375rem; flex-wrap: wrap; margin-top: 0.375rem; }
  .day-check {
    display: flex; align-items: center; gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--nxb-color-border);
    border-radius: var(--nxb-radius-md);
    font-size: 0.8rem; cursor: pointer;
    user-select: none; transition: background var(--nxb-transition-fast), border-color var(--nxb-transition-fast);
  }
  .day-check:has(input:checked) {
    background: var(--fuchsia-50);
    border-color: rgba(212, 36, 111, 0.25);
    color: var(--fuchsia-800);
  }
  .day-check input { margin: 0; accent-color: var(--fuchsia-600); }

  /* Preview windows */
  .preview-windows-section {
    margin-top: 0.75rem; padding-top: 0.75rem;
    border-top: 1px solid var(--nxb-color-border);
  }
  .preview-panel { margin-top: 0.75rem; }
  .preview-loading { font-size: 0.85rem; color: var(--nxb-color-text-muted); padding: 0.5rem 0; }
  .preview-empty { font-size: 0.85rem; color: var(--nxb-color-text-muted); padding: 0.5rem 0; }
  .preview-section { margin-bottom: 0.75rem; }
  .preview-section-title {
    font-family: var(--font-sans);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--nxb-color-text-secondary);
    margin-bottom: 0.5rem;
  }
  .preview-toggle { cursor: pointer; list-style: none; user-select: none; }
  .preview-toggle::-webkit-details-marker { display: none; }
  .preview-toggle::before {
    content: '\\25B6'; font-size: 0.6rem; margin-right: 0.375rem;
    display: inline-block; transition: transform var(--dur-2) var(--ease-out-expo);
  }
  details[open] > .preview-toggle::before { transform: rotate(90deg); }
  .preview-slots-list { display: flex; flex-wrap: wrap; gap: 0.375rem; }
  .preview-slot {
    display: inline-flex; align-items: center; gap: 0.375rem;
    background: var(--teal-50); border: 1px solid rgba(13,92,82,0.3); color: var(--teal-600);
    padding: 0.25rem 0.625rem; border-radius: 999px;
    font-size: 0.8rem; font-weight: 500;
  }
  .preview-slot-day { font-weight: 600; }
  .preview-slot-time { opacity: 0.85; }
  .blocking-events-list { display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.375rem; }
  .blocking-event {
    display: flex; justify-content: space-between; align-items: center;
    padding: 0.375rem 0.5rem;
    border-radius: var(--nxb-radius-sm);
    font-size: 0.8rem;
    background: var(--sage-200);
  }
  .blocking-event.ignored { opacity: 0.5; text-decoration: line-through; }
  .blocking-event-info { display: flex; flex-direction: column; gap: 0.125rem; }
  .blocking-event-name { font-weight: 500; }
  .blocking-event-time { font-size: 0.72rem; color: var(--nxb-color-text-muted); }

  /* New meeting form */
  .form-group { margin-bottom: 1rem; }
  .form-label {
    display: block;
    font-family: var(--font-sans);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--nxb-color-text-secondary);
    margin-bottom: 0.375rem;
  }
  .form-input {
    width: 100%; padding: 0.5rem 0.625rem;
    border: 1px solid var(--nxb-color-border-light);
    border-radius: var(--nxb-radius-sm);
    font-size: 0.92rem; font-family: inherit;
    background: var(--sage-100); color: var(--nxb-color-text);
    box-sizing: border-box;
    transition: border-color var(--nxb-transition-fast), box-shadow var(--nxb-transition-fast), background var(--nxb-transition-fast);
  }
  .form-input:focus {
    outline: none;
    border-color: var(--fuchsia-600);
    background: var(--sage-50);
    box-shadow: 0 0 0 3px rgba(212, 36, 111, 0.12);
  }
  .form-textarea { resize: vertical; min-height: 3rem; }
  .form-hint { font-size: 0.72rem; color: var(--nxb-color-text-muted); margin-top: 0.25rem; }
  .form-hint-inline {
    font-weight: 400; color: var(--nxb-color-text-muted);
    font-size: 0.8rem; font-style: italic; font-family: var(--font-serif);
  }
`;

/** Meeting picker (attendee scheduling) page styles. */
export const meetingStyles = `
  .subtitle { color: var(--nxb-color-text-secondary); margin-bottom: 2rem; }
  .status {
    display: inline-block; padding: 0.25rem 0.75rem;
    border-radius: 999px;
    font-size: 0.72rem; font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 1.5rem;
  }
  .status.proposed  { background: var(--warning-100); color: var(--warning-600); border: 1px solid rgba(208,104,42,0.25); }
  .status.confirmed { background: var(--success-100); color: var(--success-600); border: 1px solid rgba(43,138,110,0.25); }
  .status.cancelled { background: var(--danger-100);  color: var(--danger-600);  border: 1px solid rgba(168,58,74,0.25); }
  .section-label {
    font-family: var(--font-sans);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--nxb-color-text-secondary);
    margin: 1.5rem 0 0.75rem;
  }
  .slot-card {
    display: block; width: 100%; padding: 1rem; margin-bottom: 0.75rem;
    border: 1px solid var(--nxb-color-border);
    border-radius: var(--nxb-radius-md);
    background: var(--nxb-color-surface); cursor: pointer; text-align: left;
    transition: border-color var(--nxb-transition-fast),
                box-shadow var(--nxb-transition-fast),
                transform var(--nxb-transition-fast),
                background var(--nxb-transition-fast);
  }
  .slot-card:hover:not(:disabled) {
    border-color: rgba(212, 36, 111, 0.35);
    box-shadow: var(--shadow-hang-md);
    transform: translateY(-1px);
  }
  .slot-card:disabled { opacity: 0.7; cursor: default; }
  .slot-card.selected {
    border-color: var(--success-600);
    background: var(--success-100);
  }
  .slot-card.active {
    border-color: var(--fuchsia-600);
    background: var(--fuchsia-50);
  }
  .slot-date { font-weight: 600; margin-bottom: 0.25rem; }
  .slot-time { color: var(--nxb-color-text-secondary); }
  .slot-confirmed { color: var(--success-600); font-weight: 600; margin-top: 0.25rem; }
  .location-card {
    display: block; width: 100%; padding: 0.875rem; margin-bottom: 0.5rem;
    border: 1px solid var(--nxb-color-border);
    border-radius: var(--nxb-radius-md);
    background: var(--nxb-color-surface); cursor: pointer; text-align: left;
    transition: border-color var(--nxb-transition-fast), box-shadow var(--nxb-transition-fast), background var(--nxb-transition-fast);
  }
  .location-card:hover:not(:disabled) {
    border-color: rgba(212, 36, 111, 0.35);
    box-shadow: var(--shadow-hang-md);
  }
  .location-card:disabled { opacity: 0.7; cursor: default; }
  .location-card.active {
    border-color: var(--fuchsia-600);
    background: var(--fuchsia-50);
  }
  .location-name { font-weight: 600; }
  .location-address {
    color: var(--nxb-color-text-secondary);
    font-size: 0.88rem;
    margin-top: 0.125rem;
  }
  .location-notes {
    color: var(--nxb-color-text-muted);
    font-size: 0.8rem;
    font-style: italic;
    font-family: var(--font-serif);
    margin-top: 0.125rem;
  }
  .none-work {
    display: block; width: 100%; padding: 0.75rem; margin-top: 1rem;
    border: none; background: none;
    color: var(--fuchsia-600);
    cursor: pointer; font-size: 0.9rem; font-weight: 500;
    min-height: 44px;
    transition: color var(--nxb-transition-fast);
  }
  .none-work:hover { color: var(--fuchsia-800); text-decoration: underline; }
  .none-work[disabled] {
    cursor: progress; text-decoration: none; opacity: 0.75;
    display: flex; align-items: center; justify-content: center; gap: 0.5rem;
  }
  .none-work[disabled]:hover { color: var(--fuchsia-600); text-decoration: none; }
  .none-work .spinner {
    width: 14px; height: 14px; border-radius: 50%;
    border: 2px solid currentColor; border-right-color: transparent;
    animation: none-work-spin 0.8s linear infinite;
    display: inline-block;
  }
  @keyframes none-work-spin { to { transform: rotate(360deg); } }
  .slot-card-new {
    opacity: 0;
    transform: translateY(-4px);
    transition: opacity 0.3s ease, transform 0.3s ease;
  }
  .slot-card-new-in {
    opacity: 1;
    transform: translateY(0);
  }
  #message {
    margin-top: 1rem; padding: 1rem;
    border-radius: var(--nxb-radius-md);
    display: none; word-break: break-word;
    border: 1px solid transparent;
  }
  #message.success {
    display: block;
    background: var(--success-100);
    color: var(--success-600);
    border-color: rgba(43,138,110,0.25);
  }
  #message.error {
    display: block;
    background: var(--danger-100);
    color: var(--danger-600);
    border-color: rgba(168,58,74,0.25);
  }

  @media (max-width: 640px) {
    .slot-card { padding: 0.875rem; min-height: 44px; }
    .slot-date { font-size: 0.9rem; }
    .slot-time { font-size: 0.85rem; }
    .location-card { padding: 0.875rem; min-height: 44px; }
    .location-address { word-break: break-word; }
  }`;

/** Landing/Join page styles (light — used by /join). */
export const landingStyles = `
  body { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .container { text-align: center; max-width: 480px; padding: 40px 24px; }
  .landing-brand {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-bottom: 8px;
  }
  .landing-wordmark {
    font-family: var(--font-serif);
    font-size: 2rem;
    font-weight: 700;
    letter-spacing: -0.03em;
    font-variation-settings: 'opsz' 96, 'WONK' 1;
    color: var(--nxb-color-text);
  }
  .tagline {
    font-family: var(--font-serif);
    font-style: italic;
    font-size: 1.1rem;
    color: var(--nxb-color-text-secondary);
    margin-bottom: 32px;
  }
  .subtitle {
    text-align: center; color: var(--nxb-color-text-secondary);
    font-size: 0.95rem; margin-bottom: 32px;
  }
  .how-it-works {
    background: var(--nxb-color-surface);
    border-radius: var(--nxb-radius-md);
    border: 1px solid var(--nxb-color-border);
    padding: 24px;
    text-align: left;
    margin-bottom: 24px;
  }
  .how-it-works h2 {
    font-family: var(--font-sans);
    font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.2em;
    color: var(--nxb-color-text-muted); margin-bottom: 16px;
    border: none; padding: 0; font-weight: 700;
  }
  .step { display: flex; gap: 12px; margin-bottom: 14px; }
  .step:last-child { margin-bottom: 0; }
  .step-num {
    flex-shrink: 0; width: 24px; height: 24px;
    background: var(--fuchsia-600); color: white;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.75rem; font-weight: 600;
  }
  .step p { font-size: 0.95rem; line-height: 1.55; color: var(--nxb-color-text); }
  .cta-btn {
    display: inline-block; padding: 12px 28px;
    background: var(--fuchsia-600); color: white;
    border-radius: var(--nxb-radius-md);
    font-size: 0.92rem; font-weight: 600;
    letter-spacing: -0.005em;
    text-decoration: none; margin-bottom: 16px;
    transition: background var(--nxb-transition-fast), transform var(--nxb-transition-fast), box-shadow var(--nxb-transition-fast);
    box-shadow: 0 12px 22px -14px rgba(212,36,111,0.55), 0 1px 0 rgba(255,255,255,0.15) inset;
    min-height: 44px;
  }
  .cta-btn:hover {
    background: var(--fuchsia-800);
    text-decoration: none;
    transform: translateY(-1px);
  }
  .email-badge {
    display: inline-block;
    background: var(--teal-50);
    border: 1px solid rgba(13,92,82,0.3);
    color: var(--teal-800);
    padding: 8px 16px;
    border-radius: var(--nxb-radius-sm);
    font-size: 0.92rem; font-weight: 500;
    font-family: var(--font-mono);
    word-break: break-all;
  }
  .note {
    text-align: center;
    font-family: var(--font-serif);
    font-style: italic;
    font-size: 0.88rem;
    color: var(--nxb-color-text-muted);
    margin-top: 16px;
  }
  .error {
    background: var(--danger-100);
    color: var(--danger-600);
    border: 1px solid rgba(168,58,74,0.25);
    padding: 10px 12px;
    border-radius: var(--nxb-radius-sm);
    font-size: 0.88rem; margin-bottom: 16px; display: none;
  }

  @media (max-width: 640px) {
    .container { padding: 24px 16px; }
    .how-it-works { padding: 16px; }
    .email-badge { font-size: 0.85rem; padding: 6px 12px; }
  }`;

/** Join page form card styles — extends landingStyles. */
export const joinStyles = `
  .container { max-width: 420px; }
  .card label {
    display: block;
    font-family: var(--font-sans);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--nxb-color-text-secondary);
    margin-bottom: 6px;
  }
  .card input, .card select {
    width: 100%; padding: 10px 12px;
    border: 1px solid var(--nxb-color-border-light);
    border-radius: var(--nxb-radius-sm);
    font-size: 0.95rem;
    margin-bottom: 16px;
    transition: border-color var(--nxb-transition-fast), box-shadow var(--nxb-transition-fast), background var(--nxb-transition-fast);
    background: var(--sage-100); color: var(--nxb-color-text);
  }
  .card input:focus, .card select:focus {
    outline: none;
    border-color: var(--fuchsia-600);
    box-shadow: 0 0 0 3px rgba(212,36,111,0.12);
    background: var(--sage-50);
  }
  .card button[type="submit"] {
    width: 100%; padding: 12px;
    background: var(--fuchsia-600); color: white;
    border: none; border-radius: var(--nxb-radius-md);
    font-size: 0.95rem; font-weight: 600;
    letter-spacing: -0.005em;
    box-shadow: 0 12px 22px -14px rgba(212,36,111,0.55), 0 1px 0 rgba(255,255,255,0.15) inset;
    transition: background var(--nxb-transition-fast), transform var(--nxb-transition-fast);
    min-height: 44px;
  }
  .card button[type="submit"]:hover {
    background: var(--fuchsia-800);
    transform: translateY(-1px);
  }

  @media (max-width: 640px) {
    .card input, .card select { font-size: 16px; min-height: 44px; }
  }`;

/** Landing page styles — dark navy stage with pinstripe, matching tanzillo.ai. */
export const landingDarkStyles = `
  :root {
    --bg: var(--navy-600);
    --text: var(--sage-200);
    --text-muted: var(--navy-100);
    --accent: var(--fuchsia-600);
    --surface: rgba(240, 245, 243, 0.04);
    --border: rgba(240, 245, 243, 0.08);
  }

  body {
    background: var(--navy-600);
    color: var(--sage-200);
    font-family: var(--font-sans);
    margin: 0;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
  }
  body::before {
    /* The signature dark-mode pinstripe overlay — 1px rules at 40px, 1.5% opacity */
    content: '';
    position: fixed;
    inset: 0;
    background: repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(240,245,243,0.015) 39px, rgba(240,245,243,0.015) 40px);
    pointer-events: none;
    z-index: 0;
  }

  /* ── Particles (dust in a stage light) ── */
  .particles {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
  }
  .particle {
    position: absolute;
    width: 2px;
    height: 2px;
    background: rgba(212, 36, 111, 0.06);
    border-radius: 50%;
    animation: particleFloat linear infinite;
  }
  .particle:nth-child(1)  { left: 5%;  top: 10%; animation-duration: 28s; animation-delay: 0s; }
  .particle:nth-child(2)  { left: 15%; top: 80%; animation-duration: 22s; animation-delay: -4s;  width: 3px; height: 3px; background: rgba(13, 92, 82, 0.05); }
  .particle:nth-child(3)  { left: 25%; top: 30%; animation-duration: 32s; animation-delay: -8s; }
  .particle:nth-child(4)  { left: 35%; top: 60%; animation-duration: 26s; animation-delay: -2s;  background: rgba(13, 92, 82, 0.04); }
  .particle:nth-child(5)  { left: 45%; top: 15%; animation-duration: 30s; animation-delay: -12s; width: 3px; height: 3px; }
  .particle:nth-child(6)  { left: 55%; top: 70%; animation-duration: 24s; animation-delay: -6s;  background: rgba(13, 92, 82, 0.05); }
  .particle:nth-child(7)  { left: 65%; top: 40%; animation-duration: 34s; animation-delay: -10s; }
  .particle:nth-child(8)  { left: 75%; top: 85%; animation-duration: 20s; animation-delay: -3s;  width: 3px; height: 3px; background: rgba(212, 36, 111, 0.04); }
  .particle:nth-child(9)  { left: 85%; top: 25%; animation-duration: 28s; animation-delay: -7s; }
  .particle:nth-child(10) { left: 92%; top: 55%; animation-duration: 36s; animation-delay: -14s; }
  .particle:nth-child(11) { left: 10%; top: 45%; animation-duration: 25s; animation-delay: -5s;  background: rgba(212, 36, 111, 0.05); }
  .particle:nth-child(12) { left: 40%; top: 90%; animation-duration: 30s; animation-delay: -9s; }
  .particle:nth-child(13) { left: 70%; top: 5%;  animation-duration: 27s; animation-delay: -11s; background: rgba(240,245,243,0.05); }
  .particle:nth-child(14) { left: 50%; top: 50%; animation-duration: 33s; animation-delay: -1s;  background: rgba(212, 36, 111, 0.08); }
  .particle:nth-child(15) { left: 20%; top: 65%; animation-duration: 29s; animation-delay: -13s; }

  @keyframes particleFloat {
    0%   { transform: translate(0, 0) scale(1);        opacity: 0; }
    10%  { opacity: 1; }
    50%  { transform: translate(60px, -120px) scale(1.5); opacity: 0.6; }
    90%  { opacity: 1; }
    100% { transform: translate(-30px, -240px) scale(1); opacity: 0; }
  }

  /* ── Nav ── */
  .landing-nav {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 100;
    padding: 24px 40px;
    display: flex;
    align-items: center;
    gap: 14px;
    background: rgba(38, 60, 78, 0.4);
    backdrop-filter: blur(20px) saturate(1.4);
    -webkit-backdrop-filter: blur(20px) saturate(1.4);
    pointer-events: none;
  }
  .landing-nav > * { pointer-events: auto; }
  .nav-logo svg { width: 28px; height: auto; display: block; }
  .nav-brand {
    font-family: var(--font-serif);
    font-size: 1.15rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    font-variation-settings: 'opsz' 24, 'WONK' 1;
    color: var(--sage-200);
  }
  .nav-brand .dot-accent { color: var(--fuchsia-600); }

  /* ── Hero ── */
  .hero {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    z-index: 1;
    padding: 24px;
  }
  .hero-content {
    text-align: center;
    max-width: 480px;
    opacity: 0;
    transform: translateY(30px);
    animation: fadeSlideUp 1.1s var(--ease-out-expo) 0.3s forwards;
  }
  .hero-icon {
    width: 56px;
    height: 56px;
    border-radius: 14px;
    background: rgba(212, 36, 111, 0.12);
    border: 1px solid rgba(212, 36, 111, 0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 28px;
  }
  .hero-headline {
    font-family: var(--font-serif);
    font-size: clamp(3rem, 6vw, 4.5rem);
    font-weight: 700;
    line-height: 1.02;
    letter-spacing: -0.04em;
    font-variation-settings: 'opsz' 144, 'WONK' 1;
    color: var(--sage-200);
    margin-bottom: 20px;
    text-wrap: balance;
  }
  .hero-headline em {
    color: var(--fuchsia-600);
    font-style: italic;
    font-weight: 700;
  }
  .hero-description {
    font-family: var(--font-sans);
    font-size: 1.1rem;
    line-height: 1.65;
    color: var(--navy-100);
    font-weight: 400;
    margin-bottom: 36px;
    max-width: 28ch;
    margin-left: auto;
    margin-right: auto;
  }
  .sign-in-btn {
    display: inline-block;
    padding: 12px 32px;
    background: var(--fuchsia-600);
    color: white;
    border: none;
    border-radius: var(--nxb-radius-md);
    font-family: var(--font-sans);
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: -0.005em;
    cursor: pointer;
    text-decoration: none;
    transition: background var(--nxb-transition-fast), transform var(--nxb-transition-fast), box-shadow var(--nxb-transition-fast);
    box-shadow: 0 12px 22px -14px rgba(212,36,111,0.55), 0 1px 0 rgba(255,255,255,0.15) inset;
    min-height: 44px;
  }
  .sign-in-btn:hover {
    background: var(--fuchsia-800);
    transform: translateY(-1px);
    text-decoration: none;
  }

  @keyframes fadeSlideUp {
    to { opacity: 1; transform: translateY(0); }
  }

  /* ── Footer ── */
  .landing-footer {
    position: relative;
    z-index: 1;
    padding: 32px 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-top: 1px solid rgba(240, 245, 243, 0.08);
  }
  .footer-copy {
    font-family: var(--font-sans);
    font-size: 0.75rem;
    color: var(--navy-100);
    font-weight: 400;
  }
  .footer-links {
    display: flex;
    gap: 16px;
  }
  .footer-links a {
    font-size: 0.75rem;
    color: var(--navy-100);
    font-weight: 400;
    text-decoration: none;
    transition: color var(--nxb-transition-fast);
  }
  .footer-links a:hover {
    color: var(--fuchsia-600);
  }

  @media (max-width: 640px) {
    .landing-nav { padding: 16px; }
    .landing-footer { padding: 20px 16px; flex-wrap: wrap; gap: 8px; justify-content: center; }
    .hero { padding: 16px; }
    .hero-description { font-size: 1rem; margin-bottom: 28px; }
    .sign-in-btn { padding: 12px 28px; }
    .login-card { padding: 28px 20px; }
  }`;

/** Dashboard page styles. */
export const dashboardStyles = `
  .container { max-width: 720px; margin: 0 auto; padding: 2rem 2rem 4rem; }

  /* ── Page header ────────────────────────────── */
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }
  .page-header h1 { margin: 0; }
  .page-date {
    font-family: var(--font-sans);
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--nxb-color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.2em;
    margin-bottom: 6px;
  }
  .page-header-actions { display: flex; align-items: center; gap: 0.75rem; flex-shrink: 0; }
  .page-header-actions .btn-primary { white-space: nowrap; }

  .filter-select {
    padding: 6px 12px;
    font-size: 0.8rem;
    font-weight: 500;
    border: 1px solid var(--nxb-color-border);
    border-radius: var(--nxb-radius-sm);
    background: var(--nxb-color-surface);
    color: var(--nxb-color-text);
    cursor: pointer;
    transition: border-color var(--nxb-transition-fast);
  }
  .filter-select:hover { border-color: var(--nxb-color-border-light); }

  /* ── Meeting card ───────────────────────────── */
  .meeting-card {
    background: var(--nxb-color-surface);
    border: 1px solid var(--nxb-color-border);
    border-radius: var(--nxb-radius-md);
    padding: 1.25rem;
    margin-bottom: 0.75rem;
    transition: border-color var(--nxb-transition-fast),
                box-shadow var(--nxb-transition-fast),
                transform var(--nxb-transition-fast);
    overflow: hidden;
  }
  .meeting-card:hover {
    border-color: var(--nxb-color-border-light);
    box-shadow: var(--shadow-hang-md);
    transform: translateY(-1px);
  }
  .meeting-card.cancelled {
    opacity: 0.6;
    padding: 0.875rem 1.25rem;
  }

  .meeting-card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 0.25rem;
  }
  .meeting-card-header > div:first-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meeting-card-header .action-btn { flex-shrink: 0; }

  .meeting-title {
    font-family: var(--font-serif);
    font-size: 1.05rem;
    font-weight: 600;
    letter-spacing: -0.015em;
    font-variation-settings: 'opsz' 24, 'WONK' 1;
    color: var(--nxb-color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meeting-card:hover .meeting-title {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
  }

  .meeting-meta {
    font-size: 0.8rem;
    color: var(--nxb-color-text-muted);
    margin-bottom: 0.75rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ── Status badges ──────────────────────────── */
  .status-badge {
    display: inline-block;
    padding: 0.15rem 0.625rem;
    border-radius: 999px;
    font-family: var(--font-sans);
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    flex-shrink: 0;
    border: 1px solid transparent;
  }
  .status-badge.draft        { background: var(--sage-400);      color: var(--nxb-color-text-secondary); border-color: var(--sage-600); }
  .status-badge.proposed     { background: var(--warning-100);   color: var(--warning-600); border-color: rgba(208,104,42,0.25); }
  .status-badge.confirmed    { background: var(--success-100);   color: var(--success-600); border-color: rgba(43,138,110,0.25); }
  .status-badge.rescheduling { background: var(--azure-100);     color: var(--azure-600);   border-color: rgba(59,90,140,0.25); }
  .status-badge.cancelled    { background: var(--danger-100);    color: var(--danger-600);  border-color: rgba(168,58,74,0.25); }
  .status-badge.completed    { background: var(--sage-400);      color: var(--nxb-color-text-secondary); border-color: var(--sage-600); }

  /* ── Times section ──────────────────────────── */
  .meeting-times {
    font-size: 0.85rem;
    color: var(--nxb-color-text-secondary);
    margin-bottom: 0.75rem;
    overflow: hidden;
  }
  .meeting-times strong { color: var(--nxb-color-text); font-weight: 600; }
  .time-slot {
    display: inline-block;
    background: var(--teal-50);
    border: 1px solid rgba(13, 92, 82, 0.2);
    color: var(--teal-800);
    border-radius: var(--nxb-radius-sm);
    padding: 0.15rem 0.55rem;
    margin: 0.15rem 0.25rem 0.15rem 0;
    font-size: 0.78rem;
    font-family: var(--font-mono);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ── Agenda ─────────────────────────────────── */
  .meeting-agenda {
    margin-bottom: 0.75rem;
    font-size: 0.85rem;
  }
  .agenda-label {
    font-family: var(--font-sans);
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--nxb-color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.16em;
    margin-bottom: 0.25rem;
  }
  .agenda-item {
    color: var(--nxb-color-text);
    padding: 0.125rem 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .agenda-item::before { content: '— '; color: var(--fuchsia-600); }
  .agenda-none {
    color: var(--nxb-color-text-muted);
    font-style: italic;
    font-family: var(--font-serif);
    font-size: 0.82rem;
  }
  .add-agenda-btn {
    font-size: 0.78rem;
    color: var(--fuchsia-600);
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
    margin-top: 0.125rem;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    transition: color var(--nxb-transition-fast);
  }
  .add-agenda-btn:hover { color: var(--fuchsia-800); text-decoration: underline; }

  /* ── Action buttons ─────────────────────────── */
  .meeting-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding-top: 0.75rem;
    border-top: 1px solid var(--nxb-color-border);
  }
  .action-btn {
    padding: 0.3rem 0.75rem;
    font-size: 0.78rem;
    font-weight: 600;
    border-radius: var(--nxb-radius-sm);
    cursor: pointer;
    transition: background var(--nxb-transition-fast),
                color var(--nxb-transition-fast),
                border-color var(--nxb-transition-fast);
    white-space: nowrap;
  }
  .action-btn.nudge {
    background: var(--warning-100);
    color: var(--warning-600);
    border: 1px solid rgba(208,104,42,0.3);
  }
  .action-btn.nudge:hover { background: rgba(208,104,42,0.18); }
  .action-btn.reschedule {
    background: var(--azure-100);
    color: var(--azure-600);
    border: 1px solid rgba(59,90,140,0.3);
  }
  .action-btn.reschedule:hover { background: rgba(59,90,140,0.2); }
  .action-btn.cancel {
    background: none;
    color: var(--danger-600);
    border: 1px solid rgba(168,58,74,0.35);
  }
  .action-btn.cancel:hover { background: var(--danger-100); }
  .action-btn.ignore {
    background: none;
    color: var(--nxb-color-text-muted);
    border: 1px solid var(--nxb-color-border);
  }
  .action-btn.ignore:hover {
    background: var(--sage-200);
    color: var(--nxb-color-text-secondary);
  }
  .action-btn.comms {
    background: none;
    color: var(--teal-600);
    border: 1px solid rgba(13,92,82,0.3);
  }
  .action-btn.comms:hover {
    background: rgba(13,92,82,0.08);
    color: var(--teal-800);
    border-color: var(--teal-600);
  }

  /* ── RSVP badge ─────────────────────────────── */
  .rsvp { font-size: 0.78rem; font-weight: 500; }
  .rsvp.pending  { color: var(--warning-600); }
  .rsvp.accepted { color: var(--success-600); }
  .rsvp.declined { color: var(--danger-600); }

  /* ── Empty state ────────────────────────────── */
  .empty-state {
    text-align: center;
    padding: 3rem 1rem;
    color: var(--nxb-color-text-muted);
  }
  .empty-state p { margin-bottom: 0.5rem; }
  .empty-state p:first-child {
    font-family: var(--font-serif);
    font-style: italic;
    font-size: 1.05rem;
    color: var(--nxb-color-text-secondary);
  }

  /* ── Settings modal wide variant ────────────── */
  .modal-wide .modal-content { max-width: 640px; }
  @media (min-width: 900px) {
    .modal-wide .modal-content { max-width: 820px; }
  }

  /* ── Comms modal ────────────────────────────── */
  .comms-modal .modal-content { max-width: 560px; }
  .comms-body {
    max-height: 60vh;
    overflow-y: auto;
    padding: 0;
  }
  .comms-loading {
    text-align: center;
    padding: 2rem;
    color: var(--nxb-color-text-muted);
    font-family: var(--font-serif);
    font-style: italic;
  }

  .email-msg {
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--nxb-color-border);
  }
  .email-msg:last-child { border-bottom: none; }

  .email-msg-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 0.375rem;
    gap: 0.5rem;
  }
  .email-direction {
    font-family: var(--font-sans);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    padding: 0.125rem 0.45rem;
    border-radius: var(--nxb-radius-sm);
    flex-shrink: 0;
  }
  .email-direction.inbound  { background: var(--azure-100);   color: var(--azure-600); }
  .email-direction.outbound { background: var(--sage-400);    color: var(--nxb-color-text-secondary); }
  .email-direction.luca     { background: rgba(212,36,111,0.1); color: var(--fuchsia-800); }

  .intent-badge {
    font-family: var(--font-sans);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 0.125rem 0.45rem;
    border-radius: var(--nxb-radius-sm);
    background: var(--violet-100);
    color: var(--violet-600);
  }

  .email-meta {
    font-size: 0.75rem;
    color: var(--nxb-color-text-muted);
    margin-bottom: 0.5rem;
    overflow: hidden;
  }
  .email-meta div {
    margin-bottom: 0.0625rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .email-body {
    font-size: 0.85rem;
    color: var(--nxb-color-text);
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.55;
  }

  .comms-footer {
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--nxb-color-border);
    font-size: 0.75rem;
    color: var(--nxb-color-text-muted);
    text-align: center;
    word-break: break-word;
    font-family: var(--font-mono);
  }

  /* ── Agenda modal ───────────────────────────── */
  .agenda-modal-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--nxb-color-border);
    gap: 0.5rem;
  }
  .agenda-modal-item:last-child { border-bottom: none; }
  .agenda-modal-item > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .agenda-remove-btn {
    color: var(--nxb-color-text-muted);
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    background: none;
    border: none;
    padding: 0 0.25rem;
    min-width: 44px;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: color var(--nxb-transition-fast);
  }
  .agenda-remove-btn:hover { color: var(--danger-600); }
  .agenda-add-row {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }
  .agenda-add-row input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--nxb-color-border-light);
    border-radius: var(--nxb-radius-sm);
    font-size: 0.85rem;
    background: var(--sage-100);
    min-width: 0;
  }
  .agenda-add-row input:focus {
    outline: none;
    border-color: var(--fuchsia-600);
    background: var(--sage-50);
    box-shadow: 0 0 0 3px rgba(212,36,111,0.12);
  }

  /* ── Mobile: dashboard ─────────────────────── */
  @media (max-width: 640px) {
    .container { padding: 1rem 1rem 3rem; }
    .page-header {
      flex-direction: column;
      align-items: stretch;
      gap: 1rem;
      margin-bottom: 1.25rem;
    }
    .page-header > div:first-child { width: 100%; }
    .page-header h1 { text-wrap: balance; }
    .page-header-actions {
      width: 100%;
      gap: 0.5rem;
    }
    .page-header-actions .btn-primary { flex: 1; }
    .page-header-actions .filter-select { flex: 0 0 auto; }
    .meeting-card { padding: 1rem; }
    .meeting-card.cancelled { padding: 0.75rem 1rem; }
    .meeting-card-header { flex-wrap: wrap; gap: 0.5rem; }
    .meeting-card-header > div:first-child { width: 100%; }
    .meeting-meta { white-space: normal; word-break: break-word; }
    .meeting-times { overflow: visible; }
    .time-slot { white-space: normal; overflow: visible; font-size: 0.72rem; }
    .action-btn { min-height: 44px; padding: 0.5rem 0.75rem; display: inline-flex; align-items: center; }
    .filter-select { min-height: 44px; }
    .email-msg { padding: 0.75rem 1rem; }
    .email-msg-header { flex-wrap: wrap; }
    .email-meta div { white-space: normal; word-break: break-all; }
    .comms-footer { padding: 0.75rem 1rem; }
    .agenda-add-row input { font-size: 16px; min-height: 44px; }
  }
`;
