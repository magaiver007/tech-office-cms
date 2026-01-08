require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { promisify } = require("util");
const Database = require("better-sqlite3");
const SMB2 = require("smb2");
const axios = require("axios");



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

  CREATE TABLE IF NOT EXISTS case_customers (
    case_id INTEGER NOT NULL,
    customer_id INTEGER NOT NULL,
    PRIMARY KEY (case_id, customer_id)
  );

  CREATE TABLE IF NOT EXISTS diavgeia_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ada TEXT NOT NULL UNIQUE,
    subject TEXT,
    protocol_number TEXT,
    decision_type_id TEXT,
    organization_id TEXT,
    organization_label TEXT,
    issue_date TEXT,
    document_url TEXT,
    status TEXT,
    submitter_uid TEXT,
    unit_uid TEXT,
    thematic_category_ids TEXT,
    attachments TEXT,
    extra_field_values TEXT,
    private_data TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_fetched_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS case_diavgeia_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER NOT NULL,
    decision_ada TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
    FOREIGN KEY (decision_ada) REFERENCES diavgeia_decisions(ada) ON DELETE CASCADE
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
ensureColumn("cases", "due_date", "TEXT", "");
ensureColumn("tasks", "case_id", "INTEGER", null);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_case_customers_case_id ON case_customers (case_id);
  CREATE INDEX IF NOT EXISTS idx_case_customers_customer_id ON case_customers (customer_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_case_id ON tasks (case_id);
  CREATE INDEX IF NOT EXISTS idx_diavgeia_ada ON diavgeia_decisions (ada);
  CREATE INDEX IF NOT EXISTS idx_diavgeia_issue_date ON diavgeia_decisions (issue_date);
  CREATE INDEX IF NOT EXISTS idx_diavgeia_organization ON diavgeia_decisions (organization_id);
  CREATE INDEX IF NOT EXISTS idx_case_diavgeia_case ON case_diavgeia_links (case_id);
  CREATE INDEX IF NOT EXISTS idx_case_diavgeia_ada ON case_diavgeia_links (decision_ada);
`);

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

function smbAsync(client) {
  return {
    mkdir: promisify(client.mkdir).bind(client),
    readdir: promisify(client.readdir).bind(client),
    writeFile: promisify(client.writeFile).bind(client),
    readFile: promisify(client.readFile).bind(client)
  };
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

// ---------- Diavgeia API Integration ----------
const DIAVGEIA_BASE_URL = "https://diavgeia.gov.gr/luminapi/opendata";

async function fetchDiavgeiaSearch(params = {}) {
  const queryParams = new URLSearchParams();

  // Add provided params
  if (params.q) queryParams.append("q", params.q);
  if (params.ada) queryParams.append("ada", params.ada);
  if (params.subject) queryParams.append("subject", params.subject);
  if (params.protocol) queryParams.append("protocol", params.protocol);
  if (params.org) queryParams.append("org", params.org);
  if (params.type) queryParams.append("type", params.type);
  if (params.from_date) queryParams.append("from_date", params.from_date);
  if (params.to_date) queryParams.append("to_date", params.to_date);
  if (params.status) queryParams.append("status", params.status);

  // Pagination
  const page = Number(params.page) || 0;
  const size = Math.min(Number(params.size) || 20, 100); // Max 100 per page
  queryParams.append("page", page);
  queryParams.append("size", size);

  if (params.sort) queryParams.append("sort", params.sort);

  try {
    const response = await axios.get(`${DIAVGEIA_BASE_URL}/search`, {
      params: queryParams,
      timeout: 15000 // 15 second timeout
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(`Diavgeia API error: ${error.response.status} - ${error.response.statusText}`);
    }
    throw new Error(`Diavgeia API request failed: ${error.message}`);
  }
}

async function fetchDiavgeiaDecision(ada) {
  try {
    const response = await axios.get(`${DIAVGEIA_BASE_URL}/decisions/${ada}`, {
      timeout: 15000
    });
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      throw new Error(`Decision with ADA ${ada} not found`);
    }
    if (error.response) {
      throw new Error(`Diavgeia API error: ${error.response.status} - ${error.response.statusText}`);
    }
    throw new Error(`Diavgeia API request failed: ${error.message}`);
  }
}

function saveDiavgeiaDecision(decisionData) {
  const now = nowISO();

  // Check if decision already exists
  const existing = db.prepare("SELECT id FROM diavgeia_decisions WHERE ada = ?").get(decisionData.ada);

  if (existing) {
    // Update existing decision
    db.prepare(`
      UPDATE diavgeia_decisions
      SET subject=?, protocol_number=?, decision_type_id=?, organization_id=?,
          organization_label=?, issue_date=?, document_url=?, status=?,
          submitter_uid=?, unit_uid=?, thematic_category_ids=?,
          attachments=?, extra_field_values=?, private_data=?,
          updated_at=?, last_fetched_at=?
      WHERE ada=?
    `).run(
      decisionData.subject || "",
      decisionData.protocolNumber || "",
      decisionData.decisionTypeId || "",
      decisionData.organizationId || "",
      decisionData.organizationLabel || "",
      decisionData.issueDate || "",
      decisionData.documentUrl || "",
      decisionData.status || "",
      decisionData.submitterUid || "",
      decisionData.unitUid || "",
      JSON.stringify(decisionData.thematicCategoryIds || []),
      JSON.stringify(decisionData.attachments || []),
      JSON.stringify(decisionData.extraFieldValues || {}),
      JSON.stringify(decisionData.privateData || {}),
      now,
      now,
      decisionData.ada
    );
    return existing.id;
  } else {
    // Insert new decision
    const info = db.prepare(`
      INSERT INTO diavgeia_decisions
      (ada, subject, protocol_number, decision_type_id, organization_id,
       organization_label, issue_date, document_url, status,
       submitter_uid, unit_uid, thematic_category_ids,
       attachments, extra_field_values, private_data,
       created_at, updated_at, last_fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      decisionData.ada,
      decisionData.subject || "",
      decisionData.protocolNumber || "",
      decisionData.decisionTypeId || "",
      decisionData.organizationId || "",
      decisionData.organizationLabel || "",
      decisionData.issueDate || "",
      decisionData.documentUrl || "",
      decisionData.status || "",
      decisionData.submitterUid || "",
      decisionData.unitUid || "",
      JSON.stringify(decisionData.thematicCategoryIds || []),
      JSON.stringify(decisionData.attachments || []),
      JSON.stringify(decisionData.extraFieldValues || {}),
      JSON.stringify(decisionData.privateData || {}),
      now,
      now,
      now
    );
    return info.lastInsertRowid;
  }
}

function setCaseCustomers(caseId, customerIds) {
  const ids = Array.isArray(customerIds) ? customerIds.map((id) => Number(id)).filter((id) => Number.isFinite(id)) : [];
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM case_customers WHERE case_id = ?").run(caseId);
    const insert = db.prepare("INSERT INTO case_customers (case_id, customer_id) VALUES (?, ?)");
    ids.forEach((custId) => insert.run(caseId, custId));
  });
  tx();
}

function loadCaseCustomers(caseId) {
  return db.prepare(
    `SELECT c.*
     FROM case_customers cc
     JOIN customers c ON c.id = cc.customer_id
     WHERE cc.case_id = ?
     ORDER BY c.name`
  ).all(caseId);
}

function loadCustomerCases(customerId) {
  return db.prepare(
    `SELECT ca.*
     FROM case_customers cc
     JOIN cases ca ON ca.id = cc.case_id
     WHERE cc.customer_id = ?
     ORDER BY ca.updated_at DESC`
  ).all(customerId);
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
  const { case_number, client_name, reference_number, case_date, notes, customer_ids } = req.body || {};
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

    if (Array.isArray(customer_ids) && customer_ids.length) {
      setCaseCustomers(info.lastInsertRowid, customer_ids);
    } else {
      const match = db.prepare("SELECT id FROM customers WHERE name = ? LIMIT 1").get(client_name);
      if (match?.id) setCaseCustomers(info.lastInsertRowid, [match.id]);
    }

    const row = db.prepare("SELECT * FROM cases WHERE id = ?").get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.put("/api/cases/:id",  (req, res) => {
  const existing = db.prepare("SELECT * FROM cases WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const { case_number, client_name, reference_number, case_date, notes, customer_ids } = req.body || {};
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

    if (Array.isArray(customer_ids)) setCaseCustomers(req.params.id, customer_ids);
    const row = db.prepare("SELECT * FROM cases WHERE id = ?").get(req.params.id);
    res.json(row);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.get("/api/cases/:id/details", (req, res) => {
  const row = db.prepare("SELECT * FROM cases WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });

  let customers = loadCaseCustomers(req.params.id);
  if (!customers.length && row.client_name) {
    customers = db.prepare("SELECT * FROM customers WHERE name = ?").all(row.client_name);
  }

  const tasks = db.prepare("SELECT * FROM tasks WHERE case_id = ? ORDER BY start_iso ASC").all(req.params.id);

  res.json({ case: row, customers, tasks });
});

app.get("/api/cases/:id/customers", (req, res) => {
  const row = db.prepare("SELECT * FROM cases WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  const customers = loadCaseCustomers(req.params.id);
  res.json(customers);
});

app.put("/api/cases/:id/customers", (req, res) => {
  const row = db.prepare("SELECT * FROM cases WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  const customerIds = req.body?.customer_ids || [];
  setCaseCustomers(req.params.id, customerIds);
  const customers = loadCaseCustomers(req.params.id);
  res.json(customers);
});

// ---------- FILES (SMB) ----------
app.post("/api/cases/:id/files/ensure-folder",  async (req, res) => {
  const row = db.prepare("SELECT * FROM cases WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });

  const rel = ensureInsideBase(row.nas_folder_path);
  const smb = smbClient();
  const smbP = smbAsync(smb);

  try {
    // recursively create folders
    const parts = rel.split("\\").filter(Boolean);
    let current = "";
    for (const p of parts) {
      current = current ? `${current}\\${p}` : p;
      try {
        await smbP.mkdir(current);
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
  const smbP = smbAsync(smb);

  try {
    const items = await smbP.readdir(rel);
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
  const smbP = smbAsync(smb);

  try {
    const data = fs.readFileSync(req.file.path);
    await smbP.writeFile(relTarget, data);
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
  const smbP = smbAsync(smb);

  try {
    const data = await smbP.readFile(relTarget);
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

app.get("/api/customers/:id/details", (req, res) => {
  const row = db.prepare("SELECT * FROM customers WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });

  let cases = loadCustomerCases(req.params.id);
  if (!cases.length && row.name) {
    cases = db.prepare("SELECT * FROM cases WHERE client_name = ? ORDER BY updated_at DESC").all(row.name);
  }

  res.json({ customer: row, cases });
});

app.get("/api/tasks", (req, res) => {
  const rows = db.prepare("SELECT * FROM tasks ORDER BY start_iso ASC").all();
  res.json(rows);
});

app.post("/api/tasks", (req, res) => {
  const { title, start_iso, end_iso, notes = "", case_id = null } = req.body || {};
  if (!title || !start_iso || !end_iso) return res.status(400).json({ error: "title, start_iso, end_iso required" });

  const created_at = nowISO();
  const updated_at = created_at;

  const info = db.prepare(
    `INSERT INTO tasks (title, start_iso, end_iso, notes, case_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(title, start_iso, end_iso, notes, case_id, created_at, updated_at);

  const row = db.prepare("SELECT * FROM tasks WHERE id=?").get(info.lastInsertRowid);
  res.status(201).json(row);
});

app.post("/api/cases/:id/tasks", (req, res) => {
  const row = db.prepare("SELECT * FROM cases WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });

  const { title, start_iso, end_iso, notes = "" } = req.body || {};
  if (!title || !start_iso || !end_iso) return res.status(400).json({ error: "title, start_iso, end_iso required" });

  const created_at = nowISO();
  const updated_at = created_at;

  const info = db.prepare(
    `INSERT INTO tasks (title, start_iso, end_iso, notes, case_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(title, start_iso, end_iso, notes, req.params.id, created_at, updated_at);

  const task = db.prepare("SELECT * FROM tasks WHERE id=?").get(info.lastInsertRowid);
  res.status(201).json(task);
});

async function countNasDirectories(relFolder) {
  const smb = smbClient();
  const smbP = smbAsync(smb);
  try {
    const items = await smbP.readdir(relFolder);
    // smb2 often returns names only; we'll treat each name as a folder candidate.
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

// ---------- DIAVGEIA ENDPOINTS ----------

// Search decisions (cache-first with optional refresh)
app.get("/api/diavgeia/search", async (req, res) => {
  try {
    const {
      q, ada, subject, protocol, org, type,
      from_date, to_date, status,
      page = 0, size = 20, sort,
      refresh = "false"
    } = req.query;

    // If refresh is requested or ada search, fetch from API
    if (refresh === "true" || ada) {
      const apiResult = await fetchDiavgeiaSearch({
        q, ada, subject, protocol, org, type,
        from_date, to_date, status, page, size, sort
      });

      // Cache all results
      if (apiResult.decisions && Array.isArray(apiResult.decisions)) {
        apiResult.decisions.forEach(decision => {
          try {
            saveDiavgeiaDecision(decision);
          } catch (e) {
            console.error(`Failed to cache decision ${decision.ada}:`, e.message);
          }
        });
      }

      return res.json(apiResult);
    }

    // Search local cache first
    let query = "SELECT * FROM diavgeia_decisions WHERE 1=1";
    const params = [];

    if (q) {
      query += " AND (subject LIKE ? OR ada LIKE ? OR protocol_number LIKE ?)";
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    if (org) {
      query += " AND organization_id LIKE ?";
      params.push(`%${org}%`);
    }

    if (type) {
      query += " AND decision_type_id = ?";
      params.push(type);
    }

    if (from_date) {
      query += " AND issue_date >= ?";
      params.push(from_date);
    }

    if (to_date) {
      query += " AND issue_date <= ?";
      params.push(to_date);
    }

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    query += " ORDER BY issue_date DESC, updated_at DESC";

    // Apply pagination
    const pageNum = Number(page) || 0;
    const pageSize = Math.min(Number(size) || 20, 100);
    query += " LIMIT ? OFFSET ?";
    params.push(pageSize, pageNum * pageSize);

    const decisions = db.prepare(query).all(...params);

    // Get total count for pagination info
    let countQuery = "SELECT COUNT(*) as total FROM diavgeia_decisions WHERE 1=1";
    const countParams = [];

    if (q) {
      countQuery += " AND (subject LIKE ? OR ada LIKE ? OR protocol_number LIKE ?)";
      const like = `%${q}%`;
      countParams.push(like, like, like);
    }
    if (org) {
      countQuery += " AND organization_id LIKE ?";
      countParams.push(`%${org}%`);
    }
    if (type) {
      countQuery += " AND decision_type_id = ?";
      countParams.push(type);
    }
    if (from_date) {
      countQuery += " AND issue_date >= ?";
      countParams.push(from_date);
    }
    if (to_date) {
      countQuery += " AND issue_date <= ?";
      countParams.push(to_date);
    }
    if (status) {
      countQuery += " AND status = ?";
      countParams.push(status);
    }

    const totalResult = db.prepare(countQuery).get(...countParams);

    res.json({
      decisions,
      info: {
        page: pageNum,
        size: pageSize,
        total: totalResult.total,
        source: "cache"
      }
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Get single decision by ADA (cache-first)
app.get("/api/diavgeia/decisions/:ada", async (req, res) => {
  try {
    const { ada } = req.params;
    const { refresh = "false" } = req.query;

    if (!ada) return res.status(400).json({ error: "ADA is required" });

    // Check cache first
    let decision = db.prepare("SELECT * FROM diavgeia_decisions WHERE ada = ?").get(ada);

    // If not in cache or refresh requested, fetch from API
    if (!decision || refresh === "true") {
      const apiDecision = await fetchDiavgeiaDecision(ada);
      saveDiavgeiaDecision(apiDecision);
      decision = db.prepare("SELECT * FROM diavgeia_decisions WHERE ada = ?").get(ada);
    }

    if (!decision) return res.status(404).json({ error: "Decision not found" });

    res.json(decision);
  } catch (e) {
    if (e.message.includes("not found")) {
      return res.status(404).json({ error: e.message });
    }
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Fetch decision by ADA from Diavgeia API and cache it
app.post("/api/diavgeia/fetch/:ada", async (req, res) => {
  try {
    const { ada } = req.params;
    if (!ada) return res.status(400).json({ error: "ADA is required" });

    const apiDecision = await fetchDiavgeiaDecision(ada);
    saveDiavgeiaDecision(apiDecision);

    const cached = db.prepare("SELECT * FROM diavgeia_decisions WHERE ada = ?").get(ada);
    res.status(201).json(cached);
  } catch (e) {
    if (e.message.includes("not found")) {
      return res.status(404).json({ error: e.message });
    }
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Link decision to case
app.post("/api/cases/:id/diavgeia-links", (req, res) => {
  const caseRow = db.prepare("SELECT * FROM cases WHERE id = ?").get(req.params.id);
  if (!caseRow) return res.status(404).json({ error: "Case not found" });

  const { decision_ada, notes = "" } = req.body;
  if (!decision_ada) return res.status(400).json({ error: "decision_ada is required" });

  // Verify decision exists in cache
  const decision = db.prepare("SELECT * FROM diavgeia_decisions WHERE ada = ?").get(decision_ada);
  if (!decision) return res.status(400).json({ error: "Decision must be fetched/cached before linking" });

  try {
    const existing = db.prepare(
      "SELECT * FROM case_diavgeia_links WHERE case_id = ? AND decision_ada = ?"
    ).get(req.params.id, decision_ada);

    if (existing) {
      return res.status(400).json({ error: "This decision is already linked to this case" });
    }

    const info = db.prepare(
      "INSERT INTO case_diavgeia_links (case_id, decision_ada, notes, created_at) VALUES (?, ?, ?, ?)"
    ).run(req.params.id, decision_ada, notes, nowISO());

    const link = db.prepare("SELECT * FROM case_diavgeia_links WHERE id = ?").get(info.lastInsertRowid);
    res.status(201).json(link);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// Get decisions linked to a case
app.get("/api/cases/:id/diavgeia-links", (req, res) => {
  const caseRow = db.prepare("SELECT * FROM cases WHERE id = ?").get(req.params.id);
  if (!caseRow) return res.status(404).json({ error: "Case not found" });

  const links = db.prepare(`
    SELECT cdl.*, d.*
    FROM case_diavgeia_links cdl
    JOIN diavgeia_decisions d ON d.ada = cdl.decision_ada
    WHERE cdl.case_id = ?
    ORDER BY d.issue_date DESC
  `).all(req.params.id);

  res.json(links);
});

// Remove link between case and decision
app.delete("/api/cases/:id/diavgeia-links/:linkId", (req, res) => {
  const caseRow = db.prepare("SELECT * FROM cases WHERE id = ?").get(req.params.id);
  if (!caseRow) return res.status(404).json({ error: "Case not found" });

  const link = db.prepare("SELECT * FROM case_diavgeia_links WHERE id = ? AND case_id = ?")
    .get(req.params.linkId, req.params.id);

  if (!link) return res.status(404).json({ error: "Link not found" });

  db.prepare("DELETE FROM case_diavgeia_links WHERE id = ?").run(req.params.linkId);
  res.json({ ok: true });
});

// Get Diavgeia statistics for dashboard
app.get("/api/diavgeia/stats", (req, res) => {
  try {
    const totalCached = db.prepare("SELECT COUNT(*) as count FROM diavgeia_decisions").get().count;
    const linkedToCases = db.prepare("SELECT COUNT(DISTINCT decision_ada) as count FROM case_diavgeia_links").get().count;
    const recentDecisions = db.prepare(
      "SELECT COUNT(*) as count FROM diavgeia_decisions WHERE issue_date >= date('now', '-30 days')"
    ).get().count;

    res.json({
      totalCached,
      linkedToCases,
      recentDecisions
    });
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
