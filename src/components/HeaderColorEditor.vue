<script setup>
import Utf8AnsColorEditor from './Utf8AnsColorEditor.vue'
import {
  downloadHeaderColorConfig,
  importHeaderColorConfig,
  loadHeaderColorConfig,
  loadProjectHeaderColorConfig,
  saveHeaderColorConfig,
} from '../utils/headerColorConfig.js'
</script>

<template>
  <Utf8AnsColorEditor
    title="Header-Farb-Editor"
    ansi-file-name="Header_01_01_BW.utf8ans"
    :load-config="loadHeaderColorConfig"
    :save-config="saveHeaderColorConfig"
    :load-project-config="loadProjectHeaderColorConfig"
    :import-config="importHeaderColorConfig"
    :download-config="downloadHeaderColorConfig"
    project-missing-message="Keine projectweite header-colors.json gefunden."
  />
</template>
