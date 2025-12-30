import React, { useEffect, useState } from "react";
import "./dashboard.css";
import Dashboard from "./pages/Dashboard.jsx";
import Customers from "./pages/Customers.jsx";
import Tasks from "./pages/Tasks.jsx";
import Reports from "./pages/Reports.jsx";

export default function App() {
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [topSearch, setTopSearch] = useState("");
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
              value={topSearch}
              onChange={(e) => setTopSearch(e.target.value)}
              placeholder="Search..."
            />
          </div>
          {/* On Dashboard/Customers this opens modal inside pages */}
          <div className="hint">
            {activeTab === "Tasks" ? (
              <span className="mutedSmall">Use Tasks page to add tasks.</span>
            ) : (
              <span className="mutedSmall">Use Customers tab to add/edit customers.</span>
            )}
          </div>
          <button
            className="btn btn--ghost"
            aria-pressed={theme === "dark"}
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
        </div>
      </header>

      {/* Tabs */}
      <nav className="tabs">
        {["Dashboard", "Customers", "Tasks", "Reports"].map((t) => (
          <button
            key={t}
            className={`tab ${activeTab === t ? "tab--active" : ""}`}
            onClick={() => setActiveTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>

      {/* Pages */}
      {activeTab === "Dashboard" && <Dashboard topSearch={topSearch} />}
      {activeTab === "Customers" && <Customers topSearch={topSearch} />}
      {activeTab === "Tasks" && <Tasks />}
      {activeTab === "Reports" && <Reports />}
    </div>
  );
}
