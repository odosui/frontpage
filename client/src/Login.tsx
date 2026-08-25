import { useState } from 'react'
import { useAuth } from './contexts/AuthContext'

/**
 * The only thing an unauthenticated visitor sees. There is no sign-up link
 * because there is no sign-up: accounts are made on the server with
 * `npm run user:create`.
 */
const Login = () => {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in')
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <h1 className="login-title">Frontpage</h1>
        <p className="login-hint">Sign in to follow your arcs.</p>

        <label className="login-field">
          <span className="login-label">Email</span>
          <input
            className="login-input"
            type="email"
            autoComplete="username"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="login-field">
          <span className="login-label">Password</span>
          <input
            className="login-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <p className="login-error">{error}</p>}

        <button
          className="login-submit"
          type="submit"
          disabled={busy || !email || !password}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

export default Login
