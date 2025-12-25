import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Link } from "react-router-dom";

export default function CasesList() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");

  async function load() {
    setErr("");
    try {
      const data = await api(`/api/cases${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      setRows(data);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          placeholder="Search by case number, client name, reference..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1 }}
        />
        <button onClick={load}>Search</button>
        <Link to="/cases/new"><button>New Case</button></Link>
      </div>

      {err && <div style={{ color: "crimson" }}>{err}</div>}

      <table width="100%" cellPadding="8" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
            <th>Case #</th>
            <th>Client</th>
            <th>Reference</th>
            <th>Date</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
              <td><Link to={`/cases/${r.id}`}>{r.case_number}</Link></td>
              <td>{r.client_name}</td>
              <td>{r.reference_number}</td>
              <td>{r.case_date}</td>
              <td>{new Date(r.updated_at).toLocaleString()}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr><td colSpan="5" style={{ color: "#666" }}>No cases yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
