# 🛋️ Salotto

**Secure, privacy-focused, self-hosted team communication platform.**

Salotto is a 100% open-source alternative to Slack and Microsoft Teams. It's designed from the ground up to be fully self-hosted, with zero external telemetry and complete data sovereignty.

## ✨ Features

- **💬 Chat** — Public & private channels, direct messages, threaded conversations, rich file/media sharing
- **📞 Voice & Video** — Real-time group calls with screen sharing (powered by LiveKit/WebRTC)
- **🔒 Privacy** — Fully self-hosted, zero telemetry, your data stays on your infrastructure
- **🏢 Multi-Workspace** — Host multiple isolated teams on a single deployment
- **🔑 RBAC** — Role-based access control (Owner, Admin, Member, Guest)
- **📎 File Sharing** — S3-compatible object storage for files, images, and media

## 🏗️ Architecture

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **API Server** | Rust (Axum / Tokio) | REST API + WebSocket real-time |
| **Database** | PostgreSQL 17 | Users, channels, messages, permissions |
| **Cache / Pub-Sub** | Redis 7 | Sessions, presence, event broadcasting |
| **Object Storage** | MinIO (S3) | Files, media, attachments |
| **Media Server** | LiveKit | WebRTC SFU for voice/video/screenshare |
| **Web Frontend** | React + TypeScript + Tailwind | Web UI (Phase 2) |
| **Desktop App** | Tauri 2 | Native cross-platform desktop (Phase 2) |

## 🚀 Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- [Rust](https://rustup.rs/) (1.80+)

### 1. Clone & configure

```bash
git clone https://github.com/your-org/salotto.git
cd salotto
cp .env.example backend/.env
```

### 2. Start infrastructure services

```bash
docker compose up -d
```

This starts PostgreSQL, Redis, MinIO, and LiveKit.

### 3. Run the backend

```bash
cd backend
cargo run
```

The server will:
1. Connect to PostgreSQL and run migrations automatically
2. Connect to Redis
3. Connect to MinIO
4. Start listening on `http://localhost:8080`

### 4. Verify

```bash
# Health check
curl http://localhost:8080/health

# Register a user
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","email":"admin@salotto.local","password":"Str0ngP@ss!"}'
```

## 📁 Project Structure

```
salotto/
├── docker-compose.yml      # Dev environment (Postgres, Redis, MinIO, LiveKit)
├── backend/                # Rust API server
│   ├── Cargo.toml
│   ├── migrations/         # SQLx database migrations
│   └── src/
│       ├── main.rs         # Server entry point
│       ├── config.rs       # Environment configuration
│       ├── state.rs        # Shared application state
│       ├── error.rs        # Unified error handling
│       ├── routes.rs       # Router assembly
│       ├── auth/           # Authentication (Argon2id + JWT)
│       ├── models/         # Domain models (SQLx)
│       ├── handlers/       # HTTP route handlers
│       └── ws/             # WebSocket real-time layer
├── frontend/               # React + TypeScript (Phase 2)
└── desktop/                # Tauri desktop app (Phase 2)
```

## 🔧 Development

### Useful commands

```bash
# Start only specific services
docker compose up -d postgres redis

# View logs
docker compose logs -f postgres

# Run with hot-reload (install cargo-watch first)
cargo install cargo-watch
cd backend && cargo watch -x run

# MinIO console
open http://localhost:9001  # Login: minioadmin / minioadmin
```

### Environment Variables

See [`.env.example`](.env.example) for all available configuration options.

## 📄 License

MIT — see [LICENSE](LICENSE) for details.
