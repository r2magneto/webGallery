<script setup>
import { ref, reactive } from 'vue'
import SiteHeader from './components/SiteHeader.vue'
import GalleryModule from './components/GalleryModule.vue'
import GalleryEditor from './components/GalleryEditor.vue'
import GalleryListView from './components/GalleryListView.vue'

const CONFIG_G1 = 'layout.json'
const CONFIG_G2 = 'layout2.json'

/** Vorerst fest; später z. B. aus Umgebung oder Server. */
const EDITOR_PASSWORD = 'admin123'

const galleryTab = ref('g1')
const isEditMode = ref(false)

const scrollByConfig = reactive({
  [CONFIG_G1]: 0,
  [CONFIG_G2]: 0,
})

const editorConfigPath = ref(CONFIG_G1)

function onModuleSaveScroll(payload) {
  if (
    payload?.configPath &&
    typeof payload.scrollY === 'number' &&
    (payload.configPath === CONFIG_G1 || payload.configPath === CONFIG_G2)
  ) {
    scrollByConfig[payload.configPath] = payload.scrollY
  }
}

function saveScrollForCurrentGalleryPreview() {
  if (galleryTab.value === 'g1') scrollByConfig[CONFIG_G1] = window.scrollY
  else if (galleryTab.value === 'g2') scrollByConfig[CONFIG_G2] = window.scrollY
}

function onSelectGallery(tab) {
  if (!isEditMode.value) {
    saveScrollForCurrentGalleryPreview()
  }
  isEditMode.value = false
  galleryTab.value = tab
}

function enterEditor() {
  const input = window.prompt('Admin Login')
  if (input == null) return
  if (input !== EDITOR_PASSWORD) return
  if (galleryTab.value === 'g2') editorConfigPath.value = CONFIG_G2
  else editorConfigPath.value = CONFIG_G1
  isEditMode.value = true
}

function exitEditor() {
  isEditMode.value = false
}
</script>

<template>
  <div class="relative min-h-svh bg-neutral-950">
    <SiteHeader
      :gallery-tab="galleryTab"
      :is-edit-mode="isEditMode"
      @select-gallery="onSelectGallery"
      @enter-editor="enterEditor"
      @exit-editor="exitEditor"
    />

    <GalleryEditor v-if="isEditMode" :config-path="editorConfigPath" />

    <template v-else>
      <GalleryListView v-if="galleryTab === 'list'" />

      <GalleryModule
        v-else-if="galleryTab === 'g1'"
        :key="CONFIG_G1"
        :config-path="CONFIG_G1"
        :initial-scroll-y="scrollByConfig[CONFIG_G1] ?? 0"
        @save-scroll="onModuleSaveScroll"
      />

      <GalleryModule
        v-else-if="galleryTab === 'g2'"
        :key="CONFIG_G2"
        :config-path="CONFIG_G2"
        :initial-scroll-y="scrollByConfig[CONFIG_G2] ?? 0"
        @save-scroll="onModuleSaveScroll"
      />
    </template>
  </div>
</template>
