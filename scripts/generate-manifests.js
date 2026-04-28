import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PUBLIC_DIR = path.join(ROOT, 'public')
const IMAGES_DIR = path.join(PUBLIC_DIR, 'images')

const GALLERIES = [
  { subdir: 'gallery1', manifestName: 'manifest.json' },
  { subdir: 'gallery2', manifestName: 'manifest.json' },
]

function isSkippable(name) {
  if (!name) return true
  if (name.startsWith('.')) return true
  if (name.toLowerCase() === 'manifest.json') return true
  if (!name.toLowerCase().endsWith('.webp')) return true
  return false
}

async function listFiles(dir) {
  let entries
  try {
    entries = await fs.readdir(dir)
  } catch {
    await fs.mkdir(dir, { recursive: true })
    entries = []
  }

  const files = []
  for (const name of entries) {
    if (isSkippable(name)) continue
    const full = path.join(dir, name)
    let st
    try {
      st = await fs.stat(full)
    } catch {
      continue
    }
    if (st.isFile()) files.push(name)
  }
  files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  return files
}

async function writeManifest(dir, filenames, manifestName) {
  const outPath = path.join(dir, manifestName)
  const payload = { filenames }
  await fs.writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

async function main() {
  for (const g of GALLERIES) {
    const dir = path.join(IMAGES_DIR, g.subdir)
    const filenames = await listFiles(dir)
    await writeManifest(dir, filenames, g.manifestName)
    console.log(`[manifest] ${g.subdir}: ${filenames.length} file(s)`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

