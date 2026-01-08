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

function CalendarToolbar({ label, onNavigate, onView, view, views }) {
  return (
    <div className="rbc-toolbar customToolbar">
      <div className="toolbarNav">
        <button type="button" className="iconBtn" aria-label="Previous" onClick={() => onNavigate("PREV")}>
          ←
        </button>
        <div className="toolbarLabel">{label}</div>
        <button type="button" className="iconBtn" aria-label="Next" onClick={() => onNavigate("NEXT")}>
          →
        </button>
      </div>
      <div className="toolbarViews">
        {(views || ["month", "week", "day"]).map((v) => (
          <button
            key={v}
            type="button"
            className={`btn btn--ghost ${view === v ? "toolbarBtn--active" : ""}`}
            aria-pressed={view === v}
            onClick={() => onView(v)}
          >
            {v[0].toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [cases, setCases] = useState([]);
  const [err, setErr] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("add");
  const [formErr, setFormErr] = useState("");
  const [draft, setDraft] = useState({
    id: null,
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
        title: t.title,
        start: toDateSafe(t.start_iso),
        end: toDateSafe(t.end_iso),
        className: "taskEvent",
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
          className: "caseEvent",
          resource: { type: "case", raw: c }
        };
      })
      .filter((e) => !Number.isNaN(e.start.getTime()) && !Number.isNaN(e.end.getTime()));

    return [...taskEvents, ...pendingCaseEvents];
  }, [tasks, cases]);

  function openNewTask(slot) {
    const start = slot?.start || new Date();
    const end = slot?.end || new Date(start.getTime() + 60 * 60 * 1000);
    setFormErr("");
    setModalMode("add");
    setDraft({
      id: null,
      title: "",
      start_iso: start.toISOString(),
      end_iso: end.toISOString(),
      notes: ""
    });
    setIsModalOpen(true);
  }

  function openEditTask(task) {
    if (!task) return;
    setFormErr("");
    setModalMode("edit");
    setDraft({
      id: task.id,
      title: task.title || "",
      start_iso: task.start_iso || "",
      end_iso: task.end_iso || "",
      notes: task.notes || ""
    });
    setIsModalOpen(true);
  }

  function onSelectSlot(slot) {
    openNewTask(slot);
  }

  async function saveTask() {
    setFormErr("");
    try {
      if (!draft.title.trim()) return setFormErr("Title is required.");
      if (!draft.start_iso || !draft.end_iso) return setFormErr("Start and end are required.");

      if (draft.id) {
        await api(`/api/tasks/${draft.id}`, { method: "PUT", body: draft });
      } else {
        await api("/api/tasks", { method: "POST", body: draft });
      }
      setIsModalOpen(false);
      await load();
    } catch (e) {
      setFormErr(e.message);
    }
  }

  function onSelectEvent(event) {
    if (event?.resource?.type === "task") {
      openEditTask(event.resource.raw);
    } else if (event?.resource?.type === "case") {
      // prefill a task for the case so the user can quickly schedule it
      const c = event.resource.raw;
      const start = event.start || new Date();
      const end = event.end || new Date(start.getTime() + 60 * 60 * 1000);
      setFormErr("");
      setModalMode("add");
      setDraft({
        id: null,
        title: `Case ${c.case_number} - ${c.client_name}`,
        start_iso: start.toISOString(),
        end_iso: end.toISOString(),
        notes: c.notes || ""
      });
      setIsModalOpen(true);
    }
  }

  return (
    <main className="grid tasksGrid">
      {/* Middle: calendar */}
      <section className="panel panel--mid tasksMid">
        <div className="card" style={{ height: "100%" }}>
          <div className="card__header">
            <div className="card__title">Calendar</div>
          </div>

          <div className="calendarWrap">
            <Calendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              selectable
              popup
              views={["month", "week", "day"]}
              onSelectSlot={onSelectSlot}
              onSelectEvent={onSelectEvent}
              components={{ toolbar: CalendarToolbar }}
              style={{ height: "100%" }}
            />
          </div>
        </div>
      </section>

      
      {/* Right: list */}
      <aside className="panel panel--right">
        <div className="details">
          <div className="details__title">Upcoming</div>
          <div style={{ margin: "6px 0 10px" }}>
            <button className="btn btn--primary" onClick={() => openNewTask()}>Add Task</button>
          </div>

          {err && <ErrorBox error={err} />}

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
                  <div className="miniTitle">{c.case_number} - {c.client_name}</div>
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
        <Modal title={modalMode === "edit" ? "Edit Task" : "Add Task"} onClose={() => setIsModalOpen(false)}>
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
              <button type="submit" className="btn btn--primary">{modalMode === "edit" ? "Update Task" : "Save Task"}</button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
