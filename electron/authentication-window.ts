import type { BrowserWindow, BrowserWindowConstructorOptions, WebPreferences } from 'electron'

export function persistentSessionWebPreferences(partition: string): WebPreferences {
  return { partition, contextIsolation: true, nodeIntegration: false, sandbox: true }
}

export function isAllowedAuthenticationPopup(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.href === 'about:blank'
  } catch {
    return false
  }
}

export function configureAuthenticationPopups(opener: BrowserWindow, partition: string) {
  opener.webContents.setWindowOpenHandler(({ url }) => {
    if (!isAllowedAuthenticationPopup(url)) return { action: 'deny' }
    const overrideBrowserWindowOptions: BrowserWindowConstructorOptions = {
      parent: opener,
      show: true,
      autoHideMenuBar: true,
      webPreferences: persistentSessionWebPreferences(partition)
    }
    return { action: 'allow', overrideBrowserWindowOptions }
  })
}
