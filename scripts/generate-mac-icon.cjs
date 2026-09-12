const fs = require('node:fs')
const path = require('node:path')
const { createCanvas, loadImage } = require('@napi-rs/canvas')

const projectRoot = path.resolve(__dirname, '..')
const sourcePath = path.join(projectRoot, 'public', 'logo.png')
const outputPath = path.join(projectRoot, 'build', 'icon.icns')
const trayOutputPath = path.join(projectRoot, 'build', 'tray-iconTemplate.png')

function icnsChunk(type, png) {
  const header = Buffer.alloc(8)
  header.write(type, 0, 4, 'ascii')
  header.writeUInt32BE(header.length + png.length, 4)
  return Buffer.concat([header, png])
}

async function generateIcon() {
  const source = await loadImage(sourcePath)
  const chunks = [
    ['icp4', 16],
    ['icp5', 32],
    ['icp6', 64],
    ['ic07', 128],
    ['ic08', 256],
    ['ic09', 512],
    ['ic10', 1024],
    ['ic11', 32],
    ['ic12', 64],
    ['ic13', 256],
    ['ic14', 512]
  ].map(([type, size]) => {
    const canvas = createCanvas(size, size)
    const context = canvas.getContext('2d')
    context.drawImage(source, 0, 0, size, size)
    return icnsChunk(type, canvas.toBuffer('image/png'))
  })

  const header = Buffer.alloc(8)
  header.write('icns', 0, 4, 'ascii')
  header.writeUInt32BE(header.length + chunks.reduce((total, chunk) => total + chunk.length, 0), 4)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, Buffer.concat([header, ...chunks]))

  const sourceCanvas = createCanvas(source.width, source.height)
  const sourceContext = sourceCanvas.getContext('2d')
  sourceContext.drawImage(source, 0, 0)
  const pixels = sourceContext.getImageData(0, 0, source.width, source.height)
  let left = source.width
  let top = source.height
  let right = -1
  let bottom = -1
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const offset = (y * source.width + x) * 4
      const originalAlpha = pixels.data[offset + 3]
      const luminance = pixels.data[offset] * 0.2126 + pixels.data[offset + 1] * 0.7152 + pixels.data[offset + 2] * 0.0722
      // Remove the dark outline before macOS converts alpha into its template
      // color. Keep a smooth antialiased edge around the white/blue inner mark.
      const lightCoverage = Math.max(0, Math.min(1, (luminance - 42) / 86))
      const alpha = Math.round(originalAlpha * lightCoverage)
      pixels.data[offset] = 0
      pixels.data[offset + 1] = 0
      pixels.data[offset + 2] = 0
      pixels.data[offset + 3] = alpha
      if (alpha > 8) {
        left = Math.min(left, x)
        top = Math.min(top, y)
        right = Math.max(right, x)
        bottom = Math.max(bottom, y)
      }
    }
  }
  sourceContext.putImageData(pixels, 0, 0)

  const createTrayRepresentation = (size) => {
    const canvas = createCanvas(size, size)
    const context = canvas.getContext('2d')
    // Keep the 18/36 px template canvases expected by macOS, but leave enough
    // transparent space that the glyph matches neighboring menu-bar items.
    // This does not affect the .icns artwork used by Finder and the Dock.
    const padding = size / 6
    const width = right - left + 1
    const height = bottom - top + 1
    const scale = Math.min((size - padding * 2) / width, (size - padding * 2) / height)
    const targetWidth = width * scale
    const targetHeight = height * scale
    context.drawImage(sourceCanvas, left, top, width, height,
      (size - targetWidth) / 2, (size - targetHeight) / 2, targetWidth, targetHeight)
    return canvas.toBuffer('image/png')
  }

  fs.writeFileSync(trayOutputPath, createTrayRepresentation(18))
  fs.writeFileSync(trayOutputPath.replace('.png', '@2x.png'), createTrayRepresentation(36))
  console.log(`Wrote ${outputPath} and macOS menu-bar template icons`)
}

generateIcon().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
