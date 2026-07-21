# Salotto 🛋️

**Salotto** (Italian for *"living room"*) is a secure, self-hosted, real-time team communication platform designed to provide full data ownership, private direct messaging, persistent channels, and integrated WebRTC video/voice calls. Built with a modern, high-performance technology stack, it provides a seamless experience via web browsers and a dedicated desktop application.

---

## 🚀 Features

- 🔐 **Secure & Private Auth**: Session management with JSON Web Tokens (JWT), password hashing using **Argon2**, and security rules.
- 💬 **Real-time Messaging**: Instant message delivery and typing indicators powered by **WebSockets**.
- 🗂️ **Workspaces & Channels**: Set up multiple workspace groups, create private/public channels, manage user roles, and easily invite colleagues.
- ✉️ **Direct Messages**: Chat one-on-one with other workspace members.
- 🎙️ **Voice & Video Conferencing**: Seamless, low-latency audio/video rooms powered by **LiveKit SFU (WebRTC)**.
- 🔍 **Global Message Search**: Instant full-text search across messages in a workspace.
- 📁 **File Attachments**: Upload and share images, documents, and media safely powered by **MinIO/AWS S3 SDK**.
- 🖥️ **Desktop Client**: Native multi-platform desktop client (macOS, Windows, Linux) built on **Tauri v2** with a clean frameless custom titlebar.

---

## 🛠️ Tech Stack

### Backend (Rust)
- **Framework**: [Axum](https://github.com/tokio-rs/axum) (async web framework using WebSockets, multipart, and tracing)
- **Runtime**: [Tokio](https://tokio.rs/) (multi-threaded async runtime)
- **Database ORM/Query**: [SQLx](https://github.com/launchbadge/sqlx) (fully async, compile-time checked queries for PostgreSQL)
- **Caching & Presence**: [Redis](https://redis.io/) (used for sessions, pub/sub communication, and presence storage)
- **Storage**: [AWS SDK for S3](https://aws.amazon.com/sdk-for-rust/) (MinIO compatibility for attachments)
- **RTC Server**: [LiveKit Rust SDK](https://github.com/livekit/rust-sdks) (generating access tokens for video/voice call sessions)

### Frontend (React & TypeScript)
- **Framework**: [React 19](https://react.dev/) + [Vite](https://vite.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [TailwindCSS v4](https://tailwindcss.com/)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand) (lightweight, reactive store)
- **Routing**: [React Router v7](https://reactrouter.com/)
- **Media/RTC**: [LiveKit Client & React Components](https://github.com/livekit/components-react)

### Desktop App (Tauri)
- **Core Engine**: [Tauri v2](https://tauri.app/) (lightweight Rust wrapper around system WebViews)
- **Integration**: Leverages native notifications and deep system integration via Tauri plugins.

---

## 📂 Project Structure

```text
├── backend/            # Rust web server (Axum, SQLx, Redis, S3, LiveKit)
│   ├── migrations/     # PostgreSQL database migrations
│   └── src/            # Source code (routes, handlers, models, state)
├── frontend/           # React single-page app (Zustand, TailwindCSS v4, React Router)
│   └── src/            # Components, pages, and state stores
├── desktop/            # Tauri v2 desktop application wrapper
│   ├── src-tauri/      # Native Rust configuration and bundle setup
│   └── tauri.conf.json # Tauri build and dev configurations
└── docker-compose.yml  # Dev environment for Postgres, Redis, MinIO, and LiveKit
```

---

## ⚙️ Development Setup

Follow these steps to run a local development environment.

### 📋 Prerequisites

Before starting, ensure you have the following installed:
- **Rust** (version 1.80+): [Install Rust](https://www.rust-lang.org/tools/install)
- **Node.js** (version 18+): [Install Node.js](https://nodejs.org/)
- **Docker & Docker Compose**: [Install Docker](https://docs.docker.com/get-docker/)

---

### 1. Start External Infrastructure
Launch PostgreSQL, Redis, MinIO, and LiveKit services in the background:
```bash
docker compose up -d
```
> This automatically sets up a Postgres database named `salotto`, configures Redis, creates a `salotto` bucket in MinIO, and boots a developer LiveKit instance.

---

### 2. Configure Environment Variables
Copy the template configuration file to the project root:
```bash
cp .env.example .env
```
*(The default values in `.env.example` are preconfigured to connect seamlessly with the Docker infrastructure services).*

---

### 3. Run the Backend Server
Navigate to the `backend` folder and start the server:
```bash
cd backend
cargo run
```
> **Note**: Database migrations (`backend/migrations/`) are executed automatically on startup. The server will bind to `http://0.0.0.0:8080`.

---

### 4. Run the Client

First, install dependencies for the frontend and desktop projects:
```bash
# Install frontend web dependencies
cd frontend
npm install

# Install desktop wrapper dependencies
cd ../desktop
npm install
```

Depending on your preferred client interface:

#### 🌐 Web Client (Browser)
To run the React application in your browser:
```bash
cd frontend
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

#### 🖥️ Desktop Client (Tauri Window)
To launch the desktop application wrapper:
```bash
cd desktop
npm run tauri dev
```
> This automatically runs the Vite dev server under the hood and launches a native frameless window.

---

## 👥 Contributors

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) to learn how to propose changes, report issues, and build the codebase.

## 📄 License

This project is licensed under the [MIT License](LICENSE).
