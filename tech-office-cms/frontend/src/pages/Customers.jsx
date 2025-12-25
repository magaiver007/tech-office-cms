import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { DetailRow, ErrorBox, IconBtn, LoadingLine, Modal, FormRow, Pill } from "../ui/components.jsx";

export default function Customers({ topSearch }) {
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
      const data = await api(`/api/customers${q}`);
      setRows(data);
      if (data?.length && selectedId == null) setSelectedId(data[0].id);
      if (data?.length && selectedId != null && !data.find((x) => x.id === selectedId)) setSelectedId(data[0].id);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [topSearch]);

  function open(cust) {
    setFormErr("");
    setDraft({
      id: cust?.id,
      customer_id: cust?.customer_id || "",
      name: cust?.name || "",
      contact_person: cust?.contact_person || "",
      email: cust?.email || "",
      phone: cust?.phone || "",
      status: cust?.status || "Active",
      segment: cust?.segment || "",
      owner: cust?.owner || "",
      notes: cust?.notes || ""
    });
    setIsModalOpen(true);
  }

  async function save() {
    setFormErr("");
    try {
      if (!draft.customer_id || !draft.name) {
        setFormErr("Customer ID and Name are required.");
        return;
      }

      if (draft.id) {
        await api(`/api/customers/${draft.id}`, { method: "PUT", body: draft });
      } else {
        await api(`/api/customers`, { method: "POST", body: draft });
      }

      setIsModalOpen(false);
      await load();
    } catch (e) {
      setFormErr(e.message);
    }
  }

  return (
    <main className="grid">
      {/* Left: small nav */}
      <section className="panel panel--left">
        <div className="panel__header">
          <div className="panel__title">Customers</div>
          <IconBtn title="Refresh" onClick={load}>↻</IconBtn>
        </div>
        <div className="mutedSmall" style={{ padding: 12 }}>
          Search is in the top bar.
        </div>
        <div style={{ padding: 12 }}>
          <button className="btn btn--primary" onClick={() => open(null)}>Add Customer</button>
        </div>
      </section>

      {/* Middle: table */}
      <section className="panel panel--mid">
        <div className="card">
          <div className="card__header">
            <div className="card__title">All Customers</div>
            <div className="card__tools">
              <IconBtn title="Add" onClick={() => open(null)}>＋</IconBtn>
              <IconBtn title="Edit Selected" onClick={() => selected && open(selected)}>✎</IconBtn>
            </div>
          </div>

          {err && <ErrorBox error={err} />}
          {!err && !rows && <LoadingLine />}

          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 140 }}>Customer ID</th>
                  <th>Name</th>
                  <th style={{ width: 180 }}>Contact</th>
                  <th style={{ width: 140 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr
                    key={c.id}
                    className={c.id === selectedId ? "row--active" : ""}
                    onClick={() => setSelectedId(c.id)}
                  >
                    <td className="mono">{c.customer_id}</td>
                    <td>{c.name}</td>
                    <td>{c.contact_person || "—"}</td>
                    <td><Pill tone={c.status === "Active" ? "active" : "lead"}>{c.status || "Active"}</Pill></td>
                  </tr>
                ))}
                {!rows.length && !err && (
                  <tr><td colSpan={4} className="muted">No customers.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pager">
            <div className="pager__left">
              <span className="mutedSmall">Showing {rows.length} customers</span>
            </div>
            <div className="pager__right">
              <IconBtn title="Prev" onClick={() => {}}>‹</IconBtn>
              <IconBtn title="Next" onClick={() => {}}>›</IconBtn>
            </div>
          </div>
        </div>
      </section>

      {/* Right: details */}
      <aside className="panel panel--right">
        <div className="details">
          <div className="details__title">Customer Details</div>
          {!selected ? (
            <LoadingLine text="Select a customer..." />
          ) : (
            <>
              <div className="details__hero">
                <div className="avatar avatar--lg" aria-hidden />
                <div>
                  <div className="details__name">{selected.name}</div>
                </div>
              </div>

              <DetailRow label="Customer ID" value={<span className="mono">{selected.customer_id}</span>} />
              <DetailRow label="Contact" value={selected.contact_person || "—"} />
              <DetailRow label="Email" value={selected.email || "—"} />
              <DetailRow label="Phone" value={selected.phone || "—"} />
              <DetailRow label="Status" value={<Pill tone={selected.status === "Active" ? "active" : "lead"}>{selected.status || "Active"}</Pill>} />
              <DetailRow label="Segment" value={selected.segment || "—"} />
              <DetailRow label="Owner" value={<b>{selected.owner || "—"}</b>} />
              <DetailRow label="Notes" value={selected.notes || "—"} />

              <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                <button className="btn" onClick={() => open(selected)}>Edit</button>
                <button className="btn btn--primary" onClick={() => open(null)}>Add</button>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Modal */}
      {isModalOpen && (
        <Modal title={draft?.id ? "Edit Customer" : "Add Customer"} onClose={() => setIsModalOpen(false)}>
          <form
            className="form"
            onSubmit={(e) => { e.preventDefault(); save(); }}
          >
            <FormRow label="Customer ID">
              <input value={draft.customer_id} onChange={(e) => setDraft((s) => ({ ...s, customer_id: e.target.value }))} />
            </FormRow>
            <FormRow label="Customer Name">
              <input value={draft.name} onChange={(e) => setDraft((s) => ({ ...s, name: e.target.value }))} />
            </FormRow>
            <FormRow label="Contact Person">
              <input value={draft.contact_person} onChange={(e) => setDraft((s) => ({ ...s, contact_person: e.target.value }))} />
            </FormRow>
            <FormRow label="Email">
              <input value={draft.email} onChange={(e) => setDraft((s) => ({ ...s, email: e.target.value }))} />
            </FormRow>
            <FormRow label="Phone">
              <input value={draft.phone} onChange={(e) => setDraft((s) => ({ ...s, phone: e.target.value }))} />
            </FormRow>
            <FormRow label="Status">
              <select value={draft.status} onChange={(e) => setDraft((s) => ({ ...s, status: e.target.value }))}>
                <option>Active</option>
                <option>Lead</option>
                <option>Inactive</option>
              </select>
            </FormRow>
            <FormRow label="Segment">
              <input value={draft.segment} onChange={(e) => setDraft((s) => ({ ...s, segment: e.target.value }))} />
            </FormRow>
            <FormRow label="Owner">
              <input value={draft.owner} onChange={(e) => setDraft((s) => ({ ...s, owner: e.target.value }))} />
            </FormRow>
            <FormRow label="Notes">
              <textarea rows={3} value={draft.notes} onChange={(e) => setDraft((s) => ({ ...s, notes: e.target.value }))} />
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
