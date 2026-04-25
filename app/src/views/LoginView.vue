<script setup>
const FAMILY_URL = 'https://family.tanzillo.ai'

function goToFamily() {
  window.location.href = `${FAMILY_URL}/?return_app=luca`
}
</script>

<template>
  <main class="page">
    <header class="bar">
      <a class="brand" :href="FAMILY_URL">
        <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>
        <span class="word">Luca</span>
      </a>
      <button class="btn ghost" @click="goToFamily">Sign in to The Family</button>
    </header>

    <section class="hero">
      <div class="eyebrow">tanzillo.ai · Calendar</div>
      <h1 class="title">Luca guards your calendar.</h1>
      <p class="lead">CC Luca on any email and he figures out when everyone's free. Your time, defended.</p>
      <button class="btn primary" @click="goToFamily">Sign in to The Family</button>
    </section>

    <section class="features">
      <article class="feature">
        <h3>Email-native scheduling</h3>
        <p>Forward or CC any email. Luca reads it, picks times, drafts the reply, and handles the back-and-forth.</p>
      </article>
      <article class="feature">
        <h3>Knows your priorities</h3>
        <p>Different rules for different people. Family always gets a slot. Cold pitches get a polite no.</p>
      </article>
      <article class="feature">
        <h3>No more "what works?"</h3>
        <p>You see the calendar event when it's confirmed. The negotiation happens without you.</p>
      </article>
    </section>

    <footer class="footer">
      <span>The Family · tanzillo.ai</span>
      <span class="sep">·</span>
      <a href="https://tanzillo.ai/terms.html">Terms</a>
      <span class="sep">·</span>
      <a href="https://tanzillo.ai/privacy.html">Privacy</a>
    </footer>
  </main>
</template>

<style scoped>
.page { min-height: 100dvh; background: var(--bg); display: flex; flex-direction: column; }
.bar { display: flex; align-items: center; justify-content: space-between; padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 10; background: var(--bg); backdrop-filter: saturate(140%) blur(8px); }
.brand { display: flex; align-items: center; gap: var(--space-3); text-decoration: none; color: var(--text); }
.icon { width: 22px; height: 22px; color: var(--accent); display: block; }
.word { font-family: var(--font-serif); font-weight: 600; font-size: var(--step-1); letter-spacing: -0.01em; }

.hero { max-width: 720px; margin: 0 auto; padding: var(--space-9) var(--space-5) var(--space-7); text-align: center; }
.title { font-family: var(--font-serif); font-style: italic; font-weight: 500; font-variation-settings: 'opsz' 72; letter-spacing: -0.018em; line-height: 1.02; font-size: var(--step-5); color: var(--accent); margin: var(--space-3) 0 var(--space-5); text-wrap: balance; }
.lead { margin: 0 auto var(--space-7); max-width: 52ch; }

.features { max-width: 920px; margin: 0 auto; padding: 0 var(--space-5) var(--space-9); display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--space-6); }
.feature { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: var(--space-6); }
.feature h3 { font-family: var(--font-serif); font-size: var(--step-2); font-weight: 600; font-variation-settings: 'opsz' 36; letter-spacing: -0.014em; color: var(--text); margin: 0 0 var(--space-3); }
.feature p { font-size: var(--step--1); color: var(--text-muted); line-height: 1.6; margin: 0; }

.btn { display: inline-flex; align-items: center; justify-content: center; padding: var(--space-3) var(--space-5); font-family: var(--font-sans); font-size: var(--step-0); font-weight: 600; border-radius: var(--radius-md); cursor: pointer; transition: background var(--dur-2) var(--ease-out-expo), border-color var(--dur-2) var(--ease-out-expo), transform var(--dur-2) var(--ease-out-expo); border: 1px solid transparent; }
.btn.primary { color: white; background: var(--accent); padding: var(--space-4) var(--space-6); }
.btn.primary:hover { background: var(--accent-hover); transform: translateY(-1px); }
.btn.ghost { color: var(--text); background: transparent; border-color: var(--border-strong); font-size: var(--step--1); padding: var(--space-2) var(--space-4); }
.btn.ghost:hover { background: var(--bg-elevated); }

.footer { margin-top: auto; padding: var(--space-5) var(--space-5) var(--space-6); display: flex; justify-content: center; align-items: center; gap: var(--space-3); font-size: var(--step--1); color: var(--text-muted); border-top: 1px solid var(--border); }
.footer a { color: var(--text-muted); text-decoration: none; }
.footer a:hover { color: var(--accent); }
.sep { opacity: 0.5; }
</style>
