# OpenJob API 🚀

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11.x-ea2845.svg)](https://nestjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-336791.svg)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.x-2d3748.svg)](https://www.prisma.io/)
[![Redis](https://img.shields.io/badge/Redis-8.x-dc382d.svg)](https://redis.io/)
[![RabbitMQ](https://img.shields.io/badge/RabbitMQ-4.x-ff6600.svg)](https://www.rabbitmq.com/)

> **OpenJob** is an enterprise-scale RESTful API built to manage the internal recruitment process of a multinational company.

Inspired by a backend recruitment platform case study originally scoped for Express.js, this project is a **ground-up, independent implementation** built from scratch using **NestJS**, **Prisma**, and modern infrastructure components like **Redis** and **RabbitMQ**. **This is not a port or refactor of any Express codebase** — the architecture, schema, and patterns are designed specifically for a type-safe modular monolith.

---

## 🏗️ Architecture & Tech Stack

This project strictly adheres to **Clean Architecture** principles and domain-driven design concepts to separate business logic from framework-specific implementation details.

- **Core Framework:** [NestJS](https://nestjs.com/) (TypeScript)
- **Database:** [PostgreSQL](https://www.postgresql.org/)
- **ORM:** [Prisma](https://www.prisma.io/) (for end-to-end type safety and automated migrations)
- **Caching Layer:** [Redis](https://redis.io/) (to optimize high-traffic read operations)
- **Message Broker:** [RabbitMQ](https://www.rabbitmq.com/) (for asynchronous event-driven background tasks)
- **File Storage:** S3-Compatible Object Storage (AWS S3 / Cloudflare R2 / MinIO)
- **Mail Service:** Nodemailer (SMTP)
- **Validation:** Zod / class-validator

---

## ✨ Key Features

### 🔹 Core Capabilities

- **Authentication & Authorization:** Secure JWT-based auth with short-lived Access Tokens and stateful Refresh Tokens stored in the database.
- **Role-Based Access Control:** Strict separation between Public endpoints and Protected endpoints using NestJS Auth Guards.
- **Resource Management:** Full CRUD operations for Companies, Jobs, Categories, Applications, and Bookmarks.
- **Data Integrity:** Implemented **Soft Deletion** across all main entities to maintain audit trails and referential integrity.
- **Dual-ID Strategy:** Internal relational mapping uses highly optimized `Integer` IDs, while external REST API endpoints expose secure `UUID v7` to prevent ID enumeration (IDOR) attacks.

### 🚀 Advanced Enterprise Features

- **High-Performance Caching:** Read-heavy endpoints (e.g., Job Details, User Profiles) are cached in **Redis** with a 1-hour TTL. Includes event-driven cache invalidation to prevent stale data.
- **Asynchronous Event Processing:** Job applications trigger a `application:created` event published to **RabbitMQ**. A background consumer worker picks up the message and sends an email notification to the job owner, ensuring the main API response time remains under 50ms.
- **Stateless File Uploads:** Candidate PDF resumes are uploaded directly to **S3 Object Storage**. Local disk storage is completely bypassed to ensure horizontal scalability.
- **Security Hardening:** Request payload validation (Pipes), standardized Error Handling (Filters), and Rate Limiting.

---

## 📚 Documentation

Comprehensive technical documentation is available in the `docs/` directory:

1.  [**Product Requirements Document (PRD)**](docs/PRD.md)
2.  [**System Design Document (HLD)**](docs/system-design.md)
3.  [**Database Schema & ERD**](docs/database-design.md)
4.  [**OpenAPI / Swagger Specification**](docs/api/api-spec.yaml)

---

## 🛠️ Getting Started

### Prerequisites

- Node.js (v24 LTS)
- Docker & Docker Compose (for running PostgreSQL, Redis, RabbitMQ, and MinIO locally)

### 1. Clone the Repository

```bash
git clone https://github.com/gilangheavy/open-job.git
cd open-job
```

### 2. Environment Variables

Copy the example environment file and configure your credentials:

```bash
cp .env.example .env
```

Generate secure JWT secret keys using the built-in script:

```bash
npm run generate:keys
```

Copy the output values into your `.env` file:

```env
ACCESS_TOKEN_KEY=<generated_value>
REFRESH_TOKEN_KEY=<generated_value>
```

_(Ensure you also fill in the Database URL, Redis, RabbitMQ, and S3 credentials)._

### 3. Spin Up Infrastructure

Start the required backing services using Docker Compose:

```bash
docker-compose up -d
```

### 4. Install Dependencies & Run Migrations

```bash
npm install
npx prisma migrate dev
```

### 5. Start the Application

```bash
# Development mode
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

---

## 🧪 Testing

This API is fully compliant with the rigorous Postman Testing Collections.

```bash
# Run unit tests
npm run test

# Run e2e tests
npm run test:e2e
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
