import React, { useState } from "react";
import "./dashboard.css";
import Dashboard from "./pages/Dashboard.jsx";
import Customers from "./pages/Customers.jsx";
import Tasks from "./pages/Tasks.jsx";
import Reports from "./pages/Reports.jsx";

export default function App() {
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [topSearch, setTopSearch] = useState("");

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
