import type { ReactNode } from 'react'
import type { ModuloPanel } from '../navigation'

interface IconoProps {
  className?: string
}

function PanelIcono({
  className,
  children,
}: IconoProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export function IconoDashboard({ className }: IconoProps) {
  return (
    <PanelIcono className={className}>
      <rect x="3" y="3" width="7" height="8" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="11" width="7" height="10" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </PanelIcono>
  )
}

export function IconoBandeja({ className }: IconoProps) {
  return (
    <PanelIcono className={className}>
      <path d="M3 13h4l1.5 3h7L17 13h4" />
      <path d="M4.5 5h15l1.5 8v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4z" />
    </PanelIcono>
  )
}

export function IconoTramites({ className }: IconoProps) {
  return (
    <PanelIcono className={className}>
      <path d="M8 4h8a1 1 0 0 1 1 1v1H7V5a1 1 0 0 1 1-1z" />
      <path d="M16 5h2a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2" />
      <path d="M8.5 13.5l2 2 4.5-4.5" />
    </PanelIcono>
  )
}

export function IconoClientes({ className }: IconoProps) {
  return (
    <PanelIcono className={className}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.3a3.2 3.2 0 0 1 0 5.4" />
      <path d="M17.5 14.6A5.5 5.5 0 0 1 20.5 20" />
    </PanelIcono>
  )
}

export function IconoConversacion({ className }: IconoProps) {
  return (
    <PanelIcono className={className}>
      <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2 1-4.5A7.5 7.5 0 1 1 20 11.5Z" />
      <path d="M8 10h8M8 13.5h5" />
    </PanelIcono>
  )
}

export function IconoFichaCliente({ className }: IconoProps) {
  return (
    <PanelIcono className={className}>
      <rect x="4" y="3.5" width="16" height="17" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="M6.5 15a2.5 2.5 0 0 1 5 0" />
      <path d="M14 9h3.5M14 13h3.5M14 17h3.5" />
    </PanelIcono>
  )
}

export function IconoPausa({ className }: IconoProps) {
  return (
    <PanelIcono className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 8.5v7M14.5 8.5v7" />
    </PanelIcono>
  )
}

export function IconoSalir({ className }: IconoProps) {
  return (
    <PanelIcono className={className}>
      <path d="M14.5 8V5.5A1.5 1.5 0 0 0 13 4H6a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 6 20h7a1.5 1.5 0 0 0 1.5-1.5V16" />
      <path d="M10 12h9.5" />
      <path d="M17 9.5 19.5 12 17 14.5" />
    </PanelIcono>
  )
}

export function IconoInfo({ className }: IconoProps) {
  return (
    <PanelIcono className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5" />
      <path d="M12 7.8h.01" />
    </PanelIcono>
  )
}

export function IconoCandado({ className }: IconoProps) {
  return (
    <PanelIcono className={className}>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </PanelIcono>
  )
}

// Estados de póliza: texto, icono y color, nunca solo color.
export function IconoActiva({ className }: IconoProps) {
  return (
    <PanelIcono className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.2 12.3 2.5 2.5 5.1-5.3" />
    </PanelIcono>
  )
}

export function IconoVencida({ className }: IconoProps) {
  return (
    <PanelIcono className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.4V12l3.1 1.9" />
    </PanelIcono>
  )
}

export function IconoSuspendida({ className }: IconoProps) {
  return (
    <PanelIcono className={className}>
      <path d="M12 4.6 21 19.4H3z" />
      <path d="M12 10.2v3.9" />
      <path d="M12 16.7h.01" />
    </PanelIcono>
  )
}

export function IconoBaja({ className }: IconoProps) {
  return (
    <PanelIcono className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m9.3 9.3 5.4 5.4" />
      <path d="m14.7 9.3-5.4 5.4" />
    </PanelIcono>
  )
}

const ICONOS: Record<ModuloPanel, (props: IconoProps) => ReactNode> = {
  dashboard: IconoDashboard,
  bandeja: IconoBandeja,
  tramites: IconoTramites,
  clientes: IconoClientes,
}

export function IconoModulo({
  modulo,
  className,
}: {
  modulo: ModuloPanel
  className?: string
}) {
  const Icono = ICONOS[modulo]
  return <Icono className={className} />
}
