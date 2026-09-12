import { describe, expect, it } from 'vitest'
import { macApplicationMenuTemplate } from './app-menu'
import {
  appZoomPercent,
  hidesMainWindowOnClose,
  platformDefaultWindowSize,
  resolveWindowSize,
  usesMacApplicationMenu
} from './platform'

describe('desktop platform behavior', () => {
  it('keeps the existing close-to-tray behavior on Windows', () => {
    expect(hidesMainWindowOnClose('win32')).toBe(true)
    expect(usesMacApplicationMenu('win32')).toBe(false)
  })

  it('lets macOS close and later recreate its window from Dock activation', () => {
    expect(hidesMainWindowOnClose('darwin')).toBe(false)
    expect(usesMacApplicationMenu('darwin')).toBe(true)
  })

  it('provides native macOS application, file, edit, and window menus', () => {
    expect(macApplicationMenuTemplate(true).map((item) => item.role))
      .toEqual(['appMenu', 'fileMenu', 'editMenu', 'windowMenu'])
    expect(macApplicationMenuTemplate(false).map((item) => item.role)).toContain('viewMenu')
  })

  it('uses the compact requested default on macOS without changing Windows defaults', () => {
    expect(platformDefaultWindowSize('darwin')).toEqual({ width:1280, height:720 })
    expect(platformDefaultWindowSize('win32')).toEqual({ width:1440, height:900 })
  })

  it('restores saved window dimensions and keeps them on screen', () => {
    expect(resolveWindowSize({ defaultWindowWidth:'1180', defaultWindowHeight:'700' }, 'darwin', { width:1400, height:850 }))
      .toEqual({ width:1180, height:700 })
    expect(resolveWindowSize({ defaultWindowWidth:'3000', defaultWindowHeight:'2000' }, 'darwin', { width:1512, height:900 }))
      .toEqual({ width:1512, height:900 })
    expect(resolveWindowSize({ defaultWindowWidth:'bad', defaultWindowHeight:'bad' }, 'darwin'))
      .toEqual({ width:1280, height:720 })
  })

  it('bounds app zoom to the supported slider range', () => {
    expect(appZoomPercent()).toBe(100)
    expect(appZoomPercent('')).toBe(100)
    expect(appZoomPercent('115')).toBe(115)
    expect(appZoomPercent('10')).toBe(80)
    expect(appZoomPercent('200')).toBe(130)
  })
})
