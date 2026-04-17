<script setup>
import { ref, onMounted } from 'vue'
import { fetchManifestFilenames } from '../apiConfig.js'

const CONFIG_G1 = 'layout.json'
const CONFIG_G2 = 'layout2.json'

const filenames = ref([])
const loadState = ref('loading')
const error = ref('')

onMounted(async () => {
  try {
    const [g1, g2] = await Promise.all([
      fetchManifestFilenames(CONFIG_G1),
      fetchManifestFilenames(CONFIG_G2),
    ])
    filenames.value = [
      ...g1.map((n) => `gallery1/${n}`),
      ...g2.map((n) => `gallery2/${n}`),
    ]
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Laden fehlgeschlagen.'
  } finally {
    loadState.value = 'idle'
  }
})
</script>

<template>
  <div class="min-h-svh bg-neutral-950 px-[10%] pb-24 pt-6 text-zinc-200">
    <h1 class="mb-6 text-lg font-medium text-zinc-100">Liste</h1>
    <p v-if="loadState === 'loading'" class="text-sm text-zinc-500">Lade Dateinamen…</p>
    <p v-else-if="error" class="text-sm text-red-400">{{ error }}</p>
    <ul v-else class="max-w-xl list-inside list-disc space-y-1 text-sm text-zinc-400">
      <li v-for="name in filenames" :key="name">{{ name }}</li>
    </ul>
    <p v-if="loadState === 'idle' && !error && filenames.length === 0" class="text-sm text-zinc-500">
      Keine Einträge in public/images/gallery1/manifest.json und …/gallery2/manifest.json.
    </p>
  </div>
</template>
