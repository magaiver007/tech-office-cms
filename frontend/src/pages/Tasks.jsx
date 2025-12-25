import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { ErrorBox, IconBtn, Modal, FormRow } from "../ui/components.jsx";

import enUS from "date-fns/locale/en-US";

const locales = {
  "en-US": enUS
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales
});

function toDateSafe(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [cases, setCases] = useState([]);
  const [err, setErr] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [draft, setDraft] = useState({
    title: "",
    start_iso: "",
    end_iso: "",
    notes: ""
  });

  async function load() {
    setErr("");
    try {
      const [t, c] = await Promise.all([api("/api/tasks"), api("/api/cases")]);
      setTasks(t);
      setCases(c);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => { load(); }, []);

  const events = useMemo(() => {
    const taskEvents = tasks
      .map((t) => ({
        id: `task-${t.id}`,
        title: `Task: ${t.title}`,
        start: toDateSafe(t.start_iso),
        end: toDateSafe(t.end_iso),
        resource: { type: "task", raw: t }
      }))
      .filter((e) => e.start && e.end);

    const pendingCaseEvents = cases
      .filter((c) => c.status !== "Completed" && c.due_date)
      .map((c) => {
        // due_date is a date string; show as 09:00-10:00 local
        const start = new Date(`${c.due_date}T09:00:00`);
        const end = new Date(`${c.due_date}T10:00:00`);
        return {
          id: `case-${c.id}`,
          title: `Pending: ${c.case_number} - ${c.client_name}`,
          start,
          end,
          resource: { type: "case", raw: c }
        };
      })
      .filter((e) => !Number.isNaN(e.start.getTime()) && !Number.isNaN(e.end.getTime()));

    return [...taskEvents, ...pendingCaseEvents];
  }, [tasks, cases]);

  function onSelectSlot(slot) {
    // slot.start/slot.end are Dates from calendar selection
    const start = slot.start;
    const end = slot.end;

    setFormErr("");
    setDraft({
      title: "",
      start_iso: start.toISOString(),
      end_iso: end.toISOString(),
      notes: ""
    });
    setIsModalOpen(true);
  }

  async function saveTask() {
    setFormErr("");
    try {
      if (!draft.title.trim()) return setFormErr("Title is required.");
      if (!draft.start_iso || !draft.end_iso) return setFormErr("Start and end are required.");

      await api("/api/tasks", { method: "POST", body: draft });
      setIsModalOpen(false);
      await load();
    } catch (e) {
      setFormErr(e.message);
    }
  }

  return (
    <main className="grid tasksGrid">
      {/* Left: controls */}
      <section className="panel panel--left">
        <div className="panel__header">
          <div className="panel__title">Tasks</div>
          <IconBtn title="Refresh" onClick={load}>↻</IconBtn>
        </div>

        <div style={{ padding: 12, display: "grid", gap: 10 }}>
          <button className="btn btn--primary" onClick={() => setIsModalOpen(true)}>Add Task</button>
          <div className="mutedSmall">
            Tip: drag on the calendar to create a task time block.
          </div>
          <div className="mutedSmall">
            Pending cases appear on their <b>due_date</b>.
          </div>
        </div>

        {err && <ErrorBox error={err} />}
      </section>

      {/* Middle: calendar */}
      <section className="panel panel--mid tasksMid">
        <div className="card" style={{ height: "100%" }}>
          <div className="card__header">
            <div className="card__title">Calendar</div>
            <div className="card__tools">
              <IconBtn title="Add Task" onClick={() => setIsModalOpen(true)}>＋</IconBtn>
            </div>
          </div>

          <div className="calendarWrap">
            <Calendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              selectable
              onSelectSlot={onSelectSlot}
              style={{ height: "100%" }}
            />
          </div>
        </div>
      </section>

      {/* Right: list */}
      <aside className="panel panel--right">
        <div className="details">
          <div className="details__title">Upcoming</div>

          <div className="mutedSmall" style={{ marginBottom: 8 }}>Tasks</div>
          <div className="miniList">
            {tasks.slice(0, 12).map((t) => (
              <div className="miniRow" key={t.id}>
                <div className="miniTitle">{t.title}</div>
                <div className="miniMeta">{new Date(t.start_iso).toLocaleString()}</div>
              </div>
            ))}
            {!tasks.length && <div className="mutedSmall">No tasks.</div>}
          </div>

          <div className="mutedSmall" style={{ margin: "14px 0 8px" }}>Pending Cases</div>
          <div className="miniList">
            {cases
              .filter((c) => c.status !== "Completed" && c.due_date)
              .slice(0, 12)
              .map((c) => (
                <div className="miniRow" key={c.id}>
                  <div className="miniTitle">{c.case_number} — {c.client_name}</div>
                  <div className="miniMeta">Due: {c.due_date}</div>
                </div>
              ))}
            {!cases.some((c) => c.status !== "Completed" && c.due_date) && (
              <div className="mutedSmall">No pending cases with due dates.</div>
            )}
          </div>
        </div>
      </aside>

      {/* Add Task modal */}
      {isModalOpen && (
        <Modal title="Add Task" onClose={() => setIsModalOpen(false)}>
          <form className="form" onSubmit={(e) => { e.preventDefault(); saveTask(); }}>
            <FormRow label="Title">
              <input value={draft.title} onChange={(e) => setDraft((s) => ({ ...s, title: e.target.value }))} />
            </FormRow>

            <FormRow label="Start">
              <input
                type="datetime-local"
                value={draft.start_iso ? draft.start_iso.slice(0, 16) : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setDraft((s) => ({ ...s, start_iso: v ? new Date(v).toISOString() : "" }));
                }}
              />
            </FormRow>

            <FormRow label="End">
              <input
                type="datetime-local"
                value={draft.end_iso ? draft.end_iso.slice(0, 16) : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setDraft((s) => ({ ...s, end_iso: v ? new Date(v).toISOString() : "" }));
                }}
              />
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
