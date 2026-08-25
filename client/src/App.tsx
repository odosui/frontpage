import * as React from 'react'
import { Suspense, lazy, useState } from 'react'
import { BrowserRouter, Switch, Route } from 'slim-react-router'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { JobsProvider } from './contexts/JobsContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ToolbarProvider } from './contexts/ToolbarContext'
import JobsPanel from './JobsPanel'
import TopBar from './TopBar'

const Dashboard = lazy(() => import('./Dashboard'))
const Login = lazy(() => import('./Login'))
const Settings = lazy(() => import('./Settings'))

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <SignedIn />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

/**
 * Nothing behind the login screen is even mounted until there is a session:
 * every one of those views opens by fetching something the server would refuse.
 */
const SignedIn: React.FC = () => {
  const { user, loading } = useAuth()
  const [jobsOpen, setJobsOpen] = useState(false)

  if (loading) return <Fallback />
  if (!user) {
    return (
      <Suspense fallback={<Fallback />}>
        <Login />
      </Suspense>
    )
  }

  return (
    <JobsProvider>
      <ToolbarProvider>
        <div className="app-shell">
          <TopBar
            jobsOpen={jobsOpen}
            onToggleJobs={() => setJobsOpen((open) => !open)}
          />
          {jobsOpen && <JobsPanel onClose={() => setJobsOpen(false)} />}
          <main className="app-content">
            <Suspense fallback={<Fallback />}>
              <Switch>
                {/* before the dashboard route: `/db/:id` is the catch-all,
                    and a bare `/` lands on the first arc there is */}
                <Route path="/settings" component={Settings} />
                <Route path={['/db/:id', '/']} component={Dashboard} />
              </Switch>
            </Suspense>
          </main>
        </div>
      </ToolbarProvider>
    </JobsProvider>
  )
}

const Fallback = () => {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        flex: 1,
        fontSize: '1rem',
      }}
    >
      ...
    </div>
  )
}

export default App
