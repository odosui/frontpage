import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import api, { UNAUTHORIZED_EVENT, type User } from '../api'

type AuthValue = {
  user: User | null
  /** True until the first `me` call has answered — before that we know nothing. */
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | undefined>(undefined)

/**
 * Who is signed in, for the whole app. The session itself is an httpOnly
 * cookie the browser carries on its own; what is kept here is only the answer
 * to "is there one", which the server gives on `/auth/me`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    api
      .me()
      .then((res: { user: User }) => alive && setUser(res.user))
      .catch(() => alive && setUser(null))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  // a request anywhere in the app can be the one that discovers the session is
  // gone — the login screen has to come back regardless of which one it was
  useEffect(() => {
    const onUnauthorized = () => setUser(null)
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const res: { user: User } = await api.login(email, password)
    setUser(res.user)
  }, [])

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within an AuthProvider')
  return value
}
