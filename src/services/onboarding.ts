import type { AppState } from '../domain/types'

interface OnboardingApi {
  saveSetting: (input: { key: string; value: string }) => Promise<AppState>
  connectBrightspace: (baseUrl: string) => Promise<unknown>
  syncBrightspace: (baseUrl: string) => Promise<{ state: AppState }>
  connectGradescope: () => Promise<unknown>
  syncGradescope: () => Promise<{ state: AppState }>
}

export async function importBrightspaceForOnboarding(
  api: OnboardingApi,
  baseUrl: string,
): Promise<AppState> {
  await api.saveSetting({ key: 'brightspaceBaseUrl', value: baseUrl })
  await api.connectBrightspace(baseUrl)
  const result = await api.syncBrightspace(baseUrl)
  return result.state
}

export async function importGradescopeForOnboarding(api: OnboardingApi): Promise<AppState> {
  await api.connectGradescope()
  const result = await api.syncGradescope()
  return result.state
}
