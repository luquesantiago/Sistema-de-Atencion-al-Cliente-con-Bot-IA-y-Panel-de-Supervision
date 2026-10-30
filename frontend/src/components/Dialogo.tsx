import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const SELECTOR_ENFOCABLES = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

type EntradaPila = { token: symbol; panel: HTMLElement | null }

// La pila es del módulo, no del componente: los formularios y la confirmación
// pueden estar montados a la vez y solo el diálogo de arriba debe responder
// al teclado. El fondo se bloquea una vez y se libera cuando cierra el último.
const pila: EntradaPila[] = []
let bloqueosDeFondo = 0
let fondoAnterior: {
  inert: boolean
  ariaHidden: string | null
  overflow: string
  foco: HTMLElement | null
} | null = null

function enfocables(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(SELECTOR_ENFOCABLES))
    .filter((elemento) => elemento.getClientRects().length > 0)
}

function sincronizarPaneles(): void {
  pila.forEach((entrada, indice) => {
    if (entrada.panel === null) return
    if (indice === pila.length - 1) {
      entrada.panel.removeAttribute('inert')
      entrada.panel.removeAttribute('aria-hidden')
      return
    }
    entrada.panel.setAttribute('inert', '')
    entrada.panel.setAttribute('aria-hidden', 'true')
  })
}

function bloquearFondo(): void {
  if (bloqueosDeFondo === 0) {
    const raiz = document.getElementById('root')
    fondoAnterior = {
      inert: raiz?.hasAttribute('inert') ?? false,
      ariaHidden: raiz?.getAttribute('aria-hidden') ?? null,
      overflow: document.body.style.overflow,
      foco: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    }
    if (raiz !== null) {
      raiz.setAttribute('inert', '')
      raiz.setAttribute('aria-hidden', 'true')
    }
    document.body.style.overflow = 'hidden'
  }
  bloqueosDeFondo += 1
}

function desbloquearFondo(): void {
  bloqueosDeFondo = Math.max(0, bloqueosDeFondo - 1)
  if (bloqueosDeFondo > 0 || fondoAnterior === null) return

  const raiz = document.getElementById('root')
  if (raiz !== null) {
    if (fondoAnterior.inert) raiz.setAttribute('inert', '')
    else raiz.removeAttribute('inert')

    if (fondoAnterior.ariaHidden === null) raiz.removeAttribute('aria-hidden')
    else raiz.setAttribute('aria-hidden', fondoAnterior.ariaHidden)
  }
  document.body.style.overflow = fondoAnterior.overflow
  const foco = fondoAnterior.foco
  fondoAnterior = null
  if (foco !== null && document.contains(foco)) foco.focus()
}

type DialogoProps = {
  tituloId: string
  descritoPor?: string
  onCerrar: () => void
  bloqueado?: boolean
  ancho?: boolean
  superpuesto?: boolean
  children: ReactNode
}

/**
 * Diálogo modal compartido: se monta en el body, atrapa el foco, devuelve el
 * foco al control que lo abrió y solo deja que el diálogo de arriba cierre con
 * Escape. El fondo queda inerte mientras haya uno abierto.
 */
export default function Dialogo({
  tituloId,
  descritoPor,
  onCerrar,
  bloqueado = false,
  ancho = false,
  superpuesto = false,
  children,
}: DialogoProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const tokenRef = useRef<symbol>(Symbol('dialogo'))
  const cerrarRef = useRef(onCerrar)
  const bloqueadoRef = useRef(bloqueado)

  useEffect(() => {
    cerrarRef.current = onCerrar
    bloqueadoRef.current = bloqueado
  })

  useEffect(() => {
    const token = tokenRef.current
    const panel = panelRef.current
    const focoPrevio = document.activeElement instanceof HTMLElement ? document.activeElement : null

    pila.push({ token, panel })
    bloquearFondo()
    sincronizarPaneles()

    const primerEnfocable = panel === null ? null : enfocables(panel)[0]
    ;(primerEnfocable ?? panel)?.focus()

    function alTeclear(evento: KeyboardEvent): void {
      if (pila[pila.length - 1]?.token !== token) return

      if (evento.key === 'Escape') {
        if (bloqueadoRef.current) return
        evento.preventDefault()
        evento.stopPropagation()
        cerrarRef.current()
        return
      }

      if (evento.key !== 'Tab' || panel === null) return

      const lista = enfocables(panel)
      if (lista.length === 0) {
        evento.preventDefault()
        panel.focus()
        return
      }

      const primero = lista[0]
      const ultimo = lista[lista.length - 1]
      const activo = document.activeElement

      if (activo === panel || !panel.contains(activo)) {
        evento.preventDefault()
        ;(evento.shiftKey ? ultimo : primero).focus()
        return
      }

      if (evento.shiftKey && activo === primero) {
        evento.preventDefault()
        ultimo.focus()
      } else if (!evento.shiftKey && activo === ultimo) {
        evento.preventDefault()
        primero.focus()
      }
    }

    document.addEventListener('keydown', alTeclear, true)
    return () => {
      document.removeEventListener('keydown', alTeclear, true)
      const indice = pila.findIndex((entrada) => entrada.token === token)
      if (indice !== -1) pila.splice(indice, 1)
      sincronizarPaneles()
      desbloquearFondo()

      if (focoPrevio !== null && focoPrevio !== document.body && document.contains(focoPrevio)) {
        focoPrevio.focus()
      }
    }
  }, [])

  return createPortal(
    <div
      className={`modal__atras${superpuesto ? ' modal__atras--superpuesto' : ''}`}
      onMouseDown={(evento: MouseEvent<HTMLDivElement>) => {
        if (evento.target === evento.currentTarget && !bloqueadoRef.current) cerrarRef.current()
      }}
    >
      <div
        className={`modal${ancho ? ' modal--ancho' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={descritoPor}
        aria-busy={bloqueado || undefined}
        ref={panelRef}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
