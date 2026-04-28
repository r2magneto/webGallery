import cors from 'cors'
import express from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// server.js liegt im Projektstamm → ROOT = Projektstamm
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = __dirname
/** Einheitlich mit statischem Build: Layout-JSON liegt unter public/ */
const DATA_DIR = path.resolve(ROOT, 'public')
const IMAGES_DIR = path.resolve(ROOT, 'public', 'images')

/** Nur diese Dateinamen unter public/ sind erlaubt (Path-Traversal vermeiden). */
const ALLOWED_LAYOUT_FILES = new Set(['layout.json', 'layout2.json'])

/**
 * Scan-Ziel für GET /scan-images?config=… — Sync mit src/config/galleryPaths.js
 * (Unterordner direkt unter public/images/).
 */
const SCAN_SUBDIR_BY_LAYOUT = {
  'layout.json': 'gallery1',
  'layout2.json': 'gallery2',
}

const app = express()
const PORT = Number(process.env.PORT) || 3000

app.use(cors())
app.use(express.json({ limit: '2mb' }))

/**
 * Liefert absoluten Pfad zu public/<layout.json|layout2.json>.
 * Schreibt/liest nur JSON — Bilder liegen getrennt unter public/images/gallery1|2/.
 */
function resolveLayoutPath(configQuery) {
  const raw =
    typeof configQuery === 'string' && configQuery.trim()
      ? configQuery.trim()
      : 'layout.json'
  const base = path.basename(raw)
  if (!ALLOWED_LAYOUT_FILES.has(base)) {
    throw new Error(`Ungültige Layout-Datei: ${base}`)
  }
  return path.join(DATA_DIR, base)
}

function layoutConfigFromBody(config) {
  const raw =
    typeof config === 'string' && config.trim() ? config.trim() : 'layout.json'
  return path.basename(raw)
}

async function readLayoutJson(config) {
  const filePath = resolveLayoutPath(config)
  const raw = await fs.readFile(filePath, 'utf8')
  const data = JSON.parse(raw)
  if (!Array.isArray(data.items)) {
    throw new Error(`${path.basename(filePath)}: items fehlt oder ist kein Array.`)
  }
  return data
}

app.get('/get-layout', async (req, res) => {
  try {
    const config = req.query.config
    const data = await readLayoutJson(config)
    res.json(data)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Layout konnte nicht gelesen werden.' })
  }
})

app.post('/save-layout', async (req, res) => {
  try {
    const body = req.body
    const items = Array.isArray(body) ? body : body?.items
    if (!Array.isArray(items)) {
      res
        .status(400)
        .json({ error: 'Erwartet ein Layout-Array oder { items: [...] }.' })
      return
    }
    /** z. B. layout.json → layout2.json steuert die Zieldatei unter public/ */
    const configKey = layoutConfigFromBody(body?.config)
    const filePath = resolveLayoutPath(configKey)
    const payload = { items }
    await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    res.json({ ok: true, savedConfig: configKey })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Layout konnte nicht geschrieben werden.' })
  }
})

app.get('/scan-images', async (req, res) => {
  try {
    const configRaw =
      typeof req.query.config === 'string' ? req.query.config.trim() : 'layout.json'
    const configBase = path.basename(configRaw)
    const sub = SCAN_SUBDIR_BY_LAYOUT[configBase] || SCAN_SUBDIR_BY_LAYOUT['layout.json']
    const scanDir = path.join(IMAGES_DIR, sub)
    let names
    try {
      names = await fs.readdir(scanDir)
    } catch {
      await fs.mkdir(scanDir, { recursive: true })
      names = []
    }
    const files = []
    for (const name of names) {
      if (name.startsWith('.')) continue
      if (name.toLowerCase() === 'manifest.json') continue
      if (!name.toLowerCase().endsWith('.webp')) continue
      const full = path.join(scanDir, name)
      const st = await fs.stat(full)
      if (st.isFile()) files.push(name)
    }
    files.sort()
    res.json({ filenames: files, gallerySubdir: sub })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Bilder-Ordner konnte nicht gelesen werden.' })
  }
})

app.listen(PORT, () => {
  console.log(`API http://localhost:${PORT}`)
})
