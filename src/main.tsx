import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { MissingEnv } from './components/MissingEnv.tsx'
import { isSupabaseConfigured } from './lib/supabase.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isSupabaseConfigured ? (
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    ) : (
      <MissingEnv />
    )}
  </StrictMode>,
)
