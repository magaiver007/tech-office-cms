import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Link, useParams } from "react-router-dom";

export default function CaseDetails() {
  const { id } = useParams();
  const [row, setRow] = useState(null);
  const [files, setFiles] = useState([]);
  const [err, setErr] = useState("");
  const [fileErr, setFileErr] = useState("");

  async function load() {
    setErr("");
    try {
      const data = await api(`/api/cases/${id}`);
      setRow(data);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function ensureFolder() {
    setFileErr("");
    try {
      await api(`/api/cases/${id}/files/ensure-folder`, { method: "POST" });
      await loadFiles();
    } catch (e) {
      setFileErr(e.message);
    }
  }

  async function loadFiles() {
    setFileErr("");
    try {
      const data = await api(`/api/cases/${id}/files`);
      setFiles(data.items || []);
    } catch (e) {
      setFileErr(e.message);
    }
  }

  async function uploadOne(file) {
    setFileErr("");
    const fd = new FormData();
    fd.append("file", file);
    try {
      await api(`/api/cases/${id}/files/upload`, { method: "POST", body: fd, isForm: true });
      await loadFiles();
    } catch (e) {
      setFileErr(e.message);
    }
  }

  function download(name) {
    // open download in browser
    window.open(`http://localhost:4000/api/cases/${id}/files/download?name=${encodeURIComponent(name)}`, "_blank");
  }

  useEffect(() => { load(); }, [id]);

  if (err) return <div style={{ color: "crimson" }}>{err}</div>;
  if (!row) return <div>Loading...</div>;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Case {row.case_number}</h3>
        <Link to={`/cases/${id}/edit`}><button>Edit</button></Link>
      </div>

      <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
        <div><b>Client:</b> {row.client_name}</div>
        <div><b>Reference:</b> {row.reference_number}</div>
        <div><b>Date:</b> {row.case_date}</div>
        <div style={{ marginTop: 8 }}><b>Notes:</b><div style={{ whiteSpace: "pre-wrap" }}>{row.notes}</div></div>
        <div style={{ marginTop: 8, color: "#555" }}><b>NAS folder:</b> {row.nas_folder_path}</div>
      </div>

      <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <h4 style={{ margin: 0, flex: 1 }}>Client Files</h4>
          <button onClick={ensureFolder}>Create/Open Folder</button>
          <button onClick={loadFiles}>Refresh</button>
        </div>

        <input type="file" onChange={(e) => e.target.files?.[0] && uploadOne(e.target.files[0])} />

        {fileErr && <div style={{ color: "crimson", marginTop: 8 }}>{fileErr}</div>}

        <ul style={{ marginTop: 10 }}>
          {files.map((f) => (
            <li key={f.name} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ flex: 1 }}>{f.name}</span>
              <button onClick={() => download(f.name)}>Download</button>
            </li>
          ))}
          {!files.length && <li style={{ color: "#666" }}>No files listed (click “Create/Open Folder” then “Refresh”).</li>}
        </ul>
      </div>
    </div>
  );
}
