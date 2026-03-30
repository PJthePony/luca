/**
 * Tessio Design System — inline CSS for server-rendered pages.
 *
 * This mirrors the tokens from tessio-ds/ so that Luca's pages
 * share the same visual language as the other apps.
 * Font: IBM Plex Sans (loaded via Google Fonts <link>).
 */

/** Google Fonts <link> tags + favicon — drop into every <head>. */
export const fontLinks = `
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%230a0e1a'/%3E%3Csvg x='4' y='4' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23f97316' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2'/%3E%3Cline x1='16' y1='2' x2='16' y2='6'/%3E%3Cline x1='8' y1='2' x2='8' y2='6'/%3E%3Cline x1='3' y1='10' x2='21' y2='10'/%3E%3Cpath d='M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01'/%3E%3C/svg%3E%3C/svg%3E" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">`;

/** Inline SVG of the calendar icon (dark bg variant — for landing/login pages). */
export const logoSvgDark = `<div style="width:32px;height:32px;border-radius:8px;background:rgba(249,115,22,0.08);border:1px solid rgba(249,115,22,0.15);display:flex;align-items:center;justify-content:center;">
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>
</div>`;

/** Inline SVG of the calendar icon — for dashboard/settings headers. */
export const logoSvg = `<div style="width:32px;height:32px;border-radius:8px;background:rgba(249,115,22,0.08);border:1px solid rgba(249,115,22,0.15);display:flex;align-items:center;justify-content:center;">
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>
</div>`;

/** Shared reset + tokens + base component styles. */
export const baseStyles = `
  /* ── Reset ─────────────────────────────────────── */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  button { cursor: pointer; font-family: inherit; font-size: inherit; border: none; background: none; }
  input, textarea, select { font-family: inherit; font-size: inherit; }

  /* ── Tokens ────────────────────────────────────── */
  :root {
    --nxb-color-bg: #f8fafc;
    --nxb-color-surface: #ffffff;
    --nxb-color-surface-elevated: #ffffff;
    --nxb-color-border: #e2e8f0;
    --nxb-color-border-light: #cbd5e1;
    --nxb-color-text: #0f172a;
    --nxb-color-text-secondary: #64748b;
    --nxb-color-text-muted: #94a3b8;
    --nxb-color-primary: #475569;
    --nxb-color-primary-hover: #334155;
    --nxb-color-primary-ring: rgba(71, 85, 105, 0.1);
    --nxb-color-primary-ghost: rgba(71, 85, 105, 0.06);
    --nxb-color-accent: #f97316;
    --nxb-color-success: #059669;
    --nxb-color-danger: #ef4444;
    --nxb-radius-sm: 4px;
    --nxb-radius-md: 6px;
    --nxb-radius-lg: 10px;
    --nxb-shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.04);
    --nxb-shadow-md: 0 4px 16px rgba(0, 0, 0, 0.08);
    --nxb-shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.12);
    --nxb-transition-fast: 150ms ease;
  }

  /* ── Base ───────────────────────────────────────── */
  html {
    font-size: 20px;
  }
  @media (min-width: 641px) {
    html {
      font-size: 16px;
    }
  }
  body {
    font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--nxb-color-bg);
    color: var(--nxb-color-text);
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  /* ── Typography ────────────────────────────────── */
  h1 { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; }
  h2 { font-size: 1.1rem; font-weight: 600; letter-spacing: -0.01em; margin: 2rem 0 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--nxb-color-border); }
  .text-sm { font-size: 0.875rem; }
  .text-muted { color: var(--nxb-color-text-muted); }
  .italic { font-style: italic; }

  /* ── Layout ────────────────────────────────────── */
  .container { max-width: 640px; margin: 0 auto; padding: 2rem; }

  /* ── Card ──────────────────────────────────────── */
  .card {
    background: var(--nxb-color-surface);
    border-radius: var(--nxb-radius-lg);
    padding: 1rem;
    margin-bottom: 0.75rem;
    border: 1px solid var(--nxb-color-border);
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
    border-radius: var(--nxb-radius-md);
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
    border-radius: 1rem;
    font-size: 0.75rem;
    font-weight: 500;
    margin-left: 0.5rem;
    background: var(--nxb-color-border);
    color: var(--nxb-color-text-secondary);
  }
  .badge.default { background: #dbeafe; color: #1d4ed8; }
  .badge.online { background: #f3e8ff; color: #7c3aed; }
  .badge.in-person { background: #fef3c7; color: #92400e; }

  /* ── Buttons ───────────────────────────────────── */
  .btn {
    padding: 0.5rem 1rem;
    border-radius: var(--nxb-radius-md);
    font-weight: 500;
    font-size: 0.875rem;
    transition: background var(--nxb-transition-fast), color var(--nxb-transition-fast);
  }
  .btn:active { transform: scale(0.97); }
  .btn-primary { background: var(--nxb-color-primary); color: white; }
  .btn-primary:hover { background: var(--nxb-color-primary-hover); }
  .btn-secondary { background: var(--nxb-color-border); color: var(--nxb-color-text); }
  .btn-secondary:hover { background: var(--nxb-color-border-light); }
  .btn-danger { background: none; color: var(--nxb-color-danger); border: none; cursor: pointer; font-size: 0.8rem; }
  .btn-danger:hover { text-decoration: underline; }
  .btn-sm { padding: 0.25rem 0.75rem; font-size: 0.8rem; }
  .btn-ghost { background: transparent; color: var(--nxb-color-primary); border: 1px solid var(--nxb-color-border); }
  .btn-ghost:hover { background: var(--nxb-color-primary-ghost); border-color: var(--nxb-color-primary); }

  /* ── Forms ─────────────────────────────────────── */
  .form-group { margin-bottom: 0.75rem; }
  .form-group label { display: block; font-size: 0.8rem; font-weight: 500; margin-bottom: 0.25rem; color: var(--nxb-color-text-secondary); }
  .form-group input, .form-group select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--nxb-color-border);
    border-radius: var(--nxb-radius-md);
    font-size: 0.875rem;
    background: var(--nxb-color-bg);
    color: var(--nxb-color-text);
    transition: border-color var(--nxb-transition-fast);
  }
  .form-group input[type="checkbox"] {
    width: auto;
    padding: 0;
    border: revert;
    border-radius: revert;
    background: revert;
    vertical-align: middle;
    margin-right: 0.375rem;
  }
  .form-group label:has(input[type="checkbox"]) {
    display: flex;
    align-items: center;
    font-size: 0.875rem;
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
    font-size: 0.875rem;
    font-weight: 500;
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
    margin: 0 0.375rem 0 0;
  }
  .form-group input:focus, .form-group select:focus {
    outline: none;
    border-color: var(--nxb-color-primary);
    background: var(--nxb-color-surface);
    box-shadow: 0 0 0 3px var(--nxb-color-primary-ring);
  }
  .form-row { display: flex; gap: 0.75rem; }
  .form-row > * { flex: 1; }

  /* ── Modal ─────────────────────────────────────── */
  .modal {
    display: none;
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(4px);
    z-index: 1000;
    justify-content: center;
    align-items: center;
    padding: 16px;
  }
  .modal.active { display: flex; }
  .modal-content {
    background: var(--nxb-color-surface);
    border: 1px solid var(--nxb-color-border);
    border-radius: var(--nxb-radius-lg);
    box-shadow: var(--nxb-shadow-lg);
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
    font-size: 1.05rem;
    font-weight: 600;
    letter-spacing: -0.02em;
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
  }
  .modal-close:hover { background: var(--nxb-color-border); color: var(--nxb-color-text); }
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
  .toggle input { width: 1rem; height: 1rem; accent-color: var(--nxb-color-primary); }
  .toggle-label { font-size: 0.8rem; color: var(--nxb-color-text-secondary); }

  /* ── Toast ─────────────────────────────────────── */
  #toast {
    display: none;
    position: fixed;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    background: var(--nxb-color-primary);
    color: white;
    padding: 0.75rem 1.5rem;
    border-radius: var(--nxb-radius-md);
    font-size: 0.875rem;
    font-weight: 500;
    z-index: 100;
    box-shadow: var(--nxb-shadow-md);
  }
  #toast.show { display: block; }

  /* ── Misc ──────────────────────────────────────── */
  .powered-by { text-align: center; margin-top: 3rem; color: var(--nxb-color-text-muted); font-size: 0.8rem; }
  .section-title { font-size: 0.8rem; font-weight: 600; color: var(--nxb-color-text-secondary); text-transform: uppercase; letter-spacing: 0.06em; margin: 0.75rem 0 0.5rem; }
  .user-info { color: var(--nxb-color-text-secondary); margin-bottom: 2rem; font-size: 0.875rem; }
  a { color: var(--nxb-color-primary); text-decoration: none; }
  a:hover { text-decoration: underline; }

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
    .modal-title { font-size: 0.95rem; }
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

/** Shared app header/nav styles — Tessio topbar pattern. */
export const headerStyles = `
  .app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    background: var(--nxb-color-bg);
    border-bottom: 1px solid var(--nxb-color-border);
  }
  .app-header-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
    color: var(--nxb-color-text);
  }
  .app-header-brand:hover { text-decoration: none; }
  .app-name {
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .app-header-nav {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .header-btn {
    width: 34px;
    height: 34px;
    border-radius: var(--nxb-radius-md);
    border: 1px solid var(--nxb-color-border);
    background: var(--nxb-color-bg);
    color: var(--nxb-color-text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--nxb-transition-fast);
    -webkit-tap-highlight-color: transparent;
  }
  .header-btn:hover,
  .header-btn:active {
    background: var(--nxb-color-surface);
    color: var(--nxb-color-text);
  }
  @media (max-width: 768px) {
    .app-header { padding: 12px 16px; }
    .header-btn { width: 44px; height: 44px; }
    .app-header-nav { gap: 8px; }
  }
`;

/** Settings-specific styles (availability, locations, etc.) */
export const settingsStyles = `
  .day-label { font-weight: 500; min-width: 100px; flex-shrink: 0; }
  .avail-row { flex-wrap: wrap; gap: 0.5rem; }
  .avail-slots { flex: 1; display: flex; flex-wrap: wrap; gap: 0.25rem; align-items: center; }
  .avail-slot {
    display: inline-flex; align-items: center; gap: 0.25rem;
    background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534;
    padding: 0.125rem 0.5rem; border-radius: 1rem;
    font-size: 0.8rem; font-weight: 500;
  }
  .btn-inline-delete { background: none; border: none; color: var(--nxb-color-text-muted); cursor: pointer; font-size: 1rem; line-height: 1; padding: 0 0.125rem; min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; }
  .btn-inline-delete:hover { color: var(--nxb-color-danger); }
  .locations-section { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--nxb-color-border); }
  .location-row { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; margin-bottom: 0.25rem; border-radius: var(--nxb-radius-sm); }
  .location-row:hover { background: var(--nxb-color-bg); }
  .pac-container { z-index: 10000 !important; border-radius: var(--nxb-radius-md); border: 1px solid var(--nxb-color-border); box-shadow: var(--nxb-shadow-md); font-family: 'IBM Plex Sans', -apple-system, sans-serif; }
  .pac-item { padding: 0.5rem 0.75rem; font-size: 0.875rem; cursor: pointer; }
  .pac-item:hover { background: var(--nxb-color-bg); }
  .pac-item-selected { background: #eff6ff; }
  .pac-icon { display: none; }
  .pac-item-query { font-weight: 600; font-size: 0.875rem; }
  .autocomplete-hint { font-size: 0.75rem; color: var(--nxb-color-text-muted); margin-top: 0.25rem; }

  @media (max-width: 640px) {
    .day-label { min-width: 70px; font-size: 0.85rem; }
    .avail-row { gap: 0.375rem; }
    .avail-slot { font-size: 0.75rem; padding: 0.125rem 0.375rem; }
    .location-row { flex-wrap: wrap; gap: 0.5rem; }
    .location-row > div { min-width: 0; overflow: hidden; }
    .location-row > div .text-muted { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  }

  /* Preview windows */
  .preview-windows-section { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--nxb-color-border); }
  .preview-panel { margin-top: 0.75rem; }
  .preview-loading { font-size: 0.85rem; color: var(--nxb-color-text-muted); padding: 0.5rem 0; }
  .preview-empty { font-size: 0.85rem; color: var(--nxb-color-text-muted); padding: 0.5rem 0; }
  .preview-section { margin-bottom: 0.75rem; }
  .preview-section-title { font-size: 0.8rem; font-weight: 600; color: var(--nxb-color-text-secondary); margin-bottom: 0.5rem; }
  .preview-toggle { cursor: pointer; list-style: none; user-select: none; }
  .preview-toggle::-webkit-details-marker { display: none; }
  .preview-toggle::before { content: '\\25B6'; font-size: 0.6rem; margin-right: 0.375rem; display: inline-block; transition: transform 0.15s; }
  details[open] > .preview-toggle::before { transform: rotate(90deg); }
  .preview-slots-list { display: flex; flex-wrap: wrap; gap: 0.375rem; }
  .preview-slot {
    display: inline-flex; align-items: center; gap: 0.375rem;
    background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af;
    padding: 0.25rem 0.625rem; border-radius: 1rem;
    font-size: 0.8rem; font-weight: 500;
  }
  .preview-slot-day { font-weight: 600; }
  .preview-slot-time { opacity: 0.85; }
  .blocking-events-list { display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.375rem; }
  .blocking-event {
    display: flex; justify-content: space-between; align-items: center;
    padding: 0.375rem 0.5rem; border-radius: var(--nxb-radius-sm);
    font-size: 0.8rem; background: var(--nxb-color-bg);
  }
  .blocking-event.ignored { opacity: 0.5; text-decoration: line-through; }
  .blocking-event-info { display: flex; flex-direction: column; gap: 0.125rem; }
  .blocking-event-name { font-weight: 500; }
  .blocking-event-time { font-size: 0.75rem; color: var(--nxb-color-text-muted); }

  /* New meeting form */
  .form-group { margin-bottom: 1rem; }
  .form-label { display: block; font-weight: 500; font-size: 0.85rem; margin-bottom: 0.375rem; }
  .form-input {
    width: 100%; padding: 0.5rem 0.625rem; border: 1px solid var(--nxb-color-border);
    border-radius: var(--nxb-radius-md); font-size: 0.875rem; font-family: inherit;
    background: var(--nxb-color-surface); color: var(--nxb-color-text);
    box-sizing: border-box;
  }
  .form-input:focus { outline: none; border-color: var(--nxb-color-accent); }
  .form-textarea { resize: vertical; min-height: 3rem; }
  .form-hint { font-size: 0.75rem; color: var(--nxb-color-text-muted); margin-top: 0.25rem; }
  .form-hint-inline { font-weight: 400; color: var(--nxb-color-text-muted); font-size: 0.8rem; }
`;

/** Meeting picker page styles. */
export const meetingStyles = `
  .subtitle { color: var(--nxb-color-text-secondary); margin-bottom: 2rem; }
  .status {
    display: inline-block; padding: 0.25rem 0.75rem;
    border-radius: 1rem; font-size: 0.875rem; font-weight: 500; margin-bottom: 1.5rem;
  }
  .status.proposed { background: #fef3c7; color: #92400e; }
  .status.confirmed { background: #d1fae5; color: #065f46; }
  .status.cancelled { background: #fee2e2; color: #991b1b; }
  .section-label { font-weight: 600; font-size: 0.9rem; color: var(--nxb-color-text-secondary); margin: 1.5rem 0 0.75rem; }
  .slot-card {
    display: block; width: 100%; padding: 1rem; margin-bottom: 0.75rem;
    border: 2px solid var(--nxb-color-border); border-radius: var(--nxb-radius-lg);
    background: var(--nxb-color-surface); cursor: pointer; text-align: left;
    transition: border-color var(--nxb-transition-fast);
  }
  .slot-card:hover:not(:disabled) { border-color: var(--nxb-color-primary); }
  .slot-card:disabled { opacity: 0.7; cursor: default; }
  .slot-card.selected { border-color: var(--nxb-color-success); background: #ecfdf5; }
  .slot-card.active { border-color: var(--nxb-color-primary); background: #f1f5f9; }
  .slot-date { font-weight: 600; margin-bottom: 0.25rem; }
  .slot-time { color: var(--nxb-color-text-secondary); }
  .slot-confirmed { color: var(--nxb-color-success); font-weight: 600; margin-top: 0.25rem; }
  .location-card {
    display: block; width: 100%; padding: 0.875rem; margin-bottom: 0.5rem;
    border: 2px solid var(--nxb-color-border); border-radius: var(--nxb-radius-lg);
    background: var(--nxb-color-surface); cursor: pointer; text-align: left;
    transition: border-color var(--nxb-transition-fast);
  }
  .location-card:hover:not(:disabled) { border-color: var(--nxb-color-accent); }
  .location-card:disabled { opacity: 0.7; cursor: default; }
  .location-card.active { border-color: var(--nxb-color-accent); background: #fff7ed; }
  .location-name { font-weight: 600; }
  .location-address { color: var(--nxb-color-text-secondary); font-size: 0.875rem; margin-top: 0.125rem; }
  .location-notes { color: var(--nxb-color-text-muted); font-size: 0.8rem; font-style: italic; margin-top: 0.125rem; }
  .none-work {
    display: block; width: 100%; padding: 0.75rem; margin-top: 1rem;
    border: none; background: none; color: var(--nxb-color-primary);
    cursor: pointer; font-size: 0.9rem;
    min-height: 44px;
  }
  .none-work:hover { text-decoration: underline; }
  #message { margin-top: 1rem; padding: 1rem; border-radius: var(--nxb-radius-md); display: none; word-break: break-word; }
  #message.success { display: block; background: #d1fae5; color: #065f46; }
  #message.error { display: block; background: #fee2e2; color: #991b1b; }

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
    font-size: 2rem;
    font-weight: 700;
    letter-spacing: -0.03em;
    color: var(--nxb-color-text);
  }
  .tagline { font-size: 1.05rem; color: var(--nxb-color-text-secondary); margin-bottom: 32px; }
  .subtitle { text-align: center; color: var(--nxb-color-text-secondary); font-size: 0.95rem; margin-bottom: 32px; }
  .how-it-works {
    background: var(--nxb-color-surface);
    border-radius: var(--nxb-radius-lg);
    border: 1px solid var(--nxb-color-border);
    padding: 24px;
    text-align: left;
    margin-bottom: 24px;
  }
  .how-it-works h2 {
    font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--nxb-color-text-muted); margin-bottom: 16px; border: none; padding: 0;
  }
  .step { display: flex; gap: 12px; margin-bottom: 14px; }
  .step:last-child { margin-bottom: 0; }
  .step-num {
    flex-shrink: 0; width: 24px; height: 24px;
    background: var(--nxb-color-primary); color: white;
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    font-size: 0.75rem; font-weight: 600;
  }
  .step p { font-size: 0.95rem; line-height: 1.55; color: var(--nxb-color-text); }
  .cta-btn {
    display: inline-block; padding: 12px 28px;
    background: var(--nxb-color-primary); color: white;
    border-radius: var(--nxb-radius-md); font-size: 0.95rem; font-weight: 600;
    text-decoration: none; margin-bottom: 16px;
    transition: background var(--nxb-transition-fast);
    min-height: 44px;
  }
  .cta-btn:hover { background: var(--nxb-color-primary-hover); text-decoration: none; }
  .email-badge {
    display: inline-block; background: var(--nxb-color-bg);
    border: 1px solid var(--nxb-color-border);
    color: var(--nxb-color-primary); padding: 8px 16px;
    border-radius: var(--nxb-radius-md); font-size: 0.95rem; font-weight: 500; font-family: monospace;
    word-break: break-all;
  }
  .note { text-align: center; font-size: 0.85rem; color: var(--nxb-color-text-muted); margin-top: 16px; }
  .error {
    background: #fee2e2; color: #dc2626;
    padding: 10px 12px; border-radius: var(--nxb-radius-md);
    font-size: 0.875rem; margin-bottom: 16px; display: none;
  }

  @media (max-width: 640px) {
    .container { padding: 24px 16px; }
    .how-it-works { padding: 16px; }
    .email-badge { font-size: 0.85rem; padding: 6px 12px; }
  }`;

/** Landing page styles — dark mode, matching tanzillo.ai. */
export const landingDarkStyles = `
  :root {
    --bg: #0a0e1a;
    --text: #f1f5f9;
    --text-muted: #94a3b8;
    --accent: #f97316;
    --surface: rgba(255,255,255,0.04);
    --border: rgba(255,255,255,0.06);
  }

  body {
    background: var(--bg);
    color: var(--text);
    margin: 0;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── Particles ── */
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
    background: rgba(249, 115, 22, 0.15);
    border-radius: 50%;
    animation: particleFloat linear infinite;
  }
  .particle:nth-child(1)  { left: 5%;  top: 10%; animation-duration: 28s; animation-delay: 0s; }
  .particle:nth-child(2)  { left: 15%; top: 80%; animation-duration: 22s; animation-delay: -4s;  width: 3px; height: 3px; background: rgba(241,245,249,0.06); }
  .particle:nth-child(3)  { left: 25%; top: 30%; animation-duration: 32s; animation-delay: -8s;  width: 1px; height: 1px; }
  .particle:nth-child(4)  { left: 35%; top: 60%; animation-duration: 26s; animation-delay: -2s;  background: rgba(241,245,249,0.05); }
  .particle:nth-child(5)  { left: 45%; top: 15%; animation-duration: 30s; animation-delay: -12s; width: 3px; height: 3px; }
  .particle:nth-child(6)  { left: 55%; top: 70%; animation-duration: 24s; animation-delay: -6s;  width: 1px; height: 1px; background: rgba(241,245,249,0.07); }
  .particle:nth-child(7)  { left: 65%; top: 40%; animation-duration: 34s; animation-delay: -10s; }
  .particle:nth-child(8)  { left: 75%; top: 85%; animation-duration: 20s; animation-delay: -3s;  background: rgba(249,115,22,0.1); }
  .particle:nth-child(9)  { left: 85%; top: 25%; animation-duration: 28s; animation-delay: -7s;  width: 1px; height: 1px; }
  .particle:nth-child(10) { left: 92%; top: 55%; animation-duration: 36s; animation-delay: -14s; width: 3px; height: 3px; background: rgba(241,245,249,0.04); }
  .particle:nth-child(11) { left: 10%; top: 45%; animation-duration: 25s; animation-delay: -5s;  background: rgba(249,115,22,0.08); }
  .particle:nth-child(12) { left: 40%; top: 90%; animation-duration: 30s; animation-delay: -9s;  width: 1px; height: 1px; }
  .particle:nth-child(13) { left: 70%; top: 5%;  animation-duration: 27s; animation-delay: -11s; background: rgba(241,245,249,0.05); }
  .particle:nth-child(14) { left: 50%; top: 50%; animation-duration: 33s; animation-delay: -1s;  width: 1px; height: 1px; background: rgba(249,115,22,0.12); }
  .particle:nth-child(15) { left: 20%; top: 65%; animation-duration: 29s; animation-delay: -13s; }

  @keyframes particleFloat {
    0%   { transform: translate(0, 0) scale(1);       opacity: 0; }
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
    background: linear-gradient(to bottom, rgba(10,14,26,0.95) 0%, rgba(10,14,26,0) 100%);
    pointer-events: none;
  }
  .landing-nav > * { pointer-events: auto; }
  .nav-logo svg { width: 28px; height: auto; display: block; }
  .nav-brand {
    font-size: 0.95rem;
    font-weight: 500;
    color: var(--text);
    letter-spacing: -0.01em;
  }

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
    animation: fadeSlideUp 1s cubic-bezier(0.16, 1, 0.3, 1) 0.3s forwards;
  }
  .hero-icon {
    width: 56px;
    height: 56px;
    border-radius: 16px;
    background: rgba(249, 115, 22, 0.08);
    border: 1px solid rgba(249, 115, 22, 0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 24px;
  }
  .hero-headline {
    font-size: clamp(2.5rem, 5vw, 4rem);
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -0.04em;
    color: var(--text);
    margin-bottom: 16px;
  }
  .hero-description {
    font-size: 1.15rem;
    line-height: 1.7;
    color: var(--text-muted);
    font-weight: 300;
    margin-bottom: 40px;
  }
  .sign-in-btn {
    display: inline-block;
    padding: 12px 36px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 8px;
    font-family: inherit;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    transition: background 150ms ease, transform 150ms ease;
    letter-spacing: -0.01em;
    min-height: 44px;
  }
  .sign-in-btn:hover {
    background: #ea6c0e;
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
    border-top: 1px solid var(--border);
  }
  .footer-copy {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-weight: 300;
  }
  .footer-links {
    display: flex;
    gap: 16px;
  }
  .footer-links a {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-weight: 300;
    text-decoration: none;
    transition: color 0.2s;
  }
  .footer-links a:hover {
    color: var(--accent);
  }

  @media (max-width: 640px) {
    .landing-nav { padding: 16px; }
    .landing-footer { padding: 20px 16px; flex-wrap: wrap; gap: 8px; justify-content: center; }
    .hero { padding: 16px; }
    .hero-description { font-size: 1rem; margin-bottom: 32px; }
    .sign-in-btn { padding: 12px 28px; }
    .login-card { padding: 28px 20px; }
  }`;

/** Join page form card styles — extends landingStyles. */
export const joinStyles = `
  .container { max-width: 420px; }
  .card label { display: block; font-size: 0.8rem; font-weight: 600; color: var(--nxb-color-text-secondary); margin-bottom: 6px; }
  .card input, .card select {
    width: 100%; padding: 10px 12px;
    border: 1px solid var(--nxb-color-border);
    border-radius: var(--nxb-radius-md); font-size: 0.95rem;
    margin-bottom: 16px; transition: border-color var(--nxb-transition-fast);
    background: var(--nxb-color-bg); color: var(--nxb-color-text);
  }
  .card input:focus, .card select:focus {
    outline: none; border-color: var(--nxb-color-primary);
    box-shadow: 0 0 0 3px var(--nxb-color-primary-ring);
    background: var(--nxb-color-surface);
  }
  .card button[type="submit"] {
    width: 100%; padding: 12px;
    background: var(--nxb-color-primary); color: white;
    border: none; border-radius: var(--nxb-radius-md);
    font-size: 0.95rem; font-weight: 600;
    transition: background var(--nxb-transition-fast);
    min-height: 44px;
  }
  .card button[type="submit"]:hover { background: var(--nxb-color-primary-hover); }

  @media (max-width: 640px) {
    .card input, .card select { font-size: 16px; min-height: 44px; }
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
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--nxb-color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 4px;
  }
  .page-header-actions { display: flex; align-items: center; gap: 0.75rem; }

  .filter-select {
    padding: 6px 12px;
    font-size: 0.8rem;
    font-weight: 500;
    border: 1px solid var(--nxb-color-border);
    border-radius: var(--nxb-radius-md);
    background: var(--nxb-color-surface);
    color: var(--nxb-color-text);
    cursor: pointer;
  }

  /* ── Meeting card ───────────────────────────── */
  .meeting-card {
    background: var(--nxb-color-surface);
    border: 1px solid var(--nxb-color-border);
    border-radius: var(--nxb-radius-lg);
    padding: 1.25rem;
    margin-bottom: 0.75rem;
    transition: border-color var(--nxb-transition-fast);
    overflow: hidden;
  }
  .meeting-card:hover { border-color: var(--nxb-color-border-light); }
  .meeting-card.cancelled {
    opacity: 0.55;
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
  .meeting-card-header .action-btn {
    flex-shrink: 0;
  }

  .meeting-title {
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--nxb-color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    padding: 0.125rem 0.625rem;
    border-radius: 1rem;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    flex-shrink: 0;
  }
  .status-badge.draft { background: var(--nxb-color-border); color: var(--nxb-color-text-secondary); }
  .status-badge.proposed { background: #fef3c7; color: #92400e; }
  .status-badge.confirmed { background: #d1fae5; color: #065f46; }
  .status-badge.rescheduling { background: #dbeafe; color: #1d4ed8; }
  .status-badge.cancelled { background: #fee2e2; color: #991b1b; }
  .status-badge.completed { background: #e2e8f0; color: #475569; }

  /* ── Times section ──────────────────────────── */
  .meeting-times {
    font-size: 0.85rem;
    color: var(--nxb-color-text-secondary);
    margin-bottom: 0.75rem;
    overflow: hidden;
  }
  .meeting-times strong { color: var(--nxb-color-text); }
  .time-slot {
    display: inline-block;
    background: var(--nxb-color-bg);
    border: 1px solid var(--nxb-color-border);
    border-radius: var(--nxb-radius-sm);
    padding: 0.125rem 0.5rem;
    margin: 0.125rem 0.25rem 0.125rem 0;
    font-size: 0.8rem;
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
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--nxb-color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 0.25rem;
  }
  .agenda-item {
    color: var(--nxb-color-text);
    padding: 0.125rem 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .agenda-item::before { content: '- '; color: var(--nxb-color-text-muted); }
  .agenda-none { color: var(--nxb-color-text-muted); font-style: italic; font-size: 0.8rem; }
  .add-agenda-btn {
    font-size: 0.78rem;
    color: var(--nxb-color-primary);
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
    margin-top: 0.125rem;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
  }
  .add-agenda-btn:hover { text-decoration: underline; }

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
    font-weight: 500;
    border-radius: var(--nxb-radius-md);
    cursor: pointer;
    transition: all var(--nxb-transition-fast);
    white-space: nowrap;
  }
  .action-btn.nudge {
    background: #fef3c7; color: #92400e; border: 1px solid #fde68a;
  }
  .action-btn.nudge:hover { background: #fde68a; }
  .action-btn.reschedule {
    background: #dbeafe; color: #1d4ed8; border: 1px solid #bfdbfe;
  }
  .action-btn.reschedule:hover { background: #bfdbfe; }
  .action-btn.cancel {
    background: none; color: var(--nxb-color-danger); border: 1px solid #fecaca;
  }
  .action-btn.cancel:hover { background: #fee2e2; }
  .action-btn.ignore {
    background: none; color: var(--nxb-color-text-muted); border: 1px solid var(--nxb-color-border);
  }
  .action-btn.ignore:hover { background: var(--nxb-color-bg); color: var(--nxb-color-text-secondary); }
  .action-btn.comms {
    background: none; color: var(--nxb-color-primary); border: 1px solid var(--nxb-color-border);
  }
  .action-btn.comms:hover { background: var(--nxb-color-primary-ghost); border-color: var(--nxb-color-primary); }

  /* ── RSVP badge ─────────────────────────────── */
  .rsvp { font-size: 0.78rem; }
  .rsvp.pending { color: #92400e; }
  .rsvp.accepted { color: #065f46; }
  .rsvp.declined { color: #991b1b; }

  /* ── Empty state ────────────────────────────── */
  .empty-state {
    text-align: center;
    padding: 3rem 1rem;
    color: var(--nxb-color-text-muted);
  }
  .empty-state p { margin-bottom: 0.5rem; }

  /* ── Settings modal wide variant ────────────── */
  .modal-wide .modal-content {
    max-width: 640px;
  }

  /* ── Comms modal ────────────────────────────── */
  .comms-modal .modal-content {
    max-width: 560px;
  }
  .comms-body {
    max-height: 60vh;
    overflow-y: auto;
    padding: 0;
  }
  .comms-loading {
    text-align: center;
    padding: 2rem;
    color: var(--nxb-color-text-muted);
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
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 0.0625rem 0.375rem;
    border-radius: 0.25rem;
    flex-shrink: 0;
  }
  .email-direction.inbound { background: #dbeafe; color: #1d4ed8; }
  .email-direction.outbound { background: #f1f5f9; color: var(--nxb-color-text-secondary); }
  .email-direction.luca { background: #fef3c7; color: #92400e; }

  .intent-badge {
    font-size: 0.65rem;
    font-weight: 500;
    padding: 0.0625rem 0.375rem;
    border-radius: 0.25rem;
    background: #f3e8ff;
    color: #7c3aed;
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
    line-height: 1.5;
  }

  .comms-footer {
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--nxb-color-border);
    font-size: 0.75rem;
    color: var(--nxb-color-text-muted);
    text-align: center;
    word-break: break-word;
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
  }
  .agenda-remove-btn:hover { color: var(--nxb-color-danger); }
  .agenda-add-row {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }
  .agenda-add-row input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--nxb-color-border);
    border-radius: var(--nxb-radius-md);
    font-size: 0.85rem;
    background: var(--nxb-color-bg);
    min-width: 0;
  }
  .agenda-add-row input:focus {
    outline: none;
    border-color: var(--nxb-color-primary);
    box-shadow: 0 0 0 3px var(--nxb-color-primary-ring);
  }

  /* ── Mobile: dashboard ─────────────────────── */
  @media (max-width: 640px) {
    .container { padding: 1rem 1rem 3rem; }
    .meeting-card { padding: 1rem; }
    .meeting-card.cancelled { padding: 0.75rem 1rem; }
    .meeting-card-header { flex-wrap: wrap; gap: 0.5rem; }
    .meeting-card-header > div:first-child { width: 100%; }
    .meeting-meta { white-space: normal; word-break: break-word; }
    .meeting-times { overflow: visible; }
    .time-slot { white-space: normal; overflow: visible; font-size: 0.75rem; }
    .action-btn { min-height: 44px; padding: 0.5rem 0.75rem; display: inline-flex; align-items: center; }
    .filter-select { min-height: 44px; }
    .email-msg { padding: 0.75rem 1rem; }
    .email-msg-header { flex-wrap: wrap; }
    .email-meta div { white-space: normal; word-break: break-all; }
    .comms-footer { padding: 0.75rem 1rem; }
    .agenda-add-row input { font-size: 16px; min-height: 44px; }
  }
`;
