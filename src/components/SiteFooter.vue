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

  const maxW = pre.clientWidth
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
    scheduleResizeLenis()
    if (open) scrollToLegalPanel()
  })
})

onMounted(() => {
  nextTick(() => {
    measureRuleChars()
    if (typeof ResizeObserver !== 'undefined' && footerInnerRef.value) {
      footerResizeObserver = new ResizeObserver(() => measureRuleChars())
      footerResizeObserver.observe(footerInnerRef.value)
    }
  })
  window.addEventListener('resize', measureRuleChars, { passive: true })
})

onBeforeUnmount(() => {
  footerResizeObserver?.disconnect()
  footerResizeObserver = null
  window.removeEventListener('resize', measureRuleChars)
})
</script>

<template>
  <footer
    class="site-footer-root"
    :class="{ 'site-footer-root--compact-top': compactTop }"
    aria-label="Seitenfuß"
  >
    <div ref="footerInnerRef" class="site-footer-inner w-full px-[9%]">
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
</style>
