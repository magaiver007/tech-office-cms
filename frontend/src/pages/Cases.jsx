import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { DetailRow, ErrorBox, IconBtn, LoadingLine, Modal, FormRow, Pill } from "../ui/components.jsx";

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

export default function Cases() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const topSearch = searchParams.get('q') || '';

  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) || rows[0] || null,
    [rows, selectedId]
  );

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [draft, setDraft] = useState(null);

  async function load() {
    setErr("");
    try {
      const q = topSearch?.trim() ? `?q=${encodeURIComponent(topSearch.trim())}` : "";
      const data = await api(`/api/cases${q}`);
      setRows(data);
      if (data?.length && selectedId == null) setSelectedId(data[0].id);
      if (data?.length && selectedId != null && !data.find((x) => x.id === selectedId)) setSelectedId(data[0].id);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [topSearch]);
  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      open(null);
      // Clear the create param after opening
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('create');
      setSearchParams(newParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('create')]);

  function open(row) {
    setFormErr("");
    setDraft({
      case_number: row?.case_number || "",
      client_name: row?.client_name || "",
      reference_number: row?.reference_number || "",
      case_date: row?.case_date || "",
      notes: row?.notes || ""
    });
    setIsModalOpen(true);
  }

  async function save() {
    setFormErr("");
    try {
      if (!draft.case_number || !draft.client_name) {
        setFormErr("Case number and Client name are required.");
        return;
      }

      const created = await api("/api/cases", { method: "POST", body: draft });
      setIsModalOpen(false);
      await load();
      if (created?.id) setSelectedId(created.id);
    } catch (e) {
      setFormErr(e.message);
    }
  }

  function openSelected() {
    if (!selected) return;
    navigate(`/cases/${selected.id}`);
  }

  return (
    <main className="grid">
      {/* Left: small nav */}
      <section className="panel panel--left">
        <div className="panel__header">
          <div className="panel__title">Cases</div>
          <IconBtn title="Refresh" onClick={load}>?</IconBtn>
        </div>
        <div className="mutedSmall" style={{ padding: 12 }}>
          Search is in the top bar.
        </div>
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <button className="btn btn--primary" onClick={() => open(null)}>Add Case</button>
          <button className="btn" onClick={openSelected} disabled={!selected}>Open Case</button>
        </div>
      </section>

      {/* Middle: table */}
      <section className="panel panel--mid">
        <div className="card">
          <div className="card__header">
            <div className="card__title">All Cases</div>
            <div className="card__tools">
              <IconBtn title="Add" onClick={() => open(null)}>+</IconBtn>
              <IconBtn title="Open Selected" onClick={openSelected}>?</IconBtn>
              <IconBtn title="Refresh" onClick={load}>?</IconBtn>
            </div>
          </div>

          {err && <ErrorBox error={err} />}
          {!err && !rows && <LoadingLine />}

          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 160 }}>Case #</th>
                  <th>Client</th>
                  <th style={{ width: 140 }}>Status</th>
                  <th style={{ width: 160 }}>Due Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr
                    key={c.id}
                    className={c.id === selectedId ? "row--active" : ""}
                    onClick={() => setSelectedId(c.id)}
                    onDoubleClick={openSelected}
                  >
                    <td className="mono">{c.case_number}</td>
                    <td>{c.client_name}</td>
                    <td>
                      <Pill tone={c.status === "Completed" ? "lead" : "active"}>{c.status || "Open"}</Pill>
                    </td>
                    <td>{formatDate(c.due_date)}</td>
                  </tr>
                ))}
                {!rows.length && !err && (
                  <tr><td colSpan={4} className="muted">No cases.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pager">
            <div className="pager__left">
              <span className="mutedSmall">Showing {rows.length} cases</span>
            </div>
            <div className="pager__right">
              <IconBtn title="Prev" onClick={() => {}}>{"<"}</IconBtn>
              <IconBtn title="Next" onClick={() => {}}>{">"}</IconBtn>
            </div>
          </div>
        </div>
      </section>

      {/* Right: details */}
      <aside className="panel panel--right">
        <div className="details">
          <div className="details__title">Case Details</div>
          {!selected ? (
            <LoadingLine text="Select a case..." />
          ) : (
            <>
              <div className="details__hero">
                <div className="avatar avatar--lg" aria-hidden />
                <div>
                  <div className="details__name">{selected.case_number}</div>
                  <div className="mutedSmall">{selected.client_name}</div>
                </div>
              </div>

              <DetailRow label="Reference" value={selected.reference_number || "-"} />
              <DetailRow label="Status" value={<Pill tone={selected.status === "Completed" ? "lead" : "active"}>{selected.status || "Open"}</Pill>} />
              <DetailRow label="Case Date" value={formatDate(selected.case_date)} />
              <DetailRow label="Due Date" value={formatDate(selected.due_date)} />
              <DetailRow label="Notes" value={selected.notes || "-"} />

              <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                <button className="btn btn--primary" onClick={openSelected}>Open</button>
              </div>
            </>
          )}
        </div>
      </aside>

      {isModalOpen && (
        <Modal title="Add Case" onClose={() => setIsModalOpen(false)}>
          <form
            className="form"
            onSubmit={(e) => { e.preventDefault(); save(); }}
          >
            <FormRow label="Case Number">
              <input
                value={draft.case_number}
                onChange={(e) => setDraft((s) => ({ ...s, case_number: e.target.value }))}
              />
            </FormRow>
            <FormRow label="Client Name">
              <input
                value={draft.client_name}
                onChange={(e) => setDraft((s) => ({ ...s, client_name: e.target.value }))}
              />
            </FormRow>
            <FormRow label="Reference Number">
              <input
                value={draft.reference_number}
                onChange={(e) => setDraft((s) => ({ ...s, reference_number: e.target.value }))}
              />
            </FormRow>
            <FormRow label="Case Date">
              <input
                type="date"
                value={draft.case_date}
                onChange={(e) => setDraft((s) => ({ ...s, case_date: e.target.value }))}
              />
            </FormRow>
            <FormRow label="Notes">
              <textarea
                rows={3}
                value={draft.notes}
                onChange={(e) => setDraft((s) => ({ ...s, notes: e.target.value }))}
              />
            </FormRow>

            {formErr && <div className="errorBox">{formErr}</div>}

            <div className="modalActions">
              <button type="button" className="btn" onClick={() => setIsModalOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn--primary">Save</button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
