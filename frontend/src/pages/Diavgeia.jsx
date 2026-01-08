import React, { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { DetailRow, ErrorBox, IconBtn, LoadingLine, Modal, FormRow, Pill } from "../ui/components.jsx";

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

export default function Diavgeia() {
  const [searchParams] = useSearchParams();
  const topSearch = searchParams.get('q') || '';

  const [decisions, setDecisions] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedAda, setSelectedAda] = useState(null);

  const [filters, setFilters] = useState({
    org: "",
    type: "",
    from_date: "",
    to_date: "",
    status: ""
  });

  const [page, setPage] = useState(0);
  const [pageSize] = useState(20);
  const [totalResults, setTotalResults] = useState(0);
  const [source, setSource] = useState("");

  const [fetchModalOpen, setFetchModalOpen] = useState(false);
  const [fetchAda, setFetchAda] = useState("");
  const [fetchErr, setFetchErr] = useState("");
  const [fetching, setFetching] = useState(false);

  const selected = useMemo(
    () => decisions.find((d) => d.ada === selectedAda) || decisions[0] || null,
    [decisions, selectedAda]
  );

  async function loadDecisions(useRefresh = false) {
    setErr("");
    setLoading(true);
    try {
      const params = new URLSearchParams();

      if (topSearch?.trim()) params.append("q", topSearch.trim());
      if (filters.org) params.append("org", filters.org);
      if (filters.type) params.append("type", filters.type);
      if (filters.from_date) params.append("from_date", filters.from_date);
      if (filters.to_date) params.append("to_date", filters.to_date);
      if (filters.status) params.append("status", filters.status);

      params.append("page", page);
      params.append("size", pageSize);
      params.append("refresh", useRefresh ? "true" : "false");

      const result = await api(`/api/diavgeia/search?${params.toString()}`);

      setDecisions(result.decisions || []);
      setTotalResults(result.info?.total || 0);
      setSource(result.info?.source || "api");

      if (result.decisions?.length && !selectedAda) {
        setSelectedAda(result.decisions[0].ada);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDecisions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topSearch, page]);

  async function applyFilters() {
    setPage(0); // Reset to first page
    await loadDecisions();
  }

  async function refresh() {
    await loadDecisions(true);
  }

  function openFetchModal() {
    setFetchErr("");
    setFetchAda("");
    setFetchModalOpen(true);
  }

  async function fetchByAda() {
    if (!fetchAda.trim()) {
      setFetchErr("Please enter an ADA number");
      return;
    }

    setFetchErr("");
    setFetching(true);
    try {
      await api(`/api/diavgeia/fetch/${fetchAda.trim()}`, { method: "POST" });
      setFetchModalOpen(false);
      await loadDecisions();
    } catch (e) {
      setFetchErr(e.message);
    } finally {
      setFetching(false);
    }
  }

  function openDiavgeiaUrl(ada) {
    if (!ada) return;
    window.open(`https://diavgeia.gov.gr/decision/view/${ada}`, "_blank");
  }

  const totalPages = Math.ceil(totalResults / pageSize);

  return (
    <main className="grid">
      {/* Left: filters and actions */}
      <section className="panel panel--left">
        <div className="panel__header">
          <div className="panel__title">Diavgeia</div>
          <IconBtn title="Refresh from API" onClick={refresh}>↻</IconBtn>
        </div>

        <div className="mutedSmall" style={{ padding: 12 }}>
          Search Greek government decisions. Search is in the top bar.
        </div>

        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <button className="btn btn--primary" onClick={openFetchModal}>
            Fetch by ADA
          </button>
          <button className="btn" onClick={() => loadDecisions()}>
            Search Cache
          </button>
          <button className="btn" onClick={refresh}>
            Search API
          </button>
        </div>

        <div className="panel__section">
          <div className="panel__subtitle">Filters</div>
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <FormRow label="Organization">
              <input
                placeholder="Organization ID"
                value={filters.org}
                onChange={(e) => setFilters((f) => ({ ...f, org: e.target.value }))}
              />
            </FormRow>
            <FormRow label="Type">
              <input
                placeholder="Decision Type ID"
                value={filters.type}
                onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
              />
            </FormRow>
            <FormRow label="From Date">
              <input
                type="date"
                value={filters.from_date}
                onChange={(e) => setFilters((f) => ({ ...f, from_date: e.target.value }))}
              />
            </FormRow>
            <FormRow label="To Date">
              <input
                type="date"
                value={filters.to_date}
                onChange={(e) => setFilters((f) => ({ ...f, to_date: e.target.value }))}
              />
            </FormRow>
            <FormRow label="Status">
              <select
                value={filters.status}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="">All</option>
                <option value="PUBLISHED">Published</option>
                <option value="DRAFT">Draft</option>
                <option value="SUSPENDED">Suspended</option>
              </select>
            </FormRow>
            <button className="btn btn--primary" onClick={applyFilters}>
              Apply Filters
            </button>
            <button
              className="btn"
              onClick={() => setFilters({ org: "", type: "", from_date: "", to_date: "", status: "" })}
            >
              Clear Filters
            </button>
          </div>
        </div>
      </section>

      {/* Middle: results table */}
      <section className="panel panel--mid">
        <div className="card">
          <div className="card__header">
            <div className="card__title">
              Decisions {source === "cache" && "(from cache)"}
            </div>
            <div className="card__tools">
              <IconBtn title="Refresh from API" onClick={refresh}>↻</IconBtn>
              <IconBtn title="Fetch by ADA" onClick={openFetchModal}>+</IconBtn>
            </div>
          </div>

          {err && <ErrorBox error={err} />}
          {loading && <LoadingLine text="Loading decisions..." />}

          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 180 }}>ADA</th>
                  <th>Subject</th>
                  <th style={{ width: 140 }}>Issue Date</th>
                  <th style={{ width: 100 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {decisions.map((d) => (
                  <tr
                    key={d.ada}
                    className={d.ada === selectedAda ? "row--active" : ""}
                    onClick={() => setSelectedAda(d.ada)}
                    onDoubleClick={() => openDiavgeiaUrl(d.ada)}
                  >
                    <td className="mono">{d.ada}</td>
                    <td>{d.subject || "-"}</td>
                    <td>{formatDate(d.issue_date)}</td>
                    <td>
                      <Pill tone={d.status === "PUBLISHED" ? "active" : "lead"}>
                        {d.status || "-"}
                      </Pill>
                    </td>
                  </tr>
                ))}
                {!decisions.length && !loading && !err && (
                  <tr>
                    <td colSpan={4} className="muted">
                      No decisions found. Try searching or fetching by ADA.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pager">
            <div className="pager__left">
              <span className="mutedSmall">
                Showing {decisions.length} of {totalResults} results (Page {page + 1} of {totalPages || 1})
              </span>
            </div>
            <div className="pager__right">
              <IconBtn
                title="Previous Page"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                ‹
              </IconBtn>
              <IconBtn
                title="Next Page"
                onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
              >
                ›
              </IconBtn>
            </div>
          </div>
        </div>
      </section>

      {/* Right: decision details */}
      <aside className="panel panel--right">
        <div className="details">
          <div className="details__title">Decision Details</div>
          {!selected ? (
            <LoadingLine text="Select a decision..." />
          ) : (
            <>
              <div className="details__hero">
                <div className="avatar avatar--lg" aria-hidden>📄</div>
                <div>
                  <div className="details__name">{selected.ada}</div>
                  <div className="mutedSmall">{selected.organization_label || selected.organization_id || "-"}</div>
                </div>
              </div>

              <DetailRow label="Subject" value={selected.subject || "-"} />
              <DetailRow label="Protocol" value={selected.protocol_number || "-"} />
              <DetailRow label="Type" value={selected.decision_type_id || "-"} />
              <DetailRow label="Organization" value={selected.organization_id || "-"} />
              <DetailRow label="Issue Date" value={formatDate(selected.issue_date)} />
              <DetailRow
                label="Status"
                value={
                  <Pill tone={selected.status === "PUBLISHED" ? "active" : "lead"}>
                    {selected.status || "-"}
                  </Pill>
                }
              />
              <DetailRow label="Submitter" value={selected.submitter_uid || "-"} />
              <DetailRow label="Unit" value={selected.unit_uid || "-"} />
              <DetailRow label="Last Fetched" value={formatDate(selected.last_fetched_at)} />

              <div style={{ marginTop: 12, display: "flex", gap: 10, flexDirection: "column" }}>
                <button
                  className="btn btn--primary"
                  onClick={() => openDiavgeiaUrl(selected.ada)}
                >
                  View on Diavgeia
                </button>
                {selected.document_url && (
                  <button
                    className="btn"
                    onClick={() => window.open(selected.document_url, "_blank")}
                  >
                    Download PDF
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Fetch by ADA Modal */}
      {fetchModalOpen && (
        <Modal title="Fetch Decision by ADA" onClose={() => setFetchModalOpen(false)}>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              fetchByAda();
            }}
          >
            <FormRow label="ADA Number">
              <input
                placeholder="Enter ADA (e.g., 6ΩΛ546Ψ8ΖΞ-ΤΡ1)"
                value={fetchAda}
                onChange={(e) => setFetchAda(e.target.value)}
                autoFocus
              />
            </FormRow>

            <div className="mutedSmall" style={{ marginTop: 8 }}>
              Fetches the decision from Diavgeia API and caches it locally.
            </div>

            {fetchErr && <ErrorBox error={fetchErr} />}

            <div className="modalActions">
              <button type="button" className="btn" onClick={() => setFetchModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary" disabled={fetching}>
                {fetching ? "Fetching..." : "Fetch"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
