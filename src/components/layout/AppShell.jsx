import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import ArtistTypeModal from '../ui/ArtistTypeModal'

function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      <ArtistTypeModal />
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6 relative z-10">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AppShell