import { HomeIcon, GearIcon } from '@primer/octicons-react'
import { Link, useLocation } from 'slim-react-router'

const NAV_ITEMS = [
  { path: '/db/default', icon: HomeIcon },
  { path: '/settings', icon: GearIcon },
]

const Sidebar = () => {
  const location = useLocation()

  return (
    <nav className="sidebar">
      <div className="sidebar-nav">
        {NAV_ITEMS.map(({ path, icon: Icon }) => (
          <Link
            key={path}
            to={path}
            className={`sidebar-item${location.pathname.startsWith(path) ? ' active' : ''}`}
          >
            <Icon size={20} />
          </Link>
        ))}
      </div>
    </nav>
  )
}

export default Sidebar
