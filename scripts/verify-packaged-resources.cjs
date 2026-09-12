const fs = require('node:fs')
const path = require('node:path')
const appBuilderDirectory = path.dirname(require.resolve('app-builder-lib/package.json'))
const asar = require(require.resolve('@electron/asar', { paths: [appBuilderDirectory] }))
const architectureNames = ['ia32', 'x64', 'armv7l', 'arm64', 'universal']

function requireFile(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`Packaged ${label} is missing: ${filePath}`)
  }
}

function applicationResources(context) {
  if (context.electronPlatformName !== 'darwin') return path.join(context.appOutDir, 'resources')
  const appName = `${context.packager.appInfo.productFilename}.app`
  return path.join(context.appOutDir, appName, 'Contents', 'Resources')
}

module.exports = async function verifyPackagedResources(context) {
  const resources = applicationResources(context)
  const archive = path.join(resources, 'app.asar')
  requireFile(archive, 'application archive')
  requireFile(path.join(resources, 'app-icon.png'), 'runtime icon')
  requireFile(path.join(resources, 'tessdata', 'eng.traineddata.gz'), 'Tesseract English language data')

  if (context.electronPlatformName === 'darwin') requireFile(path.join(resources, 'icon.icns'), 'macOS application icon')
  if (context.electronPlatformName === 'win32') requireFile(path.join(resources, 'icon.ico'), 'Windows application icon')

  const entries = new Set(asar.listPackage(archive).map((entry) => entry.replace(/^[/\\]/, '').replace(/\\/g, '/')))
  for (const entry of [
    'node_modules/pdf-parse/dist/pdf-parse/cjs/index.cjs',
    'node_modules/pdf-parse/dist/worker/cjs/index.cjs',
    'node_modules/sql.js/dist/sql-wasm.wasm'
  ]) {
    if (!entries.has(entry)) throw new Error(`Packaged application archive is missing ${entry}`)
  }

  const unpacked = `${archive}.unpacked`
  requireFile(path.join(unpacked, 'node_modules', 'tesseract.js', 'src', 'worker-script', 'node', 'index.js'), 'Tesseract worker')
  requireFile(path.join(unpacked, 'node_modules', 'tesseract.js-core', 'tesseract-core.wasm'), 'Tesseract core')

  const canvasRoot = path.join(unpacked, 'node_modules', '@napi-rs')
  const architecture = architectureNames[context.arch]
  const expectedCanvas = context.electronPlatformName === 'darwin'
    ? new RegExp(`^canvas-darwin-${architecture}$`)
    : new RegExp(`^canvas-win32-${architecture}-`)
  const hasNativeCanvas = fs.existsSync(canvasRoot) && fs.readdirSync(canvasRoot).some((directory) => {
    if (!expectedCanvas.test(directory)) return false
    return fs.readdirSync(path.join(canvasRoot, directory)).some((file) => file.endsWith('.node'))
  })
  if (!hasNativeCanvas) throw new Error(`Packaged PDF native canvas binary is missing for ${context.electronPlatformName}-${architecture}`)
}
