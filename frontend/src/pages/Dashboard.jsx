import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { ErrorBox, IconBtn, KpiCard, LoadingLine, Pill, DetailRow, Modal, FormRow } from "../ui/components.jsx";

export default function Dashboard({ topSearch }) {
  const [metrics, setMetrics] = useState(null);

  const [cases, setCases] = useState([]);
  const [casesQ, setCasesQ] = useState("");
  const [casesErr, setCasesErr] = useState("");

  const [customers, setCustomers] = useState([]);
  const [custErr, setCustErr] = useState("");

  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) || customers[0] || null,
    [customers, selectedCustomerId]
  );

  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [customerFormErr, setCustomerFormErr] = useState("");
  const [customerDraft, setCustomerDraft] = useState(null);

  async function loadMetrics() {
    try {
      const m = await api("/api/dashboard/metrics");
      setMetrics(m);
    } catch (e) {
      // metrics failure shouldn't break whole page
      setMetrics({ totalCustomers: 0, activeCases: 0, completedCases: 0, _err: e.message });
    }
  }

  async function loadCases() {
    setCasesErr("");
    try {
      const data = await api(`/api/cases${casesQ ? `?q=${encodeURIComponent(casesQ)}` : ""}`);
      setCases(data);
    } catch (e) {
      setCasesErr(e.message);
    }
  }

  async function loadCustomers() {
    setCustErr("");
    try {
      const q = topSearch?.trim() ? `?q=${encodeURIComponent(topSearch.trim())}` : "";
      const data = await api(`/api/customers${q}`);
      setCustomers(data);
      if (data?.length && selectedCustomerId == null) setSelectedCustomerId(data[0].id);
      if (data?.length && selectedCustomerId != null && !data.find((x) => x.id === selectedCustomerId)) {
        setSelectedCustomerId(data[0].id);
      }
    } catch (e) {
      setCustErr(e.message);
    }
  }

  useEffect(() => {
    loadMetrics();
    loadCases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topSearch]);

  function openEditCustomer(cust) {
    setCustomerFormErr("");
    setCustomerDraft({
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
    setIsCustomerModalOpen(true);
  }

  async function saveCustomer() {
    setCustomerFormErr("");
    try {
      if (!customerDraft.customer_id || !customerDraft.name) {
        setCustomerFormErr("Customer ID and Name are required.");
        return;
      }

      if (customerDraft.id) {
        await api(`/api/customers/${customerDraft.id}`, { method: "PUT", body: customerDraft });
      } else {
        await api(`/api/customers`, { method: "POST", body: customerDraft });
      }

      setIsCustomerModalOpen(false);
      await loadCustomers();
      await loadMetrics();
    } catch (e) {
      setCustomerFormErr(e.message);
    }
  }

  const totalCustomers = metrics?.totalCustomers ?? 0;
  const activeCases = metrics?.activeCases ?? 0;
  const completedCases = metrics?.completedCases ?? 0;

  return (
    <main className="grid">
      {/* Left: Cases */}
      <section className="panel panel--left">
        <div className="panel__header">
          <div className="panel__title">Cases</div>
          <IconBtn title="Refresh" onClick={loadCases}>↻</IconBtn>
        </div>

        <div className="panel__search">
          <span className="search__icon" aria-hidden>⌕</span>
          <input
            value={casesQ}
            onChange={(e) => setCasesQ(e.target.value)}
            placeholder="Search cases..."
            onKeyDown={(e) => e.key === "Enter" && loadCases()}
          />
          <IconBtn title="Search" onClick={loadCases}>↵</IconBtn>
        </div>

        {casesErr && <ErrorBox error={casesErr} />}

        <div className="caseList">
          {cases.map((c) => (
            <div key={c.id} className="caseRow">
              <span className={`dot ${c.status === "Completed" ? "dot--lead" : "dot--active"}`} />
              <div className="caseRow__text">
                <div className="caseRow__id">{c.case_number}</div>
                <div className="caseRow__title">{c.client_name}</div>
              </div>
            </div>
          ))}
          {!cases.length && !casesErr && <div className="muted">No cases.</div>}
        </div>
      </section>

      {/* Middle: KPIs + Customers table */}
      <section className="panel panel--mid">
        <div className="kpis">
          <KpiCard icon="👤" title="Total Customers" value={Number(totalCustomers).toLocaleString()} />
          <KpiCard icon="✓" title="Active Cases" value={Number(activeCases).toLocaleString()} />
          <KpiCard icon="🏁" title="Completed" value={Number(completedCases).toLocaleString()} />
        </div>

        <div className="card">
          <div className="card__header">
            <div className="card__title">Customer List</div>
            <div className="card__tools">
              <IconBtn title="Add Customer" onClick={() => openEditCustomer(null)}>＋</IconBtn>
              <IconBtn title="Refresh" onClick={loadCustomers}>↻</IconBtn>
              <IconBtn title="Edit Selected" onClick={() => selectedCustomer && openEditCustomer(selectedCustomer)}>✎</IconBtn>
            </div>
          </div>

          {custErr && <ErrorBox error={custErr} />}
          {!custErr && !customers && <LoadingLine />}

          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 140 }}>Customer ID</th>
                  <th>Name</th>
                  <th style={{ width: 140 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr
                    key={c.id}
                    className={c.id === selectedCustomerId ? "row--active" : ""}
                    onClick={() => setSelectedCustomerId(c.id)}
                  >
                    <td className="mono">{c.customer_id}</td>
                    <td>{c.name}</td>
                    <td><Pill tone={c.status === "Active" ? "active" : "lead"}>{c.status || "Active"}</Pill></td>
                  </tr>
                ))}
                {!customers.length && !custErr && (
                  <tr>
                    <td colSpan={3} className="muted">No customers yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pager">
            <div className="pager__left">
              <span className="mutedSmall">Showing {customers.length} customers</span>
            </div>
            <div className="pager__right">
              <IconBtn title="Prev" onClick={() => {}}>‹</IconBtn>
              <IconBtn title="Next" onClick={() => {}}>›</IconBtn>
            </div>
          </div>
        </div>
      </section>

      {/* Right: Details */}
      <aside className="panel panel--right">
        <div className="details">
          <div className="details__title">Customer Details</div>

          {!selectedCustomer ? (
            <LoadingLine text="Select a customer..." />
          ) : (
            <>
              <div className="details__hero">
                <div className="avatar avatar--lg" aria-hidden />
                <div>
                  <div className="details__name">{selectedCustomer.name}</div>
                </div>
              </div>

              <DetailRow label="Contact" value={selectedCustomer.contact_person || "—"} />
              <DetailRow label="Email" value={selectedCustomer.email || "—"} />
              <DetailRow label="Phone" value={selectedCustomer.phone || "—"} />
              <DetailRow label="Status" value={<Pill tone={selectedCustomer.status === "Active" ? "active" : "lead"}>{selectedCustomer.status || "Active"}</Pill>} />
              <DetailRow label="Segment" value={selectedCustomer.segment || "—"} />
              <DetailRow label="Owner" value={<b>{selectedCustomer.owner || "—"}</b>} />
              <DetailRow label="Notes" value={selectedCustomer.notes || "—"} />

              <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                <button className="btn" onClick={() => openEditCustomer(selectedCustomer)}>Edit</button>
                <button className="btn btn--primary" onClick={() => openEditCustomer(null)}>Add</button>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Customer modal */}
      {isCustomerModalOpen && (
        <Modal title={customerDraft?.id ? "Edit Customer" : "Add Customer"} onClose={() => setIsCustomerModalOpen(false)}>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              saveCustomer();
            }}
          >
            <FormRow label="Customer ID">
              <input
                value={customerDraft.customer_id}
                onChange={(e) => setCustomerDraft((s) => ({ ...s, customer_id: e.target.value }))}
              />
            </FormRow>
            <FormRow label="Customer Name">
              <input
                value={customerDraft.name}
                onChange={(e) => setCustomerDraft((s) => ({ ...s, name: e.target.value }))}
              />
            </FormRow>
            <FormRow label="Contact Person">
              <input
                value={customerDraft.contact_person}
                onChange={(e) => setCustomerDraft((s) => ({ ...s, contact_person: e.target.value }))}
              />
            </FormRow>
            <FormRow label="Email">
              <input
                value={customerDraft.email}
                onChange={(e) => setCustomerDraft((s) => ({ ...s, email: e.target.value }))}
              />
            </FormRow>
            <FormRow label="Phone">
              <input
                value={customerDraft.phone}
                onChange={(e) => setCustomerDraft((s) => ({ ...s, phone: e.target.value }))}
              />
            </FormRow>
            <FormRow label="Status">
              <select
                value={customerDraft.status}
                onChange={(e) => setCustomerDraft((s) => ({ ...s, status: e.target.value }))}
              >
                <option>Active</option>
                <option>Lead</option>
                <option>Inactive</option>
              </select>
            </FormRow>
            <FormRow label="Segment">
              <input
                value={customerDraft.segment}
                onChange={(e) => setCustomerDraft((s) => ({ ...s, segment: e.target.value }))}
              />
            </FormRow>
            <FormRow label="Owner">
              <input
                value={customerDraft.owner}
                onChange={(e) => setCustomerDraft((s) => ({ ...s, owner: e.target.value }))}
              />
            </FormRow>
            <FormRow label="Notes">
              <textarea
                rows={3}
                value={customerDraft.notes}
                onChange={(e) => setCustomerDraft((s) => ({ ...s, notes: e.target.value }))}
              />
            </FormRow>

            {customerFormErr && <div className="errorBox">{customerFormErr}</div>}

            <div className="modalActions">
              <button type="button" className="btn" onClick={() => setIsCustomerModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary">
                Save
              </button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
