import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createCanvas, loadImage } from '@napi-rs/canvas'
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

  it('resolves the macOS template icon from build output in development', () => {
    const development = { ...context, isPackaged: false }
    expect(runtimeAssetPath('tray-iconTemplate.png', development)).toBe(path.join(context.appRoot, 'build', 'tray-iconTemplate.png'))
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

  it('ships correctly sized standard and Retina macOS menu-bar template icons', () => {
    const dimensions = (name: string) => {
      const png = fs.readFileSync(path.resolve('build', name))
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
      return [png.readUInt32BE(16), png.readUInt32BE(20)]
    }
    expect(dimensions('tray-iconTemplate.png')).toEqual([18, 18])
    expect(dimensions('tray-iconTemplate@2x.png')).toEqual([36, 36])
  })

  it('keeps transparent padding around the macOS menu-bar glyph without changing its canvas size', async () => {
    for (const [name, maximumWidth, maximumHeight] of [
      ['tray-iconTemplate.png', 12, 12],
      ['tray-iconTemplate@2x.png', 22, 26]
    ] as const) {
      const icon = await loadImage(path.resolve('build', name))
      const canvas = createCanvas(icon.width, icon.height)
      const context = canvas.getContext('2d')
      context.drawImage(icon, 0, 0)
      const pixels = context.getImageData(0, 0, icon.width, icon.height).data
      let left = icon.width
      let top = icon.height
      let right = -1
      let bottom = -1
      for (let y = 0; y < icon.height; y++) {
        for (let x = 0; x < icon.width; x++) {
          if (pixels[(y * icon.width + x) * 4 + 3] <= 8) continue
          left = Math.min(left, x); top = Math.min(top, y)
          right = Math.max(right, x); bottom = Math.max(bottom, y)
        }
      }
      expect(right - left + 1).toBeLessThanOrEqual(maximumWidth)
      expect(bottom - top + 1).toBeLessThanOrEqual(maximumHeight)
    }
  })
})
