import * as React from 'react'
import { Suspense, lazy, useState } from 'react'
import { BrowserRouter, Switch, Route } from 'slim-react-router'
import { JobsProvider } from './contexts/JobsContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ToolbarProvider } from './contexts/ToolbarContext'
import JobsPanel from './JobsPanel'
import TopBar from './TopBar'

const Dashboard = lazy(() => import('./Dashboard'))
const Settings = lazy(() => import('./Settings'))
const Storyline = lazy(() => import('./Storyline'))

const App: React.FC = () => {
  const [jobsOpen, setJobsOpen] = useState(false)

  return (
    <BrowserRouter>
      <ThemeProvider>
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
                    <Route path="/settings" component={Settings} />
                    {/* before the dashboard routes: `/db/:id` would swallow it */}
                    <Route
                      path={['/db/:id/storylines/:slug', '/storylines/:slug']}
                      component={Storyline}
                    />
                    <Route path={['/db/:id', '/']} component={Dashboard} />
                  </Switch>
                </Suspense>
              </main>
            </div>
          </ToolbarProvider>
        </JobsProvider>
      </ThemeProvider>
    </BrowserRouter>
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
