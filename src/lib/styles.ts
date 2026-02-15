/**
 * NexBite Design System — inline CSS for server-rendered pages.
 *
 * This mirrors the tokens from nexbite-ds/ so that Luca's pages
 * share the same visual language as the other apps.
 * Font: IBM Plex Sans (loaded via Google Fonts <link>).
 */

/** Google Fonts <link> tags — drop into every <head>. */
export const fontLinks = `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">`;

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
  .btn-secondary { background: var(--nxb-color-bg); color: var(--nxb-color-text); border: 1px solid var(--nxb-color-border); }
  .btn-secondary:hover { background: var(--nxb-color-border); }
  .btn-danger { background: none; color: var(--nxb-color-danger); border: none; cursor: pointer; font-size: 0.8rem; }
  .btn-danger:hover { text-decoration: underline; }
  .btn-sm { padding: 0.25rem 0.75rem; font-size: 0.8rem; }

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
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(4px);
    z-index: 50;
    justify-content: center;
    align-items: center;
  }
  .modal.active { display: flex; }
  .modal-content {
    background: var(--nxb-color-surface);
    border: 1px solid var(--nxb-color-border);
    border-radius: var(--nxb-radius-lg);
    box-shadow: var(--nxb-shadow-lg);
    padding: 1.5rem;
    width: 90%;
    max-width: 400px;
  }
  .modal-title { font-weight: 600; font-size: 1.05rem; letter-spacing: -0.02em; margin-bottom: 1rem; }
  .modal-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem; }

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
  a:hover { text-decoration: underline; }`;

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
  .btn-inline-delete { background: none; border: none; color: var(--nxb-color-text-muted); cursor: pointer; font-size: 1rem; line-height: 1; padding: 0 0.125rem; }
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
  .autocomplete-hint { font-size: 0.75rem; color: var(--nxb-color-text-muted); margin-top: 0.25rem; }`;

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
  }
  .none-work:hover { text-decoration: underline; }
  #message { margin-top: 1rem; padding: 1rem; border-radius: var(--nxb-radius-md); display: none; }
  #message.success { display: block; background: #d1fae5; color: #065f46; }
  #message.error { display: block; background: #fee2e2; color: #991b1b; }`;

/** Landing/Join page styles. */
export const landingStyles = `
  body { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .container { text-align: center; max-width: 480px; padding: 40px 24px; }
  .logo { font-size: 48px; margin-bottom: 8px; }
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
  }
  .cta-btn:hover { background: var(--nxb-color-primary-hover); text-decoration: none; }
  .email-badge {
    display: inline-block; background: var(--nxb-color-bg);
    border: 1px solid var(--nxb-color-border);
    color: var(--nxb-color-primary); padding: 8px 16px;
    border-radius: var(--nxb-radius-md); font-size: 0.95rem; font-weight: 500; font-family: monospace;
  }
  .note { text-align: center; font-size: 0.85rem; color: var(--nxb-color-text-muted); margin-top: 16px; }
  .error {
    background: #fee2e2; color: #dc2626;
    padding: 10px 12px; border-radius: var(--nxb-radius-md);
    font-size: 0.875rem; margin-bottom: 16px; display: none;
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
  }
  .card button[type="submit"]:hover { background: var(--nxb-color-primary-hover); }`;
