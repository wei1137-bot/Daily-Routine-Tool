import { describe, expect, it } from 'vitest'

import type { AppState } from '../domain/types'
import { importBrightspaceForOnboarding, importGradescopeForOnboarding } from './onboarding'

const importedState = { courses: [{ id: 'course-1' }] } as AppState

describe('onboarding imports', () => {
it('saves the Brightspace URL, connects, then syncs', async () => {
  const calls: string[] = []
  const api = {
    saveSetting: async ({ value }: { key: string; value: string }) => {
      calls.push(`save:${value}`)
      return {} as AppState
    },
    connectBrightspace: async (baseUrl: string) => { calls.push(`connect:${baseUrl}`) },
    syncBrightspace: async (baseUrl: string) => {
      calls.push(`sync:${baseUrl}`)
      return { state: importedState }
    },
    connectGradescope: async () => undefined,
    syncGradescope: async () => ({ state: importedState }),
  }

  const result = await importBrightspaceForOnboarding(api, 'https://purdue.brightspace.com')
  expect(result).toBe(importedState)
  expect(calls).toEqual([
    'save:https://purdue.brightspace.com',
    'connect:https://purdue.brightspace.com',
    'sync:https://purdue.brightspace.com',
  ])
})

it('connects Gradescope before syncing', async () => {
  const calls: string[] = []
  const api = {
    saveSetting: async () => ({} as AppState),
    connectBrightspace: async () => undefined,
    syncBrightspace: async () => ({ state: importedState }),
    connectGradescope: async () => { calls.push('connect') },
    syncGradescope: async () => {
      calls.push('sync')
      return { state: importedState }
    },
  }

  const result = await importGradescopeForOnboarding(api)
  expect(result).toBe(importedState)
  expect(calls).toEqual(['connect', 'sync'])
})
})
