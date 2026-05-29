import { NavLink, Outlet } from 'react-router-dom';

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">🏠</div>
          <div>
            <div className="brand-title">Mary's House</div>
            <div className="brand-sub">Grant Intelligence</div>
          </div>
        </div>
        <nav className="nav">
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/sources">Sources</NavLink>
        </nav>
      </header>

      <div className="banner">
        ⚠️&nbsp; All outputs are AI-generated drafts. Human review required before any submission.
      </div>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </main>
    </div>
  );
}
