import { describe, expect, it } from 'vitest'
import { macApplicationMenuTemplate } from './app-menu'
import { hidesMainWindowOnClose, usesMacApplicationMenu } from './platform'

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
})
