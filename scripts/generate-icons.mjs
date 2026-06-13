import sharp from 'sharp'
import { readFileSync, copyFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const svg = readFileSync(join(root, 'public/icon-source.svg'))

const sizes = [
  { file: 'pwa-512x512.png', size: 512 },
  { file: 'pwa-192x192.png', size: 192 },
  { file: 'apple-touch-icon.png', size: 180 },
]

for (const { file, size } of sizes) {
  await sharp(svg).resize(size, size).png().toFile(join(root, 'public', file))
  console.log(`✓ ${file}`)
}

// favicon.ico (32px PNG — most browsers accept PNG named .ico)
await sharp(svg).resize(32, 32).png().toFile(join(root, 'public/favicon.ico'))
console.log('✓ favicon.ico')

// favicon.svg — same source
copyFileSync(join(root, 'public/icon-source.svg'), join(root, 'public/favicon.svg'))
console.log('✓ favicon.svg')

console.log('\nAll icons generated.')
