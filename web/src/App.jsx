import { NavLink, Outlet, useLocation } from 'react-router-dom';

export default function App() {
  const location = useLocation();
  const onAbout = location.pathname.startsWith('/about');

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
          <NavLink to="/about">About</NavLink>
        </nav>
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {/* Persistent About iframe — mounted once and hidden when not on /about
            so the user's current slide / scroll position is retained when they
            switch to another tab and come back. */}
        <iframe
          src="/about.html"
          title="About Mary's House Funding Opportunity Finder"
          style={{
            position: onAbout ? 'relative' : 'absolute',
            visibility: onAbout ? 'visible' : 'hidden',
            pointerEvents: onAbout ? 'auto' : 'none',
            zIndex: onAbout ? 1 : -1,
            flex: 1,
            width: '100%',
            height: '100%',
            minHeight: 'calc(100vh - 64px)',
            border: 'none',
            display: 'block',
          }}
        />
        {!onAbout && <Outlet />}
      </main>
    </div>
  );
}
