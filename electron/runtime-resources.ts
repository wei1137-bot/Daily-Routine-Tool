import fs from 'node:fs'
import path from 'node:path'

export interface RuntimeResourceContext {
  isPackaged: boolean
  resourcesPath: string
  appRoot: string
}

export function runtimeAssetPath(name: string, context: RuntimeResourceContext) {
  if (context.isPackaged) return path.join(context.resourcesPath, name)
  const directory = /\.(?:ico|icns)$/i.test(name) || /Template(?:@2x)?\.png$/i.test(name) ? 'build' : 'public'
  return path.join(context.appRoot, directory, name)
}

export function tesseractLanguagePath(context: RuntimeResourceContext, developmentPath: string) {
  return context.isPackaged ? path.join(context.resourcesPath, 'tessdata') : developmentPath
}

export function assertTesseractLanguageData(langPath: string, language = 'eng') {
  const filePath = path.join(langPath, `${language}.traineddata.gz`)
  if (!fs.existsSync(filePath)) {
    throw new Error(`OCR language data is missing from the application resources: ${filePath}`)
  }
  return filePath
}
