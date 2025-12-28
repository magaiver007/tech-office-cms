# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tech Office CMS is a client-server Content Management System for managing technical office operations. The system handles customers, cases (projects), and tasks with integrated NAS file storage via SMB protocol.

**Architecture**: React SPA frontend + Node.js/Express backend + SQLite database + SMB/NAS file storage

## Development Setup

### Backend
```bash
cd backend
npm install
# Create .env file with NAS credentials (see below)
npm run dev  # Development server on http://127.0.0.1:4000
npm start    # Production server
```

### Frontend
```bash
cd frontend
npm install
npm run dev     # Development server on http://localhost:5173
npm run build   # Production build
npm run lint    # Run ESLint
```

### Environment Configuration

The backend requires a `.env` file in the `backend` directory:

```
NAS_HOST=your-nas-ip-or-hostname
NAS_SHARE=your-share-name
NAS_USERNAME=your-username
NAS_PASSWORD=your-password
NAS_BASE_DIR=cases
NAS_COMPLETED_DIR=completed
PORT=4000
```

## Core Architecture

### Backend Structure (`backend/server.js`)

**Database Schema** (SQLite via better-sqlite3):
- `customers`: Customer/client information with status tracking
- `cases`: Case/project records linked to customers, includes NAS folder paths
- `tasks`: Calendar tasks with ISO datetime ranges

**SMB Integration**:
- Case files are stored on NAS via SMB2 protocol
- Each case gets a dedicated folder: `{NAS_BASE_DIR}/{case_number} - {client_name}/`
- Folder names are sanitized to prevent Windows path issues
- Path traversal protection via `ensureInsideBase()` function

**Key Backend Patterns**:
- Synchronous database operations using better-sqlite3 prepared statements
- Asynchronous SMB operations with proper client cleanup in finally blocks
- File uploads use multer with temp storage, then transfer to NAS
- API responses include proper error handling with status codes

### Frontend Structure

**Navigation**: Single-page app with tab-based navigation in `App.jsx`:
- Dashboard: Metrics KPIs, customer list with details panel, recent cases
- Customers: Customer management (uses dedicated page component)
- Tasks: Calendar view for task scheduling
- Reports: Reporting interface

**State Management**:
- Component-level React state (useState, useEffect)
- No global state management library
- Search state shared via props from App.jsx (`topSearch` prop)

**API Communication** (`frontend/src/api.js`):
- Single `api()` helper function handles all HTTP requests
- Base URL hardcoded to `http://localhost:4000`
- Supports both JSON and FormData requests via `isForm` parameter
- Automatic error extraction from response

**Component Library** (`frontend/src/ui/components.jsx`):
Reusable UI components used across pages:
- `Modal`: Overlay modal with click-outside-to-close
- `FormRow`: Label + field layout for forms
- `KpiCard`: Dashboard metric cards
- `Pill`: Status badges with tone variants (active/lead)
- `IconBtn`: Icon-based buttons
- `DetailRow`: Key-value detail display
- `ErrorBox`, `LoadingLine`: State indicators

**Styling Approach**:
- CSS files: `App.css` for global styles, `dashboard.css` for layout
- BEM-like class naming (e.g., `panel__header`, `kpi__value`)
- No CSS-in-JS or preprocessors

## Common Workflows

### Adding New Customer Fields

1. Update database schema in `backend/server.js` (add column in CREATE TABLE)
2. Update POST/PUT endpoints to handle new field
3. Add form field in Dashboard customer modal (FormRow component)
4. Update customerDraft state initialization

### Adding New Case Features

Cases use React Router for navigation:
- List view: `frontend/src/pages/CasesList.jsx`
- Form (new/edit): `frontend/src/pages/CaseForm.jsx`
- Details view: `frontend/src/pages/CaseDetails.jsx`

### Working with SMB/NAS Files

All SMB operations follow this pattern:
```javascript
const smb = smbClient();
try {
  // SMB operations here
  await smb.readdir(path);
  await smb.writeFile(path, data);
} catch (e) {
  // Handle error
} finally {
  smb.close(); // Always close connection
}
```

**Important**:
- SMB paths use backslashes (`\`), joined via `joinNasPath()`
- Always sanitize user input with `sanitizeFolderName()` before creating paths
- Use `ensureInsideBase()` to prevent path traversal attacks

### Database Operations

Use synchronous prepared statements:
```javascript
const row = db.prepare("SELECT * FROM table WHERE id = ?").get(id);
const rows = db.prepare("SELECT * FROM table").all();
const info = db.prepare("INSERT INTO table (...) VALUES (...)").run(...);
```

## Key Technical Decisions

**Why SQLite**: Simple deployment, no separate database server needed for small office use

**Why SMB2**: Direct integration with existing NAS infrastructure without additional abstraction layers

**Why Component State**: Application scale doesn't warrant Redux/Zustand complexity; local state with prop drilling is sufficient

**Path Handling**: Windows-specific path sanitization because target environment is Windows-based NAS

**No TypeScript**: Project started without TS, adding now would require migration effort without immediate ROI for current scale

## API Endpoints Reference

### Cases
- `GET /api/cases?q={search}` - List/search cases
- `GET /api/cases/:id` - Get case details
- `POST /api/cases` - Create case (requires: case_number, client_name)
- `PUT /api/cases/:id` - Update case
- `POST /api/cases/:id/files/ensure-folder` - Create NAS folder for case
- `GET /api/cases/:id/files` - List files in case folder
- `POST /api/cases/:id/files/upload` - Upload file (multipart/form-data)
- `GET /api/cases/:id/files/download?name={filename}` - Download file

### Customers
- `GET /api/customers?q={search}` - List/search customers
- `POST /api/customers` - Create customer (requires: customer_id, name)
- `PUT /api/customers/:id` - Update customer

### Tasks
- `GET /api/tasks` - List all tasks
- `POST /api/tasks` - Create task (requires: title, start_iso, end_iso)

### Dashboard
- `GET /api/dashboard/metrics` - Get KPI metrics (total customers, active cases, completed cases count from NAS)

## Development Constraints

- Backend must run on `127.0.0.1:4000` (hardcoded in frontend)
- Frontend dev server on `localhost:5173` (CORS configured for this)
- Database file `backend/data.db` is created automatically on first run
- NAS credentials must be valid for file operations to work (will error otherwise)
