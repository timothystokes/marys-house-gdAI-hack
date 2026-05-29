import { NavLink, Outlet } from 'react-router-dom';

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img
            src="/maryhouse.jpeg"
            alt="Mary's House Services"
            className="brand-logo"
          />
          <div>
            <div className="brand-title">Funding Opportunity Finder</div>
            <div className="brand-sub">Mary's House Services</div>
          </div>
        </div>
        <nav className="nav">
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/sources">Sources</NavLink>
          <NavLink to="/eligibility">Eligibility</NavLink>
        </nav>
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </main>
    </div>
  );
}
