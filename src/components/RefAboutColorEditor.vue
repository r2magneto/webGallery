<script setup>
import Utf8AnsColorEditor from './Utf8AnsColorEditor.vue'
import {
  downloadRefAboutColorConfig,
  importRefAboutColorConfig,
  loadRefAboutColorConfig,
  loadProjectRefAboutColorConfig,
  saveRefAboutColorConfig,
} from '../utils/refAboutColorConfig.js'
</script>

<template>
  <Utf8AnsColorEditor
    title="References / About — Farb-Editor"
    ansi-file-name="ref-about_01_BW.utf8ans"
    :load-config="loadRefAboutColorConfig"
    :save-config="saveRefAboutColorConfig"
    :load-project-config="loadProjectRefAboutColorConfig"
    :import-config="importRefAboutColorConfig"
    :download-config="downloadRefAboutColorConfig"
    project-missing-message="Keine projectweite ref-about-colors.json gefunden."
  />
</template>
