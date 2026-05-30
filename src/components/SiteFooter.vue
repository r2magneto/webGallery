<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { scheduleResizeLenis, scrollWindowToBottom } from '../lenisClient.js'

const { compactTop } = defineProps({
  /** Weniger Abstand oberhalb der Trennlinie (z. B. References/About). */
  compactTop: { type: Boolean, default: false },
})

const isLegalOpen = ref(false)
const footerInnerRef = ref(null)
const ruleCharCount = ref(72)

const emailUser = 'malte'
const emailDomain = 'humanoid-animations.de'

const phonePrefix = '+49 (0)177'
const phoneSuffix = '4080863'
const emailAtChar = String.fromCharCode(64)

const IMPRESSUM_INNER_W = 72

const boxTop = `┌${'─'.repeat(IMPRESSUM_INNER_W + 2)}┐`
const boxSep = `├${'─'.repeat(IMPRESSUM_INNER_W + 2)}┤`
const boxBottom = `└${'─'.repeat(IMPRESSUM_INNER_W + 2)}┘`

function boxLine(text) {
  const clipped =
    text.length > IMPRESSUM_INNER_W ? text.slice(0, IMPRESSUM_INNER_W) : text
  return `│  ${clipped.padEnd(IMPRESSUM_INNER_W)}│`
}

/** Gleiche Zeilenform wie boxLine('Contact / Kontakt:') — │␠␠ + padEnd(72) + │ */
function contactBoxLine(label, parts) {
  let text = label
  for (const p of parts) text += p
  return boxLine(text)
}

const phoneBoxLine = computed(() =>
  contactBoxLine('Phone: ', [phonePrefix, ' ', phoneSuffix]),
)

const emailBoxLine = computed(() =>
  contactBoxLine('Email: ', [emailUser, emailAtChar, emailDomain]),
)

const ruleLine = computed(() => '═'.repeat(ruleCharCount.value))

let footerResizeObserver = null

function measureRuleChars() {
  const el = footerInnerRef.value
  const pre = el?.querySelector('.site-footer-pre--rule')
  if (!(el instanceof HTMLElement) || !(pre instanceof HTMLElement)) return

  const maxW = el.clientWidth
  if (maxW <= 0) return

  const cs = getComputedStyle(pre)
  const probe = document.createElement('span')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText =
    'position:absolute;visibility:hidden;white-space:pre;pointer-events:none;'
  probe.style.fontFamily = cs.fontFamily
  probe.style.fontSize = cs.fontSize
  probe.style.letterSpacing = cs.letterSpacing
  el.appendChild(probe)

  let n = Math.min(200, Math.ceil(maxW / 6))
  while (n > 0) {
    probe.textContent = '═'.repeat(n)
    if (probe.getBoundingClientRect().width <= maxW) break
    n -= 1
  }

  el.removeChild(probe)
  ruleCharCount.value = Math.max(24, n)
}

const LEGAL_MOBILE_MEDIA = '(max-width: 767px)'
/** Ab hier: ASCII-Box per vw-Schrift statt JS-transform (kein Abschneiden 410–390px). */
const LEGAL_NARROW_MEDIA = '(max-width: 410px)'

/**
 * Impressum-Full-Bleed auf Mobil — exakt die bewährte Logik der About-Seite
 * (siehe GalleryListView: `syncRefAboutCanvasLayout`): Die fest 76 Zeichen breite
 * Box wird absolut positioniert und per `transform: scale()` auf die verfügbare
 * Breite skaliert, statt seitlich abgeschnitten zu werden. Die Canvas-Box bekommt
 * die skalierten Maße, damit kein Layout-Overflow/Leerraum entsteht.
 */
function syncLegalFit() {
  const root = footerInnerRef.value
  const canvas = root?.querySelector('.legal-fit-canvas')
  const box = canvas?.querySelector('.legal-box')
  if (!(canvas instanceof HTMLElement) || !(box instanceof HTMLElement)) return

  const mobile = window.matchMedia(LEGAL_MOBILE_MEDIA).matches
  const narrow = window.matchMedia(LEGAL_NARROW_MEDIA).matches
  if (!mobile || !isLegalOpen.value || narrow) {
    box.style.position = ''
    box.style.top = ''
    canvas.style.setProperty('--legal-scale', '1')
    canvas.style.width = ''
    canvas.style.height = ''
    canvas.style.maxWidth = ''
    canvas.style.marginLeft = ''
    canvas.style.marginRight = ''
    return
  }

  // 1) Unskaliert messen. Canvas-Maße ZURÜCKSETZEN, sonst misst clientWidth die
  //    zuvor gesetzte (geschrumpfte) Breite → würde bei jedem Aufruf weiter
  //    schrumpfen. Verfügbare Breite vom stabilen Eltern-Panel nehmen (wie About
  //    die Wrap-Breite nutzt).
  box.style.position = 'static'
  box.style.top = ''
  canvas.style.width = ''
  canvas.style.height = ''
  canvas.style.maxWidth = ''
  canvas.style.setProperty('--legal-scale', '1')
  void box.offsetWidth

  const containerW =
    root instanceof HTMLElement ? root.clientWidth : canvas.clientWidth
  // 2px Atemraum gegen Subpixel-Abschnitt am Rand.
  const fitWidth = Math.max(1, containerW - 2)
  const natW = Math.max(
    box.scrollWidth,
    box.offsetWidth,
    box.getBoundingClientRect().width,
  )
  const natH = box.offsetHeight
  if (natW <= 0) return

  // 2) Scale so wählen, dass die Box exakt in die verfügbare Breite passt
  //    (kleiner Sicherheitsfaktor gegen Subpixel-Überlauf) — wie About.
  const scale = Math.min(1, (fitWidth / natW) * 0.995)
  canvas.style.setProperty('--legal-scale', String(scale))
  void box.offsetWidth

  // 3) Canvas = skalierte Maße, mittig — die Box wird per CSS (translateX(-50%))
  //    in der Canvas zentriert und über --legal-scale skaliert.
  const scaledW = Math.ceil(box.getBoundingClientRect().width)
  const scaledH = Math.max(1, Math.ceil(natH * scale))
  box.style.position = 'absolute'
  box.style.top = '0'
  canvas.style.width = `${scaledW}px`
  canvas.style.height = `${scaledH}px`
  canvas.style.maxWidth = '100%'
  canvas.style.marginLeft = 'auto'
  canvas.style.marginRight = 'auto'
  measureRuleChars()
  scheduleResizeLenis()
}

function toggleLegal() {
  isLegalOpen.value = !isLegalOpen.value
}

/** mailto nur beim Klick zusammensetzen — kein vollständiger String im Markup */
function onEmailClick() {
  const at = String.fromCharCode(64)
  window.location.href = `mailto:${emailUser}${at}${emailDomain}`
}

function onPhoneClick() {
  window.location.href = `tel:+49${'177'}${phoneSuffix}`
}

function scrollToLegalPanel() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollWindowToBottom()
    })
  })
}

watch(isLegalOpen, (open) => {
  nextTick(() => {
    syncLegalFit()
    scheduleResizeLenis()
    if (open) scrollToLegalPanel()
  })
})

function onFooterResize() {
  measureRuleChars()
  syncLegalFit()
}

onMounted(() => {
  nextTick(() => {
    measureRuleChars()
    syncLegalFit()
    // Schrift erst nach dem Laden korrekt vermessen → erneut einpassen.
    document.fonts?.ready?.then(() => {
      measureRuleChars()
      syncLegalFit()
    })
    if (typeof ResizeObserver !== 'undefined' && footerInnerRef.value) {
      footerResizeObserver = new ResizeObserver(() => onFooterResize())
      footerResizeObserver.observe(footerInnerRef.value)
    }
  })
  window.addEventListener('resize', onFooterResize, { passive: true })
})

onBeforeUnmount(() => {
  footerResizeObserver?.disconnect()
  footerResizeObserver = null
  window.removeEventListener('resize', onFooterResize)
})
</script>

<template>
  <footer
    class="site-footer-root"
    :class="{ 'site-footer-root--compact-top': compactTop }"
    aria-label="Seitenfuß"
  >
    <div ref="footerInnerRef" class="site-footer-inner w-full">
      <div class="site-footer-stack">
        <pre class="site-footer-pre site-footer-pre--rule" aria-hidden="true">{{ ruleLine }}</pre>

        <div class="site-footer-bar">
          <p class="site-footer-tagline">
            We do not track you and don't offer you cookies (or free candy)
          </p>
          <button
            type="button"
            class="footer-legal-btn"
            :aria-expanded="isLegalOpen"
            aria-controls="site-footer-legal-panel"
            @click="toggleLegal"
          >
            [ LEGAL NOTICE / IMPRESSUM ]
          </button>
        </div>

        <div
          v-show="isLegalOpen"
          id="site-footer-legal-panel"
          class="site-footer-legal"
          role="region"
          aria-label="Legal notice and privacy policy"
        >
          <div class="legal-fit-canvas">
        <div class="legal-box site-footer-pre site-footer-pre--legal">
          <div class="legal-box-line">{{ boxTop }}</div>
          <div class="legal-box-line">{{ boxLine('LEGAL NOTICE / IMPRESSUM') }}</div>
          <div class="legal-box-line">{{ boxSep }}</div>
          <div class="legal-box-line">
            {{ boxLine('Information pursuant to § 5 TMG / Angabe gemäß § 5 TMG:') }}
          </div>
          <div class="legal-box-line">{{ boxLine('') }}</div>
          <div class="legal-box-line">{{ boxLine('HUMANOID Capture Studio') }}</div>
          <div class="legal-box-line">{{ boxLine('Malte Maas') }}</div>
          <div class="legal-box-line">
            {{ boxLine('Schwelmerstr. 8 / 40235 Düsseldorf / Germany') }}
          </div>
          <div class="legal-box-line">{{ boxLine('') }}</div>
          <div class="legal-box-line">{{ boxLine('Contact / Kontakt:') }}</div>
          <div class="legal-box-line"><button type="button" class="legal-contact-link" @click="onPhoneClick">{{ phoneBoxLine }}</button></div>
          <div class="legal-box-line"><button type="button" class="legal-contact-link" @click="onEmailClick">{{ emailBoxLine }}</button></div>
          <div class="legal-box-line">
            {{ boxLine('VAT ID / Umsatzsteuer-Id# (§ 27a UStG): DE271050214') }}
          </div>
          <div class="legal-box-line">{{ boxLine('') }}</div>
          <div class="legal-box-line">{{ boxSep }}</div>
          <div class="legal-box-line">{{ boxLine('PRIVACY POLICY / DATENSCHUTZERKLÄRUNG') }}</div>
          <div class="legal-box-line">{{ boxSep }}</div>
          <div class="legal-box-line">{{ boxLine('1. No Tracking & No Cookies') }}</div>
          <div class="legal-box-line">
            {{ boxLine('This website does not use any tracking cookies, analytical scripts,') }}
          </div>
          <div class="legal-box-line">
            {{ boxLine('or third-party advertisement networks. We respect your privacy.') }}
          </div>
          <div class="legal-box-line">{{ boxLine('') }}</div>
          <div class="legal-box-line">
            {{ boxLine('2. LocalStorage: Local storage is used strictly on your machine to') }}
          </div>
          <div class="legal-box-line">
            {{ boxLine('save your custom header color choices. No data is transmitted.') }}
          </div>
          <div class="legal-box-line">{{ boxLine('') }}</div>
          <div class="legal-box-line">
            {{ boxLine('3. Server Logs: Hosted in Germany by ALL-INKL.COM. Technical server') }}
          </div>
          <div class="legal-box-line">
            {{
              boxLine(
                'logs (anonymized IPs, timestamp, browser) are automatically processed',
              )
            }}
          </div>
          <div class="legal-box-line">
            {{
              boxLine(
                'for security purposes based on legitimate interests (Art. 6/1/f GDPR).',
              )
            }}
          </div>
          <div class="legal-box-line">{{ boxBottom }}</div>
        </div>
        </div>
        </div>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.site-footer-root {
  position: relative;
  z-index: 20;
  width: 100%;
  padding: clamp(25px, 4.5vw, 50px) 0 clamp(29px, 5.4vw, 65px);
  background: transparent;
}

.site-footer-root--compact-top {
  padding-top: clamp(4px, 0.68vw, 9px);
}

.site-footer-inner {
  max-width: 100%;
  margin: 0 auto;
  overflow-x: hidden;
  /* Seitliche Einrückung (Desktop). Auf Mobil wird sie reduziert → volle Breite. */
  padding-left: 9%;
  padding-right: 9%;
}

.site-footer-stack {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.site-footer-pre {
  margin: 0 0 clamp(9px, 1.44vw, 14px);
  white-space: pre;
  max-width: 100%;
  box-sizing: border-box;
  font-family: 'Web437 IBM VGA 9x16', 'Web437 IBM VGA 8x14 2x',
    'Web437 IBM VGA 8x14', ui-monospace, monospace;
  font-size: clamp(10px, 1.5vw, 20px);
  line-height: 0.99;
  letter-spacing: -0.5px;
  color: #6b7280;
  text-shadow: none;
  background: transparent;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: subpixel-antialiased;
}

.site-footer-pre--rule {
  overflow-x: hidden;
  color: #facc15;
  text-shadow:
    0 0 10px rgb(250 204 21 / 0.14),
    0 0 1px rgb(250 204 21 / 0.35);
}

.legal-box {
  margin-top: clamp(11px, 1.8vw, 18px);
  color: #9ca3af;
}

.site-footer-pre--legal {
  overflow-x: auto;
}

.legal-box-line {
  display: block;
  white-space: pre;
  margin: 0;
}

.legal-contact-link {
  display: block;
  width: 100%;
  text-align: left;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  font: inherit;
  font-family: inherit;
  color: inherit;
  letter-spacing: inherit;
  line-height: inherit;
  cursor: pointer;
  text-decoration: none;
  vertical-align: baseline;
  -webkit-appearance: none;
  appearance: none;
}

.legal-contact-link:hover,
.legal-contact-link:focus-visible {
  color: #facc15;
  text-shadow:
    0 0 10px rgb(250 204 21 / 0.2),
    0 0 1px rgb(250 204 21 / 0.6);
}

.legal-contact-link:focus-visible {
  outline: 1px solid rgb(250 204 21 / 0.75);
  outline-offset: 1px;
}

.legal-at {
  display: inline;
}

.site-footer-bar {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: clamp(7px, 1.08vw, 11px);
  font-family: 'Web437 IBM VGA 9x16', 'Web437 IBM VGA 8x14 2x',
    'Web437 IBM VGA 8x14', ui-monospace, monospace;
  font-size: clamp(10px, 1.5vw, 20px);
  line-height: 1.08;
  letter-spacing: -0.5px;
}

.site-footer-tagline {
  margin: 0;
  color: #6b7280;
}

.footer-legal-btn {
  align-self: flex-start;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  font: inherit;
  color: #6b7280;
  cursor: pointer;
  transition:
    color 0.15s ease,
    text-shadow 0.15s ease,
    filter 0.15s ease;
}

.footer-legal-btn:hover,
.footer-legal-btn:focus-visible {
  color: #facc15;
  text-shadow:
    0 0 12px rgb(250 204 21 / 0.28),
    0 0 1px rgb(250 204 21 / 0.75);
}

.footer-legal-btn:focus-visible {
  outline: 2px solid rgb(250 204 21 / 0.85);
  outline-offset: 2px;
}

.footer-legal-btn[aria-expanded='true'] {
  color: #facc15;
}

.site-footer-legal {
  width: 100%;
  overflow-x: auto;
}

/* Canvas = sichtbare, skalierte Box (analog .ref-about-canvas der About-Seite). */
.legal-fit-canvas {
  max-width: 100%;
}

/*
 * Mobil (Portrait/Smartphone): volle Bildschirmbreite nutzen — exakt wie die
 * About-Seite. Seitenpadding auf clamp(8px,1.6vw,14px) reduzieren (statt 9%),
 * und die feste 76-Zeichen-Impressum-Box per transform:scale einpassen, statt
 * sie abzuschneiden. Maße/Scale setzt JS (syncLegalFit) ⇢ kein Layout-Overflow.
 */
@media (max-width: 767px) {
  .site-footer-inner {
    width: 100%;
    box-sizing: border-box;
    padding-left: clamp(8px, 1.6vw, 14px);
    padding-right: clamp(8px, 1.6vw, 14px);
    overflow-x: hidden;
  }

  .site-footer-stack {
    width: 100%;
    max-width: 100%;
  }

  .site-footer-pre--rule {
    display: block;
    width: min(100%, 100%);
    min-width: min(200px, 100%);
    max-width: 100%;
    margin: 0 auto 1rem;
    text-align: center;
    white-space: pre;
    overflow-x: auto;
  }

  .site-footer-bar {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    max-width: 100%;
    text-align: center;
  }

  .site-footer-tagline {
    margin: 0;
    white-space: nowrap;
    text-align: center;
  }

  .footer-legal-btn {
    align-self: center;
    margin: 0;
    white-space: nowrap;
  }

  .site-footer-legal {
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
  }

  .legal-fit-canvas {
    position: relative;
    display: block;
    width: auto;
    max-width: 100%;
    overflow: hidden;
    margin: clamp(11px, 1.8vw, 18px) auto 0;
  }

  .site-footer-pre--legal {
    position: absolute;
    top: 0;
    left: 50%;
    display: block;
    width: max-content;
    max-width: none;
    margin: 0;
    transform: translateX(-50%) scale(var(--legal-scale, 1));
    transform-origin: top center;
  }
}

/*
 * Schmale Screens: ~76 Zeichen — linear mit Viewport (410px ≈ 12px wie Desktop-Basis).
 * Kein JS-scale, damit zwischen 410px und 390px nichts abgeschnitten wird.
 */
@media (max-width: 410px) {
  .legal-fit-canvas {
    width: 100% !important;
    height: auto !important;
    max-width: 100%;
    margin-left: auto;
    margin-right: auto;
  }

  .site-footer-pre--legal {
    position: static;
    left: auto;
    display: block;
    width: max-content;
    max-width: 100%;
    margin: 0 auto;
    transform: none;
    font-size: 2.93vw;
  }
}
</style>
