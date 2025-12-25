import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { useNavigate, useParams } from "react-router-dom";

export default function CaseForm({ mode }) {
  const nav = useNavigate();
  const { id } = useParams();
  const [err, setErr] = useState("");

  const [form, setForm] = useState({
    case_number: "",
    client_name: "",
    reference_number: "",
    case_date: "",
    notes: ""
  });

  useEffect(() => {
    if (mode === "edit") {
      api(`/api/cases/${id}`).then((data) => {
        setForm({
          case_number: data.case_number || "",
          client_name: data.client_name || "",
          reference_number: data.reference_number || "",
          case_date: data.case_date || "",
          notes: data.notes || ""
        });
      }).catch((e) => setErr(e.message));
    }
  }, [mode, id]);

  function setField(k, v) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      if (mode === "create") {
        const created = await api("/api/cases", { method: "POST", body: form });
        nav(`/cases/${created.id}`);
      } else {
        await api(`/api/cases/${id}`, { method: "PUT", body: form });
        nav(`/cases/${id}`);
      }
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <h3>{mode === "create" ? "New Case" : "Edit Case"}</h3>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
        <label>
          Case Number*
          <input value={form.case_number} onChange={(e) => setField("case_number", e.target.value)} style={{ width: "100%" }} />
        </label>
        <label>
          Client Name*
          <input value={form.client_name} onChange={(e) => setField("client_name", e.target.value)} style={{ width: "100%" }} />
        </label>
        <label>
          Reference Number
          <input value={form.reference_number} onChange={(e) => setField("reference_number", e.target.value)} style={{ width: "100%" }} />
        </label>
        <label>
          Date
          <input type="date" value={form.case_date} onChange={(e) => setField("case_date", e.target.value)} />
        </label>
        <label>
          Notes
          <textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} rows={5} />
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit">{mode === "create" ? "Create" : "Save"}</button>
          <button type="button" onClick={() => nav(-1)}>Cancel</button>
        </div>
        {err && <div style={{ color: "crimson" }}>{err}</div>}
      </form>
    </div>
  );
}
