import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from './state/Toast.tsx'
import { ConfirmProvider } from './state/Confirm.tsx'
import { ThemeProvider, applyThemeAttribute } from './state/Theme.tsx'
import { RulesProvider } from './state/Rules.tsx'

// Apply the saved theme before first paint to avoid a flash.
try {
  const saved = localStorage.getItem('theme')
  if (saved === 'light') applyThemeAttribute('light')
} catch {
  /* ignore */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <ConfirmProvider>
          <RulesProvider>
            <App />
          </RulesProvider>
        </ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
)
