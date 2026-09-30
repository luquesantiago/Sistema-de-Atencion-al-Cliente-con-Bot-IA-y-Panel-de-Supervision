import { useState, type FormEvent } from 'react'
import { crearUsuario, type UsuarioPanel } from '../usuario'

interface LoginProps {
  onIngresar: (usuario: UsuarioPanel) => void
}

export default function Login({ onIngresar }: LoginProps) {
  const [nombreUsuario, setNombreUsuario] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    onIngresar(crearUsuario(nombreUsuario))
  }

  return (
    <main className="login">
      <section className="login__tarjeta" aria-labelledby="login-titulo">
        <div className="login__escudo" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3 19 6v5c0 4.6-2.8 8-7 10-4.2-2-7-5.4-7-10V6l7-3Z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </div>
        <h1 className="login__titulo" id="login-titulo">Seguros Castaño</h1>
        <p className="login__subtitulo">Panel de Atención</p>

        <form className="login__formulario" onSubmit={manejarEnvio}>
          <label htmlFor="usuario">Usuario</label>
          <input
            id="usuario"
            name="username"
            type="text"
            autoComplete="username"
            list="usuarios-disponibles"
            pattern=".*\S.*"
            title="Ingresá un usuario con al menos una letra o número."
            placeholder="Ingresá tu usuario"
            value={nombreUsuario}
            onChange={(evento) => setNombreUsuario(evento.target.value)}
            required
          />
          <datalist id="usuarios-disponibles">
            <option value="roberto" />
            <option value="graciela" />
          </datalist>

          <label htmlFor="contrasena">Contraseña</label>
          <div className="login__password-wrapper">
            <input
              id="contrasena"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Ingresá tu contraseña"
              required
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

          <button className="login__boton" type="submit">Ingresar al Panel</button>
        </form>
      </section>
      <footer className="login__pie">© 2026 Seguros Castaño</footer>
    </main>
  )
}