import React, { useEffect, useState } from "react";
import { Routes, Route, Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import "./dashboard.css";
import Dashboard from "./pages/Dashboard.jsx";
import Customers from "./pages/Customers.jsx";
import Cases from "./pages/Cases.jsx";
import Tasks from "./pages/Tasks.jsx";
import Reports from "./pages/Reports.jsx";
import Diavgeia from "./pages/Diavgeia.jsx";
import DetailScreen from "./pages/DetailScreen.jsx";

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "light";
    const stored = window.localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    const next = theme === "dark" ? "theme-dark" : "theme-light";
    document.body.classList.remove("theme-dark", "theme-light");
    document.body.classList.add(next);
    window.localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <div className="shell">
      {/* Top bar */}
      <header className="topbar">
        <div className="topbar__brand">
          <div className="avatar" aria-hidden />
          <div className="brandText">Customer Management</div>
        </div>

        <div className="topbar__actions">
          <div className="search">
            <span className="search__icon" aria-hidden>
              ⌕
            </span>
            <input
              value={searchParams.get('q') || ''}
              onChange={(e) => {
                const newParams = new URLSearchParams(searchParams);
                if (e.target.value) {
                  newParams.set('q', e.target.value);
                } else {
                  newParams.delete('q');
                }
                setSearchParams(newParams);
              }}
              placeholder="Search..."
            />
          </div>
          <div className="hint" style={{ gap: 8 }}>
            <button
              className="btn btn--primary btn--sm"
              onClick={() => navigate('/customers?create=true')}
            >
              New Customer
            </button>
            <button
              className="btn btn--primary btn--sm"
              onClick={() => navigate('/cases?create=true')}
            >
              New Case
            </button>
          </div>
          <button
            className="btn btn--ghost btn--sm themeToggle"
            aria-pressed={theme === "dark"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? (
              <svg viewBox="0 0 24 24" className="themeToggle__icon" aria-hidden="true">
                <circle cx="12" cy="12" r="4.2" />
                <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <line x1="12" y1="1.8" x2="12" y2="4.4" />
                  <line x1="12" y1="19.6" x2="12" y2="22.2" />
                  <line x1="1.8" y1="12" x2="4.4" y2="12" />
                  <line x1="19.6" y1="12" x2="22.2" y2="12" />
                  <line x1="4.5" y1="4.5" x2="6.3" y2="6.3" />
                  <line x1="17.7" y1="17.7" x2="19.5" y2="19.5" />
                  <line x1="17.7" y1="6.3" x2="19.5" y2="4.5" />
                  <line x1="4.5" y1="19.5" x2="6.3" y2="17.7" />
                </g>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="themeToggle__icon" aria-hidden="true">
                <path d="M14.8 2.2a8.8 8.8 0 1 0 7 12.6 9.3 9.3 0 0 1-7-12.6z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Tabs */}
      <nav className="tabs">
        {[
          { label: "Dashboard", path: "/" },
          { label: "Customers", path: "/customers" },
          { label: "Cases", path: "/cases" },
          { label: "Tasks", path: "/tasks" },
          { label: "Reports", path: "/reports" },
          { label: "Diavgeia", path: "/diavgeia" }
        ].map((tab) => {
          const isActive = location.pathname === tab.path;
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`tab ${isActive ? "tab--active" : ""}`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {/* Pages */}
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/:id" element={<DetailScreen type="customer" />} />
        <Route path="/cases" element={<Cases />} />
        <Route path="/cases/:id" element={<DetailScreen type="case" />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/diavgeia" element={<Diavgeia />} />
      </Routes>
    </div>
  );
}

