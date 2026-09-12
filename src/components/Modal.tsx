import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '../i18n'

export function Modal({ title, children, onClose, wide = false, className = '' }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean; className?: string }) {
  const { t } = useI18n()
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
    <section className={`modal ${wide ? 'wide' : ''} ${className}`.trim()} role="dialog" aria-modal="true" aria-label={title}>
      <header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label={t('cancel')}><X size={19}/></button></header>
      {children}
    </section>
  </div>
}
