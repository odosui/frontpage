import * as React from 'react'
import { Suspense, lazy } from 'react'
import { BrowserRouter, Switch, Route } from 'slim-react-router'
import { ThemeProvider } from './contexts/ThemeContext'
import Sidebar from './Sidebar'

const Dashboard = lazy(() => import('./Dashboard'))

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <div className="app-shell">
          <Sidebar />
          <Suspense fallback={<Fallback />}>
            <Switch>
              <Route path={['/db/:id', '/']} component={Dashboard} />
            </Switch>
          </Suspense>
        </div>
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
