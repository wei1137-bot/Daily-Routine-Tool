const fs = require('node:fs')
const path = require('node:path')
const { createCanvas, loadImage } = require('@napi-rs/canvas')

const projectRoot = path.resolve(__dirname, '..')
const sourcePath = path.join(projectRoot, 'public', 'logo.png')
const outputPath = path.join(projectRoot, 'build', 'icon.icns')

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
  console.log(`Wrote ${outputPath}`)
}

generateIcon().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
