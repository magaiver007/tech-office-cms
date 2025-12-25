import React from "react";

export default function Reports() {
  return (
    <main className="grid">
      <section className="panel panel--mid" style={{ gridColumn: "1 / -1" }}>
        <div className="card">
          <div className="card__header">
            <div className="card__title">Reports</div>
          </div>
          <div className="muted" style={{ padding: 12 }}>
            Reports page placeholder (we’ll add export, summaries, and filters later).
          </div>
        </div>
      </section>
    </main>
  );
}
