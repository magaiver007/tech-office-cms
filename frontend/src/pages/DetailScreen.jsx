import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { ErrorBox, LoadingLine, Pill, DetailRow, Modal, FormRow, IconBtn } from "../ui/components.jsx";

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

export default function DetailScreen({ type }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  const [files, setFiles] = useState([]);
  const [fileErr, setFileErr] = useState("");
  const [fileBusy, setFileBusy] = useState(false);

  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [allCustomers, setAllCustomers] = useState([]);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);
  const [pickerErr, setPickerErr] = useState("");

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskErr, setTaskErr] = useState("");
  const [taskDraft, setTaskDraft] = useState({
    title: "",
    start_iso: "",
    end_iso: "",
    notes: ""
  });

  const [diavgeiaLinks, setDiavgeiaLinks] = useState([]);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkSearchQuery, setLinkSearchQuery] = useState("");
  const [linkSearchResults, setLinkSearchResults] = useState([]);
  const [linkErr, setLinkErr] = useState("");
  const [linking, setLinking] = useState(false);

  const [autoSearchResults, setAutoSearchResults] = useState([]);
  const [autoSearchLoading, setAutoSearchLoading] = useState(false);
  const [autoSearchErr, setAutoSearchErr] = useState("");

  const isCase = type === "case";

  async function loadDetails() {
    setLoading(true);
    setErr("");
    try {
      if (isCase) {
        const details = await api(`/api/cases/${id}/details`);
        setData(details);
      } else {
        const details = await api(`/api/customers/${id}/details`);
        setData(details);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadFiles() {
    if (!isCase) return;
    setFileErr("");
    setFileBusy(true);
    try {
      const result = await api(`/api/cases/${id}/files`);
      setFiles(result.items || []);
    } catch (e) {
      setFileErr(e.message);
    } finally {
      setFileBusy(false);
    }
  }

  async function ensureFolder() {
    if (!isCase) return;
    setFileErr("");
    setFileBusy(true);
    try {
      await api(`/api/cases/${id}/files/ensure-folder`, { method: "POST" });
      await loadFiles();
    } catch (e) {
      setFileErr(e.message);
    } finally {
      setFileBusy(false);
    }
  }

  async function uploadOne(file) {
    if (!isCase) return;
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
    window.open(`http://localhost:4000/api/cases/${id}/files/download?name=${encodeURIComponent(name)}`, "_blank");
  }

  async function openCustomerPicker() {
    if (!isCase) return;
    setPickerErr("");
    setCustomerPickerOpen(true);
    try {
      const list = await api("/api/customers");
      setAllCustomers(list);
      const current = (data?.customers || []).map((c) => c.id);
      setSelectedCustomerIds(current);
    } catch (e) {
      setPickerErr(e.message);
    }
  }

  async function saveCustomerLinks() {
    setPickerErr("");
    try {
      await api(`/api/cases/${id}/customers`, {
        method: "PUT",
        body: { customer_ids: selectedCustomerIds }
      });
      setCustomerPickerOpen(false);
      await loadDetails();
    } catch (e) {
      setPickerErr(e.message);
    }
  }

  function toggleCustomer(idValue) {
    setSelectedCustomerIds((prev) => {
      if (prev.includes(idValue)) return prev.filter((x) => x !== idValue);
      return [...prev, idValue];
    });
  }

  function openTaskModal() {
    const start = new Date();
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    setTaskErr("");
    setTaskDraft({
      title: "",
      start_iso: start.toISOString().slice(0, 16),
      end_iso: end.toISOString().slice(0, 16),
      notes: ""
    });
    setTaskModalOpen(true);
  }

  async function saveTask() {
    setTaskErr("");
    if (!taskDraft.title.trim()) return setTaskErr("Title is required.");
    if (!taskDraft.start_iso || !taskDraft.end_iso) return setTaskErr("Start and end are required.");
    try {
      await api(`/api/cases/${id}/tasks`, {
        method: "POST",
        body: {
          title: taskDraft.title.trim(),
          start_iso: new Date(taskDraft.start_iso).toISOString(),
          end_iso: new Date(taskDraft.end_iso).toISOString(),
          notes: taskDraft.notes || ""
        }
      });
      setTaskModalOpen(false);
      await loadDetails();
    } catch (e) {
      setTaskErr(e.message);
    }
  }

  async function loadDiavgeiaLinks() {
    if (!isCase) return;
    try {
      const links = await api(`/api/cases/${id}/diavgeia-links`);
      setDiavgeiaLinks(links);
    } catch (e) {
      console.error("Failed to load Diavgeia links:", e.message);
    }
  }

  async function openLinkModal() {
    setLinkErr("");
    setLinkSearchQuery("");
    setLinkSearchResults([]);
    setLinkModalOpen(true);
  }

  async function searchDecisions() {
    if (!linkSearchQuery.trim()) {
      setLinkErr("Please enter search terms or ADA");
      return;
    }

    setLinkErr("");
    setLinking(true);
    try {
      const params = new URLSearchParams({ q: linkSearchQuery.trim() });
      const result = await api(`/api/diavgeia/search?${params.toString()}`);
      setLinkSearchResults(result.decisions || []);
      if (!result.decisions?.length) {
        setLinkErr("No decisions found. Try fetching by ADA in Diavgeia tab first.");
      }
    } catch (e) {
      setLinkErr(e.message);
    } finally {
      setLinking(false);
    }
  }

  async function linkDecision(decisionAda) {
    setLinkErr("");
    try {
      await api(`/api/cases/${id}/diavgeia-links`, {
        method: "POST",
        body: { decision_ada: decisionAda }
      });
      setLinkModalOpen(false);
      await loadDiavgeiaLinks();
    } catch (e) {
      setLinkErr(e.message);
    }
  }

  async function unlinkDecision(linkId) {
    try {
      await api(`/api/cases/${id}/diavgeia-links/${linkId}`, { method: "DELETE" });
      await loadDiavgeiaLinks();
    } catch (e) {
      alert(`Failed to remove link: ${e.message}`);
    }
  }

  async function autoSearchDiavgeia(clientName) {
    if (!clientName || !isCase) return;

    setAutoSearchLoading(true);
    setAutoSearchErr("");
    setAutoSearchResults([]);

    try {
      const params = new URLSearchParams();
      params.append("q", clientName);
      params.append("org", "ΥΠΟΥΡΓΕΙΟ ΠΕΡΙΒΑΛΛΟΝΤΟΣ ΚΑΙ ΕΝΕΡΓΕΙΑΣ");
      params.append("size", "10");
      params.append("refresh", "true"); // Fetch from API

      const result = await api(`/api/diavgeia/search?${params.toString()}`);
      setAutoSearchResults(result.decisions || []);
    } catch (e) {
      setAutoSearchErr(e.message);
    } finally {
      setAutoSearchLoading(false);
    }
  }

  useEffect(() => {
    loadDetails();
  }, [type, id]);

  useEffect(() => {
    if (isCase) {
      loadFiles();
      loadDiavgeiaLinks();
    }
  }, [type, id]);

  useEffect(() => {
    if (isCase && data?.case?.client_name) {
      autoSearchDiavgeia(data.case.client_name);
    }
  }, [isCase, data?.case?.client_name]);

  const caseRow = data?.case || null;
  const customerRow = data?.customer || null;

  const caseTitle = useMemo(() => {
    if (!caseRow) return "Case";
    return `${caseRow.case_number} - ${caseRow.client_name}`;
  }, [caseRow]);

  const customerTitle = useMemo(() => {
    if (!customerRow) return "Customer";
    return `${customerRow.customer_id} - ${customerRow.name}`;
  }, [customerRow]);

  return (
    <main className="detailScreen">
      <div className="detailHeader">
        <button className="btn btn--ghost" onClick={() => navigate(-1)}>Back</button>
        <div className="detailHeader__title">
          {isCase ? "Case Overview" : "Customer Overview"}
        </div>
      </div>

      {loading && <LoadingLine text="Loading details..." />}
      {err && <ErrorBox error={err} />}

      {!loading && !err && isCase && caseRow && (
        <div className="detailGrid">
          <section className="panel detailPanel">
            <div className="panel__header">
              <div className="panel__title">{caseTitle}</div>
              <div className="detailHeader__actions">
                <IconBtn title="Refresh" onClick={loadDetails}>?</IconBtn>
                <button className="btn btn--ghost" onClick={openCustomerPicker}>Link Customers</button>
                <button className="btn btn--ghost" onClick={openLinkModal}>Link Diavgeia Decision</button>
                <button className="btn btn--primary" onClick={openTaskModal}>Add Task</button>
              </div>
            </div>

            <div className="details">
              <DetailRow label="Status" value={<Pill tone={caseRow.status === "Completed" ? "lead" : "active"}>{caseRow.status || "Open"}</Pill>} />
              <DetailRow label="Reference" value={caseRow.reference_number || "-"} />
              <DetailRow label="Case Date" value={formatDate(caseRow.case_date)} />
              <DetailRow label="Due Date" value={formatDate(caseRow.due_date)} />
              <DetailRow label="Created" value={formatDateTime(caseRow.created_at)} />
              <DetailRow label="Updated" value={formatDateTime(caseRow.updated_at)} />
              <DetailRow label="Notes" value={caseRow.notes || "-"} />
              <DetailRow label="NAS Folder" value={caseRow.nas_folder_path || "-"} />
            </div>

            <div className="detailSection">
              <div className="detailSection__title">Linked Customers</div>
              <div className="chipList">
                {(data?.customers || []).map((c) => (
                  <span key={c.id} className="chip">{c.name}</span>
                ))}
                {!data?.customers?.length && <span className="mutedSmall">No customers linked yet.</span>}
              </div>
            </div>

            <div className="detailSection">
              <div className="detailSection__title">Case History</div>
              <div className="historyList">
                {(data?.tasks || []).map((t) => (
                  <div key={t.id} className="historyRow">
                    <div className="historyRow__title">{t.title}</div>
                    <div className="historyRow__meta">{formatDateTime(t.start_iso)} - {formatDateTime(t.end_iso)}</div>
                    {t.notes && <div className="historyRow__notes">{t.notes}</div>}
                  </div>
                ))}
                {!data?.tasks?.length && <div className="mutedSmall">No tasks recorded for this case yet.</div>}
              </div>
            </div>

            <div className="detailSection">
              <div className="detailSection__title">Linked Diavgeia Decisions</div>
              <div className="historyList">
                {diavgeiaLinks.map((link) => (
                  <div key={link.id} className="historyRow">
                    <div className="historyRow__title">
                      <span className="mono">{link.ada}</span> - {link.subject || "No subject"}
                    </div>
                    <div className="historyRow__meta">
                      Issue Date: {formatDate(link.issue_date)} | Organization: {link.organization_id || "-"}
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => window.open(`https://diavgeia.gov.gr/decision/view/${link.ada}`, "_blank")}
                      >
                        View on Diavgeia
                      </button>
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => unlinkDecision(link.id)}
                      >
                        Remove Link
                      </button>
                    </div>
                  </div>
                ))}
                {!diavgeiaLinks.length && (
                  <div className="mutedSmall">No Diavgeia decisions linked to this case yet.</div>
                )}
              </div>
            </div>

            <div className="detailSection">
              <div className="detailSection__title">
                Related Decisions from ΥΠΟΥΡΓΕΙΟ ΠΕΡΙΒΑΛΛΟΝΤΟΣ ΚΑΙ ΕΝΕΡΓΕΙΑΣ
              </div>
              {autoSearchLoading && <LoadingLine text="Searching Diavgeia..." />}
              {autoSearchErr && <ErrorBox error={autoSearchErr} />}

              {!autoSearchLoading && !autoSearchErr && (
                <div className="historyList">
                  {autoSearchResults.map((decision) => (
                    <div key={decision.ada} className="historyRow">
                      <div className="historyRow__title">
                        <span className="mono">{decision.ada}</span> - {decision.subject || "No subject"}
                      </div>
                      <div className="historyRow__meta">
                        Issue Date: {formatDate(decision.issue_date)} | Type: {decision.decision_type_id || "-"}
                      </div>
                      <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                        <button
                          className="btn btn--ghost btn--sm"
                          onClick={() => window.open(`https://diavgeia.gov.gr/decision/view/${decision.ada}`, "_blank")}
                        >
                          View on Diavgeia
                        </button>
                        <button
                          className="btn btn--primary btn--sm"
                          onClick={() => linkDecision(decision.ada)}
                        >
                          Link to Case
                        </button>
                      </div>
                    </div>
                  ))}
                  {!autoSearchResults.length && !autoSearchLoading && (
                    <div className="mutedSmall">
                      No decisions found from Ministry of Environment and Energy for "{caseRow?.client_name}".
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          <aside className="panel detailPanel">
            <div className="panel__header">
              <div className="panel__title">Case Files</div>
              <div className="detailHeader__actions">
                <IconBtn title="Refresh" onClick={loadFiles}>?</IconBtn>
                <button className="btn btn--ghost" onClick={ensureFolder} disabled={fileBusy}>Create Folder</button>
              </div>
            </div>
            <div className="details">
              <div className="fileControls">
                <input
                  type="file"
                  onChange={(e) => e.target.files?.[0] && uploadOne(e.target.files[0])}
                />
                <button className="btn btn--ghost" onClick={loadFiles} disabled={fileBusy}>Refresh</button>
              </div>
              {fileErr && <ErrorBox error={fileErr} />}
              <div className="fileList">
                {files.map((f) => (
                  <div className="fileRow" key={f.name}>
                    <div className="fileRow__name">{f.name}</div>
                    <button className="btn btn--ghost" onClick={() => download(f.name)}>Download</button>
                  </div>
                ))}
                {!files.length && !fileErr && (
                  <div className="mutedSmall">No files yet. Click "Create Folder" to initialize.</div>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}

      {!loading && !err && !isCase && customerRow && (
        <div className="detailGrid">
          <section className="panel detailPanel">
            <div className="panel__header">
              <div className="panel__title">{customerTitle}</div>
              <IconBtn title="Refresh" onClick={loadDetails}>?</IconBtn>
            </div>

            <div className="details">
              <DetailRow label="Contact" value={customerRow.contact_person || "-"} />
              <DetailRow label="Email" value={customerRow.email || "-"} />
              <DetailRow label="Phone" value={customerRow.phone || "-"} />
              <DetailRow label="Status" value={<Pill tone={customerRow.status === "Active" ? "active" : "lead"}>{customerRow.status || "Active"}</Pill>} />
              <DetailRow label="Segment" value={customerRow.segment || "-"} />
              <DetailRow label="Owner" value={customerRow.owner || "-"} />
              <DetailRow label="Notes" value={customerRow.notes || "-"} />
              <DetailRow label="Created" value={formatDateTime(customerRow.created_at)} />
              <DetailRow label="Updated" value={formatDateTime(customerRow.updated_at)} />
            </div>
          </section>

          <aside className="panel detailPanel">
            <div className="panel__header">
              <div className="panel__title">Related Cases</div>
              <IconBtn title="Refresh" onClick={loadDetails}>?</IconBtn>
            </div>
            <div className="details">
              {(data?.cases || []).map((c) => (
                <div key={c.id} className="caseSummary">
                  <div className="caseSummary__title">{c.case_number} - {c.client_name}</div>
                  <div className="caseSummary__meta">
                    <span>Updated {formatDateTime(c.updated_at)}</span>
                    <Pill tone={c.status === "Completed" ? "lead" : "active"}>{c.status || "Open"}</Pill>
                  </div>
                  <div className="caseSummary__meta">Due {formatDate(c.due_date)}</div>
                </div>
              ))}
              {!data?.cases?.length && <div className="mutedSmall">No cases linked to this customer yet.</div>}
            </div>
          </aside>
        </div>
      )}

      {customerPickerOpen && (
        <Modal title="Link Customers" onClose={() => setCustomerPickerOpen(false)}>
          <div className="pickerList">
            {allCustomers.map((c) => (
              <label className="pickerRow" key={c.id}>
                <input
                  type="checkbox"
                  checked={selectedCustomerIds.includes(c.id)}
                  onChange={() => toggleCustomer(c.id)}
                />
                <span>{c.customer_id} - {c.name}</span>
              </label>
            ))}
            {!allCustomers.length && <div className="mutedSmall">No customers available.</div>}
          </div>
          {pickerErr && <ErrorBox error={pickerErr} />}
          <div className="modalActions">
            <button type="button" className="btn" onClick={() => setCustomerPickerOpen(false)}>Cancel</button>
            <button type="button" className="btn btn--primary" onClick={saveCustomerLinks}>Save Links</button>
          </div>
        </Modal>
      )}

      {taskModalOpen && (
        <Modal title="Add Case Task" onClose={() => setTaskModalOpen(false)}>
          <form className="form" onSubmit={(e) => { e.preventDefault(); saveTask(); }}>
            <FormRow label="Title">
              <input value={taskDraft.title} onChange={(e) => setTaskDraft((s) => ({ ...s, title: e.target.value }))} />
            </FormRow>
            <FormRow label="Start">
              <input
                type="datetime-local"
                value={taskDraft.start_iso}
                onChange={(e) => setTaskDraft((s) => ({ ...s, start_iso: e.target.value }))}
              />
            </FormRow>
            <FormRow label="End">
              <input
                type="datetime-local"
                value={taskDraft.end_iso}
                onChange={(e) => setTaskDraft((s) => ({ ...s, end_iso: e.target.value }))}
              />
            </FormRow>
            <FormRow label="Notes">
              <textarea rows={3} value={taskDraft.notes} onChange={(e) => setTaskDraft((s) => ({ ...s, notes: e.target.value }))} />
            </FormRow>
            {taskErr && <ErrorBox error={taskErr} />}
            <div className="modalActions">
              <button type="button" className="btn" onClick={() => setTaskModalOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn--primary">Save Task</button>
            </div>
          </form>
        </Modal>
      )}

      {linkModalOpen && (
        <Modal title="Link Diavgeia Decision" onClose={() => setLinkModalOpen(false)}>
          <div className="form">
            <FormRow label="Search">
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  placeholder="Search by ADA or subject..."
                  value={linkSearchQuery}
                  onChange={(e) => setLinkSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchDecisions()}
                />
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={searchDecisions}
                  disabled={linking}
                >
                  {linking ? "Searching..." : "Search"}
                </button>
              </div>
            </FormRow>

            <div className="mutedSmall" style={{ marginTop: 8, marginBottom: 8 }}>
              Searches cached decisions. Visit Diavgeia tab to fetch decisions first.
            </div>

            {linkErr && <ErrorBox error={linkErr} />}

            {linkSearchResults.length > 0 && (
              <div className="pickerList" style={{ maxHeight: 300, overflowY: "auto" }}>
                {linkSearchResults.map((d) => (
                  <div key={d.ada} className="pickerRow" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div><strong className="mono">{d.ada}</strong></div>
                      <div className="mutedSmall">{d.subject || "No subject"}</div>
                      <div className="mutedSmall">
                        {formatDate(d.issue_date)} | {d.organization_id || "-"}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => linkDecision(d.ada)}
                    >
                      Link
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="modalActions">
              <button type="button" className="btn" onClick={() => setLinkModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </main>
  );
}
