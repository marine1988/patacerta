import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'
import { api } from '../lib/api'
import { AxiosError } from 'axios'

interface MaintenanceContextType {
  isInMaintenance: boolean
  setMaintenanceMode: (value: boolean) => void
}

const MaintenanceContext = createContext<MaintenanceContextType | undefined>(undefined)

export function MaintenanceProvider({ children }: { children: ReactNode }) {
  const [isInMaintenance, setIsInMaintenance] = useState(false)

  const setMaintenanceMode = useCallback((value: boolean) => {
    setIsInMaintenance(value)
  }, [])

  useEffect(() => {
    // Intercept 503 responses to detect maintenance mode
    const interceptorId = api.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 503) {
          const data = error.response.data as { code?: string } | undefined
          if (data?.code === 'MAINTENANCE_MODE') {
            setIsInMaintenance(true)
          }
        }
        return Promise.reject(error)
      }
    )

    // Initial health check to detect if already in maintenance
    api
      .get('/health')
      .then(() => setIsInMaintenance(false))
      .catch((error: AxiosError) => {
        if (error.response?.status === 503) {
          const data = error.response.data as { code?: string } | undefined
          if (data?.code === 'MAINTENANCE_MODE') {
            setIsInMaintenance(true)
          }
        }
      })

    return () => {
      api.interceptors.response.eject(interceptorId)
    }
  }, [])

  return (
    <MaintenanceContext.Provider value={{ isInMaintenance, setMaintenanceMode }}>
      {children}
    </MaintenanceContext.Provider>
  )
}

export function useMaintenance() {
  const context = useContext(MaintenanceContext)
  if (!context) {
    throw new Error('useMaintenance must be used within a MaintenanceProvider')
  }
  return context
}
