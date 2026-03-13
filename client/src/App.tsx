import * as React from 'react'
import { Suspense } from 'react'
import { BrowserRouter } from 'slim-react-router'
import { ThemeProvider } from './contexts/ThemeContext'

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <Suspense fallback={<Fallback />}>Hello</Suspense>
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
        width: '100vw',
        fontSize: '1rem',
      }}
    >
      ...
    </div>
  )
}

export default App
