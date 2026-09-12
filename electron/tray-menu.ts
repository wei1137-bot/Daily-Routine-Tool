export interface TrayLabels {
  open: string
  quit: string
}

export function trayLabels(language?: string): TrayLabels {
  return language === 'zh'
    ? { open: '打开 Daily Routine', quit: '退出' }
    : { open: 'Open Daily Routine', quit: 'Quit' }
}
