# Project Overview

This is a **tech-office-cms**, a web-based Content Management System designed for a technical office. It follows a client-server architecture with a React frontend and a Node.js backend.

*   **Frontend**: A single-page application built with React and Vite, providing the user interface for managing data.
*   **Backend**: A Node.js server using the Express framework. It handles business logic, serves a REST API, and interacts with the database and file storage.

## Key Technologies

*   **Backend**: Node.js, Express.js, SQLite (via `better-sqlite3`), SMB (for NAS integration).
*   **Frontend**: React, Vite, `react-router-dom`.

## Data Model

The application manages the following data entities:

*   **Customers**: Information about clients.
*   **Cases**: Specific cases or projects related to customers.
*   **Tasks**: Tasks associated with cases or general office tasks.

File attachments for cases are stored on a Network Attached Storage (NAS) device, which the backend accesses using the SMB protocol.

# Building and Running

The project is split into two main parts: `frontend` and `backend`. You need to run them separately in two different terminal sessions.

### Backend

1.  **Navigate to the backend directory:**
    ```bash
    cd backend
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Configure environment variables:**
    Create a `.env` file in the `backend` directory with the following content, replacing the placeholder values with your NAS credentials:
    ```
    # NAS Connection
    NAS_HOST=your-nas-ip-or-hostname
    NAS_SHARE=your-share-name
    NAS_USERNAME=your-username
    NAS_PASSWORD=your-password
    NAS_BASE_DIR=cases
    NAS_COMPLETED_DIR=completed
    
    # Server Port (optional)
    PORT=4000
    ```
4.  **Run the development server:**
    ```bash
    npm run dev
    ```
    The backend server will start on `http://127.0.0.1:4000`.

### Frontend

1.  **Navigate to the frontend directory:**
    ```bash
    cd frontend
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Run the development server:**
    ```bash
    npm run dev
    ```
    The frontend development server will start on `http://localhost:5173`. You can access the application by opening this URL in your browser.

# Development Conventions

*   **API**: The backend exposes a REST API under the `/api` prefix.
*   **Styling**: The frontend uses CSS files for styling, with a main `App.css` and a specific `dashboard.css`.
*   **Components**: Reusable UI components are located in `frontend/src/ui/components.jsx`.
*   **Pages**: Each main view/tab in the application corresponds to a React component in the `frontend/src/pages` directory.
