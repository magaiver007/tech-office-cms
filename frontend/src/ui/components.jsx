import React from "react";

export function IconBtn({ title, onClick, children, ariaLabel }) {
  return (
    <button className="iconBtn" title={title} aria-label={ariaLabel || title} onClick={onClick}>
      {children}
    </button>
  );
}

export function KpiCard({ icon, title, value }) {
  return (
    <div className="kpi">
      <div className="kpi__icon" aria-hidden>
        {icon}
      </div>
      <div className="kpi__meta">
        <div className="kpi__title">{title}</div>
        <div className="kpi__value">{value}</div>
      </div>
    </div>
  );
}

export function Pill({ tone = "active", children }) {
  return <span className={`pill ${tone === "active" ? "pill--active" : "pill--lead"}`}>{children}</span>;
}

export function DetailRow({ label, value }) {
  return (
    <div className="drow">
      <div className="drow__label">{label}:</div>
      <div className="drow__value">{value}</div>
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="modalOverlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div className="modalTitle">{title}</div>
          <button className="iconBtn" onClick={onClose} aria-label="Close">
            x
          </button>
        </div>
        <div className="modalBody">{children}</div>
      </div>
    </div>
  );
}

export function FormRow({ label, children }) {
  return (
    <div className="formRow">
      <div className="formRow__label">{label}:</div>
      <div className="formRow__field">{children}</div>
    </div>
  );
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="errorBox">{String(error)}</div>;
}

export function LoadingLine({ text = "Loading..." }) {
  return <div className="muted" style={{ padding: 12 }}>{text}</div>;
}
