import { Outlet } from 'react-router-dom'
import { Navbar } from './Navbar'
import { Footer } from './Footer'
import { BreederOnboardingGuard } from '../shared/BreederOnboardingGuard'

export function MainLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <BreederOnboardingGuard>
          <Outlet />
        </BreederOnboardingGuard>
      </main>
      <Footer />
    </div>
  )
}
