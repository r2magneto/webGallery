<script setup>
import { useId } from 'vue'

/**
 * Retro-Terminal-Header (Vorlage: kein Vollbild-PNG — SVG + CSS).
 * Liegt im normalen Dokumentfluss → scrollt mit der Seite nach oben weg.
 */
const phosphorFilterId = `site-header-phosphor-${useId().replace(/:/g, '')}`

const props = defineProps({
  galleryTab: { type: String, required: true },
  isEditMode: { type: Boolean, required: true },
})

const emit = defineEmits(['select-gallery', 'enter-editor', 'exit-editor'])

function isActiveNav(tabKey) {
  return !props.isEditMode && props.galleryTab === tabKey
}
</script>

<template>
  <header class="site-header" aria-label="Seitenkopf">
    <div class="site-header__scanlines" aria-hidden="true" />

    <div class="site-header__inner">
      <div class="site-header__logo-wrap">
        <svg
          class="site-header__logo-svg"
          viewBox="0 0 440 88"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="HUMANOID capture studio"
        >
          <defs>
            <filter
              :id="phosphorFilterId"
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              <feGaussianBlur stdDeviation="0.8" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect
            x="2"
            y="2"
            width="436"
            height="84"
            fill="none"
            stroke="#c4c4cc"
            stroke-width="1"
          />
          <rect
            x="6"
            y="6"
            width="428"
            height="76"
            fill="none"
            stroke="#a1a1aa"
            stroke-width="1"
            stroke-dasharray="48 10 120 10 200 10"
          />
          <text
            x="220"
            y="48"
            text-anchor="middle"
            fill="#f59e0b"
            font-family="IBM Plex Mono, ui-monospace, monospace"
            font-size="34"
            font-weight="700"
            letter-spacing="0.12em"
            :filter="`url(#${phosphorFilterId})`"
          >
            HUMANOID
          </text>
          <text
            x="220"
            y="74"
            text-anchor="middle"
            fill="#f59e0b"
            font-family="IBM Plex Mono, ui-monospace, monospace"
            font-size="11"
            font-weight="500"
            letter-spacing="0.28em"
            opacity="0.92"
          >
            capture studio
          </text>
        </svg>
      </div>

      <p class="site-header__attention">
        <span class="site-header__attention-line"
          >ATTENTION: WE ARE WORKING ON PERSONAL PROJECTS</span
        >
        <span class="site-header__attention-line"
          >CAPTURE AND ANIMATION SERVICE IS NOT AVAILABLE ATM</span
        >
      </p>

      <div class="site-header__row">
        <nav class="site-header__nav" aria-label="Hauptnavigation">
          <button
            type="button"
            class="site-header__nav-btn"
            :class="
              isActiveNav('g1')
                ? 'site-header__nav-btn--active'
                : 'site-header__nav-btn--idle'
            "
            @click="emit('select-gallery', 'g1')"
          >
            motioncapture
          </button>
          <button
            type="button"
            class="site-header__nav-btn"
            :class="
              isActiveNav('g2')
                ? 'site-header__nav-btn--active'
                : 'site-header__nav-btn--idle'
            "
            @click="emit('select-gallery', 'g2')"
          >
            360 video capture
          </button>
          <button
            type="button"
            class="site-header__nav-btn"
            :class="
              isActiveNav('list')
                ? 'site-header__nav-btn--active'
                : 'site-header__nav-btn--idle'
            "
            @click="emit('select-gallery', 'list')"
          >
            about / references
          </button>
        </nav>

        <nav class="site-header__tools" aria-label="Editor">
          <button
            type="button"
            class="site-header__tool-btn"
            :class="!isEditMode ? 'site-header__tool-btn--on' : ''"
            @click="emit('exit-editor')"
          >
            Vorschau
          </button>
          <span class="site-header__tool-sep" aria-hidden="true">|</span>
          <button
            type="button"
            class="site-header__tool-btn"
            :class="isEditMode ? 'site-header__tool-btn--on' : ''"
            @click="!isEditMode && emit('enter-editor')"
          >
            Editor
          </button>
        </nav>
      </div>
    </div>
  </header>
</template>

<style scoped>
.site-header {
  position: relative;
  z-index: 30;
  background: transparent;
  pointer-events: none;
}

.site-header__inner {
  pointer-events: auto;
  max-width: 56rem;
  margin: 0 auto;
  padding: 2.25rem 1.25rem 2rem;
  text-align: center;
  position: relative;
  z-index: 2;
}

.site-header__scanlines {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    0deg,
    rgb(0 0 0 / 0) 0px,
    rgb(0 0 0 / 0) 2px,
    rgb(0 0 0 / 0.12) 2px,
    rgb(0 0 0 / 0.12) 3px
  );
  opacity: 0.35;
  z-index: 1;
}

.site-header__logo-wrap {
  position: relative;
  display: flex;
  justify-content: center;
  margin-bottom: 1.75rem;
}

.site-header__logo-wrap::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 0;
  transform: translateX(-50%);
  width: min(100%, 36rem);
  height: 12rem;
  opacity: 0.06;
  background-image:
    linear-gradient(90deg, #fff 1px, transparent 1px),
    linear-gradient(0deg, #fff 1px, transparent 1px);
  background-size: 24px 24px;
  pointer-events: none;
  z-index: -1;
}

.site-header__logo-svg {
  width: min(100%, 28rem);
  height: auto;
  display: block;
  filter: drop-shadow(0 0 12px rgb(245 158 11 / 0.25));
}

.site-header__attention {
  margin: 0 0 2rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-family: IBM Plex Mono, ui-monospace, monospace;
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  line-height: 1.45;
  color: #f59e0b;
  text-transform: uppercase;
  text-shadow:
    0 0 8px rgb(245 158 11 / 0.35),
    0 0 1px rgb(245 158 11 / 0.8);
}

@media (min-width: 640px) {
  .site-header__attention {
    font-size: 0.7rem;
  }
}

.site-header__row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
}

@media (min-width: 768px) {
  .site-header__row {
    flex-direction: row;
    justify-content: center;
    align-items: flex-start;
    gap: 2rem;
  }
}

.site-header__nav {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.65rem 0.75rem;
}

.site-header__nav-btn {
  font-family: IBM Plex Mono, ui-monospace, monospace;
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  text-transform: lowercase;
  padding: 0.55rem 1rem 0.5rem;
  min-width: 8.5rem;
  cursor: pointer;
  background: transparent;
  transition:
    color 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.site-header__nav-btn--idle {
  color: #71717a;
  border: 1px solid #52525b;
  box-shadow: none;
}

.site-header__nav-btn--idle:hover {
  color: #a1a1aa;
  border-color: #71717a;
}

.site-header__nav-btn--active {
  color: #f59e0b;
  border: 1px solid #e4e4e7;
  box-shadow:
    inset 0 0 0 1px #f59e0b,
    0 0 14px rgb(245 158 11 / 0.2);
  text-shadow: 0 0 10px rgb(245 158 11 / 0.45);
}

.site-header__tools {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: IBM Plex Mono, ui-monospace, monospace;
  font-size: 0.65rem;
}

.site-header__tool-btn {
  padding: 0.25rem 0.5rem;
  color: #71717a;
  background: transparent;
  border: none;
  cursor: pointer;
  letter-spacing: 0.08em;
}

.site-header__tool-btn:hover {
  color: #a1a1aa;
}

.site-header__tool-btn--on {
  color: #f59e0b;
  text-shadow: 0 0 8px rgb(245 158 11 / 0.35);
}

.site-header__tool-sep {
  color: #3f3f46;
  user-select: none;
}
</style>
