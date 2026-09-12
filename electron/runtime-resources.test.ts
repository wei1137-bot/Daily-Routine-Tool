import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { assertTesseractLanguageData, runtimeAssetPath, tesseractLanguagePath } from './runtime-resources'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

describe('runtime resource paths', () => {
  const context = { isPackaged: true, resourcesPath: path.resolve('packaged-resources'), appRoot: path.resolve('.') }

  it('resolves packaged assets and OCR data from process.resourcesPath', () => {
    expect(runtimeAssetPath('app-icon.png', context)).toBe(path.join(context.resourcesPath, 'app-icon.png'))
    expect(tesseractLanguagePath(context, 'development-tessdata')).toBe(path.join(context.resourcesPath, 'tessdata'))
  })

  it('fails explicitly instead of attempting a network OCR download when language data is absent', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-routine-tessdata-'))
    temporaryDirectories.push(directory)
    expect(() => assertTesseractLanguageData(directory)).toThrow(/OCR language data is missing/)
    fs.writeFileSync(path.join(directory, 'eng.traineddata.gz'), 'fixture')
    expect(assertTesseractLanguageData(directory)).toBe(path.join(directory, 'eng.traineddata.gz'))
  })

  it('ships a structurally valid macOS ICNS icon generated from the existing artwork', () => {
    const icon = fs.readFileSync(path.resolve('build', 'icon.icns'))
    expect(icon.subarray(0, 4).toString('ascii')).toBe('icns')
    expect(icon.readUInt32BE(4)).toBe(icon.length)
    const chunkTypes: string[] = []
    for (let offset = 8; offset < icon.length;) {
      chunkTypes.push(icon.subarray(offset, offset + 4).toString('ascii'))
      const length = icon.readUInt32BE(offset + 4)
      expect(length).toBeGreaterThan(8)
      expect(icon.subarray(offset + 8, offset + 16).toString('hex')).toBe('89504e470d0a1a0a')
      offset += length
    }
    expect(chunkTypes).toEqual(expect.arrayContaining(['icp4', 'ic07', 'ic10', 'ic14']))
  })
})
