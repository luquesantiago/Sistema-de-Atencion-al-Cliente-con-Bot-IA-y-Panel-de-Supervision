import { useState, type FormEvent } from 'react'
import { ErrorDeApi } from '../api/respuesta'
import { iniciarSesion } from '../api/sesion'
import { usuarioDesdeSesion, type UsuarioPanel } from '../usuario'

interface LoginProps {
  onIngresar: (usuario: UsuarioPanel) => void
  /** Mientras el panel consulta si ya hay una sesión abierta. */
  verificando?: boolean
  /** La sesión anterior venció o se cerró en el servidor. */
  sesionVencida?: boolean
}

export default function Login({ onIngresar, verificando = false, sesionVencida = false }: LoginProps) {
  const [nombreUsuario, setNombreUsuario] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errorUsuario, setErrorUsuario] = useState('')
  const [errorContrasena, setErrorContrasena] = useState('')
  const [errorServidor, setErrorServidor] = useState('')
  const [enviando, setEnviando] = useState(false)

  // El usuario y la clave se verifican en el backend; acá solo se pide que no estén vacíos.
  async function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (enviando || verificando) return
    const usuarioVacio = nombreUsuario.trim() === ''
    const contrasenaVacia = contrasena === ''
    setErrorUsuario(usuarioVacio ? 'Ingresá tu usuario.' : '')
    setErrorContrasena(contrasenaVacia ? 'Ingresá tu contraseña.' : '')
    setErrorServidor('')
    if (usuarioVacio || contrasenaVacia) return

    setEnviando(true)
    try {
      onIngresar(usuarioDesdeSesion(await iniciarSesion(nombreUsuario, contrasena)))
    } catch (error) {
      setErrorServidor(
        error instanceof ErrorDeApi && error.status !== 500
          ? error.message
          : 'No se pudo conectar con el servidor. Probá de nuevo en unos minutos.',
      )
      setContrasena('')
      setEnviando(false)
    }
  }

  return (
    <main className="login">
      <div className="login__campo" aria-hidden="true">
        <span className="login__orbe login__orbe--uno" />
        <span className="login__orbe login__orbe--dos" />
      </div>

      <div className="login__bloque">
        <header className="login__marca">
          <h1 className="login__wordmark">
            <span>Seguros</span>
            <span>Castaño</span>
          </h1>
          <p className="login__descriptor">Panel de Atención</p>
        </header>

        <form className="login__formulario" onSubmit={manejarEnvio} noValidate>
          <label htmlFor="usuario">Usuario</label>
          <input
            id="usuario"
            name="username"
            type="text"
            autoComplete="username"
            list="usuarios-disponibles"
            placeholder="Ingresá tu usuario"
            value={nombreUsuario}
            aria-invalid={errorUsuario !== ''}
            aria-describedby={errorUsuario ? 'usuario-error' : undefined}
            disabled={verificando}
            onChange={(evento) => {
              setNombreUsuario(evento.target.value)
              setErrorUsuario('')
              setErrorServidor('')
            }}
          />
          <datalist id="usuarios-disponibles">
            <option value="admin" />
            <option value="operador" />
          </datalist>
          {errorUsuario && <p className="login__error" id="usuario-error" role="alert">{errorUsuario}</p>}

          <label htmlFor="contrasena">Contraseña</label>
          <div className="login__password-wrapper">
            <input
              id="contrasena"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Ingresá tu contraseña"
              value={contrasena}
              aria-invalid={errorContrasena !== ''}
              aria-describedby={errorContrasena ? 'contrasena-error' : undefined}
              disabled={verificando}
              onChange={(evento) => {
                setContrasena(evento.target.value)
                setErrorContrasena('')
                setErrorServidor('')
              }}
            />
            <button
              className="login__password-toggle"
              type="button"
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((visible) => !visible)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {showPassword ? (
                  <>
                    <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" />
                    <circle cx="12" cy="12" r="2.5" />
                  </>
                ) : (
                  <>
                    <path d="M3 3 21 21" />
                    <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                    <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5.2 0 8.8 4.8 9.5 6-.3.5-1.2 1.8-2.7 3" />
                    <path d="M6.2 6.2C4.1 7.5 2.8 9.5 2.5 11c.5.9 1.9 2.8 4.3 4.2A10.2 10.2 0 0 0 12 17c.8 0 1.5-.1 2.2-.3" />
                  </>
                )}
              </svg>
            </button>
          </div>
          {errorContrasena && <p className="login__error" id="contrasena-error" role="alert">{errorContrasena}</p>}

          {errorServidor && <p className="login__error login__error--servidor" role="alert">{errorServidor}</p>}

          <button className="login__boton" type="submit" disabled={enviando || verificando}>
            {enviando ? 'Ingresando…' : 'Ingresar al Panel'}
          </button>
          <div className="login__estado" role="status" aria-live="polite">
            {verificando
              ? 'Verificando la sesión…'
              : sesionVencida && !errorServidor ? 'Tu sesión terminó. Volvé a ingresar para seguir.' : ''}
          </div>
        </form>
      </div>

      <footer className="login__pie">
        <div className="login__autor">
          <span className="login__autor-escudo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3 19 6v5c0 4.6-2.8 8-7 10-4.2-2-7-5.4-7-10V6l7-3Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </span>
          <p className="login__autor-datos">
            <strong>Operadores y administración</strong>
            <span className="login__ayuda" id="ayuda-credenciales">
              Usuarios de prueba: <strong>admin</strong> u <strong>operador</strong> · Clave: <strong>1234</strong>
            </span>
          </p>
        </div>
        <p className="login__copy">© 2026 Seguros Castaño</p>
      </footer>
    </main>
  )
}
