import type { ReactNode } from 'react'

interface PageHeaderProps {
  titulo: string
  descripcion: string
  acciones?: ReactNode
}

export default function PageHeader({
  titulo,
  descripcion,
  acciones,
}: PageHeaderProps) {
  return (
    <header className="pagina__encabezado">
      <div>
        <h1 className="pagina__titulo">{titulo}</h1>
        <p className="pagina__descripcion">{descripcion}</p>
      </div>
      {acciones ? <div className="pagina__acciones">{acciones}</div> : null}
    </header>
  )
}
