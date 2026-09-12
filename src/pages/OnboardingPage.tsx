import { ChevronRight, GraduationCap, LoaderCircle, PencilLine, School } from 'lucide-react'
import { useState } from 'react'

import { useI18n } from '../i18n'

type Connection = 'brightspace' | 'gradescope'

interface OnboardingPageProps {
  onConnectBrightspace: () => Promise<void>
  onConnectGradescope: () => Promise<void>
  onAddManually: () => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function OnboardingPage({ onConnectBrightspace, onConnectGradescope, onAddManually }: OnboardingPageProps) {
  const { t } = useI18n()
  const [busy, setBusy] = useState<Connection | null>(null)
  const [error, setError] = useState<string | null>(null)

  const connect = async (provider: Connection, action: () => Promise<void>) => {
    setBusy(provider)
    setError(null)
    try {
      await action()
    } catch (nextError) {
      setError(errorMessage(nextError))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="onboarding-page">
      <main className="onboarding-panel">
        <div className="onboarding-brand">
          <span className="brand-mark" aria-hidden="true"><img src="/app-icon.png" alt="" /></span>
          <span>Daily Routine</span>
        </div>
        <header className="onboarding-header">
          <h1>{t('welcomeTitle')}</h1>
          <p>{t('welcomeSubtitle')}</p>
        </header>
        <div className="onboarding-options">
          <button type="button" className="onboarding-option onboarding-option-primary" disabled={busy !== null} onClick={() => void connect('brightspace', onConnectBrightspace)}>
            <span className="onboarding-option-icon">{busy === 'brightspace' ? <LoaderCircle className="spin" size={23} /> : <School size={23} />}</span>
            <span className="onboarding-option-copy"><strong>{t('onboardingBrightspace')}</strong><small>{t('onboardingBrightspaceHint')}</small></span>
            <ChevronRight size={20} aria-hidden="true" />
          </button>
          <button type="button" className="onboarding-option" disabled={busy !== null} onClick={() => void connect('gradescope', onConnectGradescope)}>
            <span className="onboarding-option-icon">{busy === 'gradescope' ? <LoaderCircle className="spin" size={23} /> : <GraduationCap size={23} />}</span>
            <span className="onboarding-option-copy"><strong>{t('onboardingGradescope')}</strong><small>{t('onboardingGradescopeHint')}</small></span>
            <ChevronRight size={20} aria-hidden="true" />
          </button>
          <button type="button" className="onboarding-option" disabled={busy !== null} onClick={onAddManually}>
            <span className="onboarding-option-icon"><PencilLine size={23} /></span>
            <span className="onboarding-option-copy"><strong>{t('onboardingManual')}</strong><small>{t('onboardingManualHint')}</small></span>
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
        {error && <p className="onboarding-error" role="alert">{error}</p>}
      </main>
    </div>
  )
}
