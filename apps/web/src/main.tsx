import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { MaintenanceProvider, useMaintenance } from './contexts/MaintenanceContext'
import { App } from './App'
import { MaintenancePage } from './pages/MaintenancePage'
import { initConsentMode } from './lib/consent'
import './styles/globals.css'

// Inicializa Google Consent Mode v2 com defaults 'denied' o mais cedo
// possivel — antes de qualquer script de marketing/analytics carregar.
initConsentMode()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

/**
 * Wrapper that shows MaintenancePage when API returns 503 with MAINTENANCE_MODE code.
 */
function AppWithMaintenance() {
  const { isInMaintenance } = useMaintenance()

  if (isInMaintenance) {
    return <MaintenancePage />
  }

  return <App />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <MaintenanceProvider>
          <AuthProvider>
            <BrowserRouter>
              <AppWithMaintenance />
            </BrowserRouter>
          </AuthProvider>
        </MaintenanceProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
