<script setup>
import { computed, ref } from 'vue'
import Utf8AnsColorEditor from './Utf8AnsColorEditor.vue'
import {
  assetColorJsonNameFor,
  downloadAssetColorConfig,
  importHeaderColorConfig,
  loadAssetColorConfigFromStorage,
  loadProjectAssetColorConfig,
  saveAssetColorConfig,
} from '../utils/headerColorConfig.js'

const LAYOUT_ASSETS = [
  { file: 'header_01_01_BW.txt', label: 'Header Logo 1' },
  { file: 'header_02_01_BW.txt', label: 'Header Logo 2' },
  { file: 'header_03_01_BW.txt', label: 'Header Logo 3' },
  { file: 'notebox.txt', label: 'Notebox' },
  { file: 'buttontitlebar.txt', label: 'Button-Titel', minLineWidth: 76 },
  { file: 'btn_mocap.txt', label: 'Button: Motion Capture' },
  { file: 'btn_360cap.txt', label: 'Button: 360 Video' },
  { file: 'btn_reference.txt', label: 'Button: References' },
]

const selectedFile = ref(LAYOUT_ASSETS[0].file)

const selectedAsset = computed(
  () => LAYOUT_ASSETS.find((a) => a.file === selectedFile.value) ?? LAYOUT_ASSETS[0],
)

const editorTitle = computed(() => `Header — ${selectedAsset.value.label}`)

const projectMissingMessage = computed(
  () =>
    `Keine ${assetColorJsonNameFor(selectedFile.value)} gefunden (Fallback: header-colors.json).`,
)

function loadConfig() {
  return loadAssetColorConfigFromStorage(selectedFile.value)
}

function saveConfig(cfg) {
  saveAssetColorConfig(selectedFile.value, cfg)
}

function loadProjectConfig() {
  return loadProjectAssetColorConfig(selectedFile.value)
}

function downloadConfig(cfg) {
  downloadAssetColorConfig(selectedFile.value, cfg)
}
</script>

<template>
  <div class="header-layout-editor">
    <nav class="header-layout-editor__tabs" aria-label="Header-Element wählen">
      <button
        v-for="asset in LAYOUT_ASSETS"
        :key="asset.file"
        type="button"
        class="header-layout-editor__tab"
        :class="{ 'header-layout-editor__tab--active': selectedFile === asset.file }"
        @click="selectedFile = asset.file"
      >
        {{ asset.label }}
      </button>
    </nav>

    <Utf8AnsColorEditor
      :key="selectedFile"
      :title="editorTitle"
      :asset-file-name="selectedFile"
      :load-config="loadConfig"
      :save-config="saveConfig"
      :load-project-config="loadProjectConfig"
      :import-config="importHeaderColorConfig"
      :download-config="downloadConfig"
      :project-missing-message="projectMissingMessage"
      :min-line-width="selectedAsset.minLineWidth || 0"
    />
  </div>
</template>

<style scoped>
.header-layout-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.header-layout-editor__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid rgb(255 255 255 / 0.12);
  background: rgb(2 6 23 / 0.65);
  border-radius: 12px;
}

.header-layout-editor__tab {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgb(255 255 255 / 0.14);
  background: rgb(15 23 42 / 0.6);
  color: rgb(148 163 184);
  font-size: 12px;
  cursor: pointer;
}

.header-layout-editor__tab:hover {
  color: rgb(226 232 240);
  border-color: rgb(255 255 255 / 0.22);
}

.header-layout-editor__tab--active {
  color: rgb(250 204 21);
  border-color: rgb(250 204 21 / 0.55);
  background: rgb(30 41 59 / 0.85);
  box-shadow: 0 0 0 1px rgb(250 204 21 / 0.15) inset;
}
</style>
