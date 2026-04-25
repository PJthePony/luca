<script setup>
import TopBar from '../components/TopBar.vue';
</script>

<template>
  <TopBar />
  <main class="page">
    <section class="hero">
      <div class="eyebrow">Simulator</div>
      <h1 class="title">Coming soon.</h1>
      <p class="lead">Simulate a meeting request and see what Luca would do — before it touches a real inbox.</p>
    </section>
  </main>
</template>

<style scoped>
.page { max-width: 920px; margin: 0 auto; padding: var(--space-7) var(--space-5) var(--space-9); }
.title { font-family: var(--font-serif); font-style: italic; font-weight: 500; font-variation-settings: 'opsz' 72; letter-spacing: -0.018em; line-height: 1.02; font-size: var(--step-4); color: var(--accent); margin: var(--space-2) 0 var(--space-3); }
</style>
