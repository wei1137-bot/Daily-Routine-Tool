import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import initSqlJs from 'sql.js'
import { afterEach, describe, expect, it } from 'vitest'
import { canonicalAppDataRoot, prepareStableUserData } from './user-data'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive:true, force:true })
})

async function sqliteBytes(marker: string) {
  const SQL = await initSqlJs({ locateFile:() => require.resolve('sql.js/dist/sql-wasm.wasm') })
  const database = new SQL.Database()
  database.run('CREATE TABLE marker (value TEXT)')
  database.run('INSERT INTO marker VALUES (?)', [marker])
  return Buffer.from(database.export())
}

describe('stable user data directory', () => {
  it('uses one absolute roaming directory on Windows regardless of the launcher app-data path', () => {
    expect(canonicalAppDataRoot(
      'C:\\Users\\me\\AppData\\Local\\Packages\\Launcher\\LocalCache\\Roaming',
      'C:\\Users\\me',
      'win32',
      ''
    )).toBe(path.join('C:\\Users\\me', 'AppData', 'Roaming'))
  })

  it('prefers APPDATA over virtualized Electron home and appData paths on Windows', () => {
    expect(canonicalAppDataRoot(
      'C:\\Users\\me\\AppData\\Local\\Packages\\Launcher\\LocalCache\\Roaming',
      'C:\\Users\\me\\AppData\\Local\\Packages\\Launcher\\LocalCache',
      'win32',
      'C:\\Users\\me\\AppData\\Roaming'
    )).toBe(path.normalize('C:\\Users\\me\\AppData\\Roaming'))
  })

  it('uses the normal macOS Application Support root without rewriting it', () => {
    const applicationSupport = '/Users/me/Library/Application Support'
    expect(canonicalAppDataRoot(applicationSupport, '/Users/me', 'darwin', '')).toBe(applicationSupport)
  })

  it('imports a valid legacy database only when the stable database is absent', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-routine-user-data-'))
    temporaryDirectories.push(directory)
    const legacyDirectory = path.join(directory, 'daily-routine')
    fs.mkdirSync(legacyDirectory)
    const legacyBytes = await sqliteBytes('legacy')
    fs.writeFileSync(path.join(legacyDirectory, 'daily-routine.sqlite'), legacyBytes)

    const result = prepareStableUserData(directory)
    expect(result.databaseMigrated).toBe(true)
    expect(fs.readFileSync(result.stableDatabase)).toEqual(legacyBytes)
  })

  it('never overwrites an existing stable database', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-routine-user-data-'))
    temporaryDirectories.push(directory)
    const stableDirectory = path.join(directory, 'Daily Routine')
    const legacyDirectory = path.join(directory, 'daily-routine')
    fs.mkdirSync(stableDirectory); fs.mkdirSync(legacyDirectory)
    const stableBytes = await sqliteBytes('stable')
    fs.writeFileSync(path.join(stableDirectory, 'daily-routine.sqlite'), stableBytes)
    fs.writeFileSync(path.join(legacyDirectory, 'daily-routine.sqlite'), await sqliteBytes('legacy'))

    const result = prepareStableUserData(directory)
    expect(result.databaseMigrated).toBe(false)
    expect(fs.readFileSync(result.stableDatabase)).toEqual(stableBytes)
  })
})
