import { Hono } from "hono";
import { fontLinks, landingDarkStyles, logoSvgDark } from "../lib/styles.js";
import { verifySupabaseJwt, parseCookie } from "../lib/supabase-jwt.js";
import { env } from "../config.js";

export const loginRoutes = new Hono();

/**
 * GET /login — Self-contained login page with magic-link form.
 * If already authenticated, redirect to /join (Google Calendar onboarding).
 */
loginRoutes.get("/", async (c) => {
  const cookieHeader = c.req.header("cookie");
  const token = parseCookie(cookieHeader, "sb_access_token");

  if (token) {
    try {
      await verifySupabaseJwt(token);
      return c.redirect("/join");
    } catch {
      // Token invalid — show login
    }
  }

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseAnonKey = env.SUPABASE_ANON_KEY;
  const isProd = env.NODE_ENV === "production";
  const emailRedirectTo = isProd
    ? "https://luca.tanzillo.ai/login"
    : `http://localhost:${env.PORT}/login`;

  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign In — Luca</title>
  ${fontLinks}
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      line-height: 1.6;
    }
    ${landingDarkStyles}

    /* ── Login form overrides ── */
    .login-card {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 40px 36px;
      width: 100%;
      max-width: 400px;
      text-align: center;
    }
    .login-icon {
      width: 48px;
      height: 48px;
      border-radius: 14px;
      background: rgba(249, 115, 22, 0.08);
      border: 1px solid rgba(249, 115, 22, 0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
    }
    .login-title {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: var(--text);
      margin-bottom: 6px;
    }
    .login-subtitle {
      font-size: 0.9rem;
      color: var(--text-muted);
      margin-bottom: 28px;
    }
    .login-form { text-align: left; }
    .login-form label {
      display: block;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 6px;
    }
    .login-form input {
      width: 100%;
      padding: 10px 12px;
      font-family: inherit;
      font-size: 0.9rem;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      color: var(--text);
      transition: border-color 150ms ease;
      margin-bottom: 20px;
    }
    .login-form input::placeholder { color: rgba(148,163,184,0.5); }
    .login-form input:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(249,115,22,0.15);
      background: rgba(255,255,255,0.08);
    }
    .login-form input:disabled { opacity: 0.5; cursor: not-allowed; }
    .login-submit {
      width: 100%;
      padding: 11px 16px;
      background: var(--accent);
      color: white;
      border: none;
      border-radius: 8px;
      font-family: inherit;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 150ms ease, transform 150ms ease;
      letter-spacing: -0.01em;
    }
    .login-submit:hover:not(:disabled) {
      background: #ea6c0e;
      transform: translateY(-1px);
    }
    .login-submit:disabled { opacity: 0.5; cursor: not-allowed; }
    .login-hint {
      text-align: center;
      color: var(--text-muted);
      font-size: 0.75rem;
      margin-top: 14px;
    }
    .login-error {
      background: rgba(239,68,68,0.15);
      border: 1px solid rgba(239,68,68,0.25);
      color: #fca5a5;
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 0.8rem;
      margin-bottom: 16px;
      display: none;
    }
    .login-error.show { display: block; }
    .link-sent { display: none; padding: 12px 0; }
    .link-sent.show { display: block; }
    .link-sent-icon {
      font-size: 40px;
      margin-bottom: 14px;
    }
    .link-sent h2 {
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 6px;
    }
    .link-sent p {
      color: var(--text-muted);
      font-size: 0.85rem;
      margin-bottom: 4px;
    }
    .link-sent strong { color: var(--text); }
    .link-sent-hint {
      color: var(--text-muted);
      font-size: 0.75rem;
      margin-top: 10px;
    }
    .link-sent-retry {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      color: var(--text-muted);
      padding: 8px 16px;
      border-radius: 8px;
      font-family: inherit;
      font-size: 0.8rem;
      cursor: pointer;
      margin-top: 16px;
      transition: all 150ms ease;
    }
    .link-sent-retry:hover {
      background: rgba(255,255,255,0.1);
      color: var(--text);
    }
    .back-link {
      display: inline-block;
      margin-top: 20px;
      font-size: 0.8rem;
      color: var(--text-muted);
      text-decoration: none;
      transition: color 0.2s;
    }
    .back-link:hover { color: var(--accent); text-decoration: none; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
</head>
<body>
  <!-- Ambient particles -->
  <div class="particles">
    <div class="particle"></div><div class="particle"></div><div class="particle"></div>
    <div class="particle"></div><div class="particle"></div><div class="particle"></div>
    <div class="particle"></div><div class="particle"></div><div class="particle"></div>
    <div class="particle"></div><div class="particle"></div><div class="particle"></div>
    <div class="particle"></div><div class="particle"></div><div class="particle"></div>
  </div>

  <!-- Nav -->
  <nav class="landing-nav">
    <div class="nav-logo">${logoSvgDark}</div>
    <span class="nav-brand">tanzillo.ai</span>
  </nav>

  <!-- Login -->
  <section class="hero">
    <div class="hero-content" style="max-width: 400px;">
      <div class="login-card">
        <div class="login-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>
        </div>
        <h1 class="login-title">Luca</h1>
        <p class="login-subtitle">Your AI scheduling assistant</p>

        <div id="linkSent" class="link-sent">
          <div class="link-sent-icon">&#9993;</div>
          <h2>Check your email</h2>
          <p>We sent a magic link to <strong id="sentEmail"></strong></p>
          <p class="link-sent-hint">Click the link in the email to sign in.</p>
          <button class="link-sent-retry" onclick="resetForm()">Use a different email</button>
        </div>

        <form id="loginForm" class="login-form" onsubmit="handleSubmit(event)">
          <div id="loginError" class="login-error"></div>
          <label for="email">Email address</label>
          <input id="email" type="email" placeholder="you@example.com" required autofocus />
          <button type="submit" id="submitBtn" class="login-submit">Send Magic Link</button>
          <p class="login-hint">No password needed. We'll email you a link to sign in.</p>
        </form>

        <a href="/" class="back-link">&larr; Back</a>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="landing-footer">
    <span class="footer-copy">&copy; 2026 tanzillo.ai</span>
    <div class="footer-links">
      <a href="https://tanzillo.ai/privacy.html">Privacy</a>
      <a href="https://tanzillo.ai/terms.html">Terms</a>
    </div>
  </footer>

  <script>
    var SUPABASE_URL = '${supabaseUrl}';
    var SUPABASE_ANON_KEY = '${supabaseAnonKey}';
    var EMAIL_REDIRECT = '${emailRedirectTo}';
    var LUCA_API = window.location.origin;

    var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Check if we're returning from a magic link
    sb.auth.onAuthStateChange(function(event, session) {
      if (event === 'SIGNED_IN' && session) {
        // Redirect through Luca's own /auth/session to set shared cookies
        var params = new URLSearchParams({
          token: session.access_token,
          refresh: session.refresh_token,
          returnTo: LUCA_API + '/join'
        });
        window.location.href = LUCA_API + '/auth/session?' + params;
      }
    });

    function handleSubmit(e) {
      e.preventDefault();
      var emailInput = document.getElementById('email');
      var submitBtn = document.getElementById('submitBtn');
      var errorDiv = document.getElementById('loginError');
      var email = emailInput.value.trim();

      if (!email) return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';
      errorDiv.className = 'login-error';

      sb.auth.signInWithOtp({
        email: email,
        options: { emailRedirectTo: EMAIL_REDIRECT }
      }).then(function(result) {
        if (result.error) throw result.error;
        document.getElementById('sentEmail').textContent = email;
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('linkSent').className = 'link-sent show';
      }).catch(function(err) {
        errorDiv.textContent = err.message || 'Failed to send magic link. Please try again.';
        errorDiv.className = 'login-error show';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Magic Link';
      });
    }

    function resetForm() {
      document.getElementById('loginForm').style.display = 'block';
      document.getElementById('linkSent').className = 'link-sent';
      document.getElementById('email').value = '';
      document.getElementById('loginError').className = 'login-error';
      document.getElementById('submitBtn').disabled = false;
      document.getElementById('submitBtn').textContent = 'Send Magic Link';
    }
  </script>
</body>
</html>`);
});
