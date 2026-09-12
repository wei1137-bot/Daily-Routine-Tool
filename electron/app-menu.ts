import type { MenuItemConstructorOptions } from 'electron'

export function macApplicationMenuTemplate(isPackaged: boolean): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { role: 'fileMenu' },
    { role: 'editMenu' }
  ]
  if (!isPackaged) template.push({ role: 'viewMenu' })
  template.push({ role: 'windowMenu' })
  return template
}
