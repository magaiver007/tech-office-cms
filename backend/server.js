require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const SMB2 = require("smb2");



const app = express();
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());


// ---------- DB (SQLite) ----------
const db = new Database("data.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    contact_person TEXT,
    email TEXT,
    phone TEXT,
    status TEXT DEFAULT 'Active',
    segment TEXT,
    owner TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_number TEXT NOT NULL UNIQUE,
    client_name TEXT NOT NULL,
    reference_number TEXT,
    case_date TEXT,
    notes TEXT,
    status TEXT DEFAULT 'Open',
    due_date TEXT,
    nas_folder_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    start_iso TEXT NOT NULL,
    end_iso TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// Ensure required columns exist for older DB files (idempotent migrations)
function ensureColumn(table, column, definition, defaultValue) {
  const hasColumn = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!hasColumn) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
    if (defaultValue !== undefined) {
      db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} IS NULL OR ${column} = ''`).run(defaultValue);
    }
  }
}

ensureColumn("cases", "status", "TEXT DEFAULT 'Open'", "Open");

function nextCustomerId() {
  // Use both sqlite_sequence (id auto-increment) and existing customer_id values to pick the next number
  const seqRow = db.prepare("SELECT seq FROM sqlite_sequence WHERE name='customers'").get();
  const nextFromSeq = seqRow && typeof seqRow.seq === "number" ? seqRow.seq + 1 : 1;
  const maxRow = db.prepare("SELECT MAX(CAST(customer_id AS INTEGER)) as maxId FROM customers").get();
  const nextFromData = maxRow && typeof maxRow.maxId === "number" ? (maxRow.maxId || 0) + 1 : 1;
  return String(Math.max(nextFromSeq || 1, nextFromData || 1));
}

// ---------- Helpers ----------
function nowISO() {
  return new Date().toISOString();
}

function sanitizeFolderName(name) {
  return String(name || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "") // Windows invalid chars
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function defaultCaseFolder(caseNumber, clientName) {
  const cn = sanitizeFolderName(caseNumber);
  const cl = sanitizeFolderName(clientName);
  return `${cn} - ${cl}`;
}

// ---------- SMB client ----------
function smbClient() {
  const share = `\\\\${process.env.NAS_HOST}\\${process.env.NAS_SHARE}`;
  return new SMB2({
    share,
    domain: process.env.NAS_DOMAIN || "WORKGROUP",
    username: process.env.NAS_USERNAME,
    password: process.env.NAS_PASSWORD,
    autoCloseTimeout: 10000
  });
}

function joinNasPath(...parts) {
  // SMB paths use backslashes
  return parts
    .filter(Boolean)
    .join("\\")
    .replace(/[\\/]+/g, "\\")
    .replace(/^\\+/, "");
}

function ensureInsideBase(relPath) {
  // prevent path traversal
  const cleaned = relPath.replace(/\//g, "\\");
  if (cleaned.includes("..")) throw new Error("Invalid path");
  return cleaned;
}

// ---------- CASES CRUD ----------
app.get("/api/cases", (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) {
    const rows = db.prepare("SELECT * FROM cases ORDER BY updated_at DESC").all();
    return res.json(rows);
  }
  const like = `%${q}%`;
  const rows = db
    .prepare(
      `SELECT * FROM cases
       WHERE case_number LIKE ? OR client_name LIKE ? OR reference_number LIKE ?
       ORDER BY updated_at DESC`
    )
    .all(like, like, like);
  res.json(rows);
});

app.get("/api/cases/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM cases WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

app.post("/api/cases", (req, res) => {
  const { case_number, client_name, reference_number, case_date, notes } = req.body || {};
  if (!case_number || !client_name) return res.status(400).json({ error: "case_number and client_name required" });

  const createdAt = nowISO();
  const updatedAt = createdAt;

  const folderName = defaultCaseFolder(case_number, client_name);
  const nasFolderPath = joinNasPath(process.env.NAS_BASE_DIR || "cases", folderName);

  try {
    const info = db
      .prepare(
        `INSERT INTO cases (case_number, client_name, reference_number, case_date, notes, nas_folder_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(case_number, client_name, reference_number || "", case_date || "", notes || "", nasFolderPath, createdAt, updatedAt);

    const row = db.prepare("SELECT * FROM cases WHERE id = ?").get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.put("/api/cases/:id",  (req, res) => {
  const existing = db.prepare("SELECT * FROM cases WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const { case_number, client_name, reference_number, case_date, notes } = req.body || {};
  if (!case_number || !client_name) return res.status(400).json({ error: "case_number and client_name required" });

  // keep existing folder unless case_number/client_name changed -> update path
  const folderName = defaultCaseFolder(case_number, client_name);
  const nasFolderPath = joinNasPath(process.env.NAS_BASE_DIR || "cases", folderName);

  const updatedAt = nowISO();
  try {
    db.prepare(
      `UPDATE cases
       SET case_number=?, client_name=?, reference_number=?, case_date=?, notes=?, nas_folder_path=?, updated_at=?
       WHERE id=?`
    ).run(case_number, client_name, reference_number || "", case_date || "", notes || "", nasFolderPath, updatedAt, req.params.id);

    const row = db.prepare("SELECT * FROM cases WHERE id = ?").get(req.params.id);
    res.json(row);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// ---------- FILES (SMB) ----------
app.post("/api/cases/:id/files/ensure-folder",  async (req, res) => {
  const row = db.prepare("SELECT * FROM cases WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });

  const rel = ensureInsideBase(row.nas_folder_path);
  const smb = smbClient();

  try {
    // recursively create folders
    const parts = rel.split("\\").filter(Boolean);
    let current = "";
    for (const p of parts) {
      current = current ? `${current}\\${p}` : p;
      try {
        await smb.mkdir(current);
      } catch (e) {
        // ignore "already exists"
      }
    }
    res.json({ ok: true, folder: rel });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    smb.close();
  }
});

app.get("/api/cases/:id/files",  async (req, res) => {
  const row = db.prepare("SELECT * FROM cases WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });

  const rel = ensureInsideBase(row.nas_folder_path);
  const smb = smbClient();

  try {
    const items = await smb.readdir(rel);
    // Items might be strings. We'll just return names.
    res.json({ folder: rel, items: items.map((name) => ({ name })) });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    smb.close();
  }
});

const upload = multer({ dest: path.join(__dirname, "tmp_uploads") });

app.post("/api/cases/:id/files/upload",  upload.single("file"), async (req, res) => {
  const row = db.prepare("SELECT * FROM cases WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const relFolder = ensureInsideBase(row.nas_folder_path);
  const fileName = sanitizeFolderName(req.file.originalname) || "upload.bin";
  const relTarget = joinNasPath(relFolder, fileName);

  const smb = smbClient();

  try {
    const data = fs.readFileSync(req.file.path);
    await smb.writeFile(relTarget, data);
    res.json({ ok: true, savedAs: fileName });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    smb.close();
    fs.unlink(req.file.path, () => {});
  }
});

app.get("/api/cases/:id/files/download",  async (req, res) => {
  const row = db.prepare("SELECT * FROM cases WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });

  const name = req.query.name;
  if (!name) return res.status(400).json({ error: "Missing name" });

  const relFolder = ensureInsideBase(row.nas_folder_path);
  const fileName = sanitizeFolderName(name);
  const relTarget = joinNasPath(relFolder, fileName);

  const smb = smbClient();

  try {
    const data = await smb.readFile(relTarget);
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(Buffer.from(data));
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    smb.close();
  }
});

app.get("/api/customers", (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) {
    const rows = db.prepare("SELECT * FROM customers ORDER BY updated_at DESC").all();
    return res.json(rows);
  }
  const like = `%${q}%`;
  const rows = db.prepare(
    `SELECT * FROM customers
     WHERE customer_id LIKE ? OR name LIKE ? OR contact_person LIKE ? OR email LIKE ?
     ORDER BY updated_at DESC`
  ).all(like, like, like, like);
  res.json(rows);
});

app.post("/api/customers", (req, res) => {
  const {
    customer_id, name, contact_person, email, phone,
    status = "Active", segment = "", owner = "", notes = ""
  } = req.body || {};

  if (!name) return res.status(400).json({ error: "name required" });

  const assignedCustomerId = (customer_id || "").toString().trim() || nextCustomerId();

  const created_at = nowISO();
  const updated_at = created_at;

  try {
    const info = db.prepare(
      `INSERT INTO customers (customer_id, name, contact_person, email, phone, status, segment, owner, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(assignedCustomerId, name, contact_person || "", email || "", phone || "", status, segment, owner, notes, created_at, updated_at);

    const row = db.prepare("SELECT * FROM customers WHERE id=?").get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.put("/api/customers/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM customers WHERE id=?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const {
    customer_id, name, contact_person, email, phone,
    status = "Active", segment = "", owner = "", notes = ""
  } = req.body || {};

  if (!customer_id || !name) return res.status(400).json({ error: "customer_id and name required" });

  const updated_at = nowISO();

  try {
    db.prepare(
      `UPDATE customers
       SET customer_id=?, name=?, contact_person=?, email=?, phone=?, status=?, segment=?, owner=?, notes=?, updated_at=?
       WHERE id=?`
    ).run(customer_id, name, contact_person || "", email || "", phone || "", status, segment, owner, notes, updated_at, req.params.id);

    const row = db.prepare("SELECT * FROM customers WHERE id=?").get(req.params.id);
    res.json(row);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.get("/api/tasks", (req, res) => {
  const rows = db.prepare("SELECT * FROM tasks ORDER BY start_iso ASC").all();
  res.json(rows);
});

app.post("/api/tasks", (req, res) => {
  const { title, start_iso, end_iso, notes = "" } = req.body || {};
  if (!title || !start_iso || !end_iso) return res.status(400).json({ error: "title, start_iso, end_iso required" });

  const created_at = nowISO();
  const updated_at = created_at;

  const info = db.prepare(
    `INSERT INTO tasks (title, start_iso, end_iso, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(title, start_iso, end_iso, notes, created_at, updated_at);

  const row = db.prepare("SELECT * FROM tasks WHERE id=?").get(info.lastInsertRowid);
  res.status(201).json(row);
});

async function countNasDirectories(relFolder) {
  const smb = smbClient();
  try {
    const items = await smb.readdir(relFolder);
    // smb2 often returns names only; we’ll treat each name as a folder candidate.
    // In real-world, some entries may be files — that’s OK for a first version.
    return Array.isArray(items) ? items.length : 0;
  } finally {
    smb.close();
  }
}

app.get("/api/dashboard/metrics", async (req, res) => {
  try {
    const totalCustomers = db.prepare("SELECT COUNT(*) as c FROM customers").get().c;
    const activeCases = db.prepare("SELECT COUNT(*) as c FROM cases WHERE status != 'Completed'").get().c;

    const completedRel = joinNasPath(process.env.NAS_COMPLETED_DIR || "completed");
    let completedCases = 0;

    try {
      completedCases = await countNasDirectories(completedRel);
    } catch {
      // if folder doesn’t exist yet, count = 0
      completedCases = 0;
    }

    res.json({ totalCustomers, activeCases, completedCases });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});


// ---------- Health ----------
app.get("/api/health", (req, res) => res.json({ ok: true }));

const port = Number(process.env.PORT || 4000);

app.listen(port, "127.0.0.1", () => {
  console.log(`Backend listening on http://127.0.0.1:${port}`);
});
