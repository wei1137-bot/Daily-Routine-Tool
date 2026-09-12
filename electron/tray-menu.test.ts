import { describe, expect, it } from 'vitest'

import { trayLabels } from './tray-menu'

describe('tray menu labels', () => {
  it('defaults to English like the renderer', () => {
    expect(trayLabels()).toEqual({ open: 'Open Daily Routine', quit: 'Quit' })
    expect(trayLabels('en')).toEqual({ open: 'Open Daily Routine', quit: 'Quit' })
  })

  it('uses Chinese when the app language is Chinese', () => {
    expect(trayLabels('zh')).toEqual({ open: '打开 Daily Routine', quit: '退出' })
  })
})
