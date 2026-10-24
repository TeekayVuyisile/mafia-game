// Shared header for the Command Center, Lobby and Game screens: wordmark left, actions right
const TopBar = ({ children }) => (
  <header style={{ borderBottom: '1px solid rgba(200, 169, 107, 0.15)' }}>
    <div className="container d-flex align-items-center justify-content-between gap-3 py-3 px-3" style={{ maxWidth: '72rem' }}>
      <span className="gold-text text-nowrap d-none d-sm-inline" style={{ fontFamily: 'var(--font-title)', letterSpacing: '4px', fontWeight: 700 }}>
        MAFIA
      </span>
      <div className="d-flex align-items-center gap-2 ms-auto" style={{ minWidth: 0 }}>
        {children}
      </div>
    </div>
  </header>
);

export default TopBar;
