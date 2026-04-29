# System Design Document

> **Project:** OpenJob API
> **Version:** 1.0.0
> **Last Updated:** 2026-04-25

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture Style](#2-architecture-style)
3. [High-Level Architecture](#3-high-level-architecture)
4. [Tech Stack](#4-tech-stack)
5. [Application Layer](#5-application-layer)
6. [Database Layer](#6-database-layer)
7. [Caching Strategy](#7-caching-strategy)
8. [Message Broker](#8-message-broker)
9. [File Storage](#9-file-storage)
10. [Mail Service](#10-mail-service)
11. [API Design](#11-api-design)
12. [Authentication & Authorization](#12-authentication--authorization)
13. [Error Handling](#13-error-handling)
14. [Logging & Monitoring](#14-logging--monitoring)
15. [Deployment Architecture](#15-deployment-architecture)
16. [Non-Functional Requirements](#16-non-functional-requirements)
17. [Architecture Decision Records (ADR)](#17-architecture-decision-records)

---

## 1. Overview

### 1.1 Purpose

This document outlines the architectural design and technical decisions for the **OpenJob API** backend application.

### 1.2 Scope

This document covers:

- Overall system architecture
- Technologies used and their justifications
- Communication patterns between components
- Caching (Redis), messaging (RabbitMQ), and file storage (S3) strategies

### 1.3 Target Audience

- Backend Engineers
- DevOps Engineers
- Technical Reviewers

### 1.4 References

| Document        | Link                         |
| --------------- | ---------------------------- |
| PRD             | `docs/en/PRD.md`             |
| Database Design | `docs/en/database-design.md` |
| API Spec        | `docs/api/api-spec.yaml`     |

---

## 2. Architecture Style

### 2.1 Pattern: Modular Monolith

This application employs a **Modular Monolith** architecture with strict _separation of concerns_ per module.

> **Reasoning:**
>
> - Ideal for the early development stages (MVP / early-stage).
> - Simpler than microservices, yet remains scalable.
> - Each module can be extracted into a microservice in the future if required.

### 2.2 Design Principles

- **SOLID Principles** — Every class/module has a _single responsibility_.
- **Clean Architecture** — Dependencies point inwards (towards the domain layer).
- **Domain-Driven Design (DDD) Lite** — Utilizes module boundaries without the full complexity of DDD.
- **CQRS Lite** — Separates read & write operations in the service layer if necessary.

### 2.3 Module Structure

The NestJS directory structure is adapted from enterprise standards:

```text
src/
├── common/                 # Shared utilities, guards, pipes, filters
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   └── pipes/
├── config/                 # Configuration module & validation
├── modules/
│   ├── authentications/    # Auth (Login, Refresh, Logout)
│   ├── users/              # User management & Profile
│   ├── companies/          # Company CRUD
│   ├── categories/         # Job Category CRUD
│   ├── jobs/               # Job Posting CRUD
│   ├── applications/       # Job Applications
│   ├── bookmarks/          # Job Bookmarks
│   ├── documents/          # PDF Upload & S3 Integration
│   ├── cache/              # Redis Caching wrapper
│   └── queue/              # RabbitMQ Producer & Consumer Worker
├── prisma/                 # Prisma schema & migrations
│   └── schema.prisma
├── app.module.ts
└── main.ts
```

---

## 3. High-Level Architecture

### 3.1 Architecture Diagram

```text
┌──────────────┐     HTTPS    ┌─────────────────────────────────┐
│              │ ───────────► │           NGINX / LB            │
│    Client    │              │     (Reverse Proxy + SSL)       │
│  (Frontend/  │ ◄─────────── │                                 │
│   Postman)   │              └──────────────┬──────────────────┘
└──────────────┘                             │
                                             ▼
                              ┌───────────────────────────────┐
                              │                               │
                              │      NestJS Application       │
                              │       (REST API Server)       │
                              │                               │
                              │  ┌─────────┐   ┌───────────┐  │
                              │  │  Guards │   │   Pipes   │  │
                              │  └─────────┘   └───────────┘  │
                              │  ┌─────────────────────────┐  │
                              │  │       Controllers       │  │
                              │  └─────────────────────────┘  │
                              │  ┌─────────────────────────┐  │
                              │  │         Services        │  │
                              │  └─────────────────────────┘  │
                              │  ┌─────────────────────────┐  │
                              │  │    Prisma Repository    │  │
                              │  └─────────────────────────┘  │
                              │                               │
                              └───┬───────┬────────┬────────┬─┘
                                  │       │        │        │
                     ┌────────────┘       │        │        └──────────┐
                     ▼                    ▼        ▼                   ▼
            ┌────────────────┐     ┌──────────┐ ┌──────────┐    ┌─────────────┐
            │   PostgreSQL   │     │  Redis   │ │ RabbitMQ │    │ S3 Storage  │
            │  (Primary DB)  │     │ (Cache)  │ │ (Broker) │    │ (R2/MinIO)  │
            └────────────────┘     └──────────┘ └────┬─────┘    └─────────────┘
                                                     │
                                                     ▼
                                            ┌──────────────────┐
                                            │    Consumer/     │
                                            │      Worker      │
                                            │  ┌────────────┐  │
                                            │  │ Mail Worker│  │
                                            │  │(Nodemailer)│  │
                                            │  └────────────┘  │
                                            └──────────────────┘
```

### 3.2 Data Flow

```text
Client Request
│
▼
[Reverse Proxy / Load Balancer]
│
▼
[NestJS Guard] ──── Auth Check (JWT Validation)
│
▼
[NestJS Pipe] ──── Validation (Zod / class-validator)
│
▼
[Controller] ──── Route handling, DTO transformation
│
▼
[Service] ──── Business logic
│
├──► [Prisma] ──► PostgreSQL (Read/Write)
├──► [Redis] ──► Cache (Get/Set TTL)
├──► [RabbitMQ] ──► Publish event (application:created)
└──► [S3 Client] ──► Upload PDF / Get URL
│
▼
[Response] ──── Serialized JSON response to client
```

---

## 4. Tech Stack

### 4.1 Core Stack

| Layer          | Technology            | Justification                                       |
| -------------- | --------------------- | --------------------------------------------------- |
| **Runtime**    | Node.js               | Long-term support, performance improvements         |
| **Language**   | TypeScript            | Type-safety, better DX, maintainability             |
| **Framework**  | NestJS                | Opinionated, modular, enterprise-grade              |
| **Database**   | PostgreSQL            | ACID compliance, relational, mature ecosystem       |
| **ORM**        | Prisma                | Type-safe queries, auto-generated types, migrations |
| **Validation** | Zod / class-validator | Schema-first validation                             |

### 4.2 Infrastructure

| Layer              | Technology      | Purpose                                         |
| ------------------ | --------------- | ----------------------------------------------- |
| **Caching**        | Redis           | Response caching, rate limiting, token storage  |
| **Message Broker** | RabbitMQ        | Async processing (Email notification worker)    |
| **File Storage**   | S3-Compatible   | Object storage (AWS S3 / Cloudflare R2 / MinIO) |
| **Mail**           | Nodemailer      | Transactional emails (SMTP-based)               |
| **API Docs**       | Swagger/OpenAPI | Auto-generated API documentation                |

---

## 5. Application Layer

### 5.1 NestJS Configuration

- **Global Prefix:** `/api/v1` (Optional, depending on team routing standards).
- **Global Pipes:** `ValidationPipe` to validate payloads and reject requests that do not conform to DTOs.
- **Global Filters:** `AllExceptionsFilter` to ensure the error response format is always consistent.
- **Global Interceptors:** `CacheInterceptor` (optional via Redis) and `TransformInterceptor` to wrap success responses.

### 5.2 Configuration Management

Uses `@nestjs/config` with environment variable schema validation (via Joi or Zod) to ensure all credentials (Database, JWT, S3, RabbitMQ, SMTP) are available and valid upon application startup.

---

## 6. Database Layer

### 6.1 PostgreSQL & Prisma ORM

Prisma was selected because it provides end-to-end _type-safety_ from the database schema up to the controller.

#### Naming Convention:

| Context        | Convention | Example     |
| -------------- | ---------- | ----------- |
| Model name     | PascalCase | `User`      |
| Field name     | camelCase  | `fullName`  |
| DB table name  | snake_case | `users`     |
| DB column name | snake_case | `full_name` |

### 6.2 Soft Delete Strategy

All main entities (`users`, `companies`, `categories`, `jobs`, `applications`) must have a `deleted_at` column (nullable DateTime). The DELETE API will not remove rows from the database, but rather populate this column. A Prisma extension/middleware will be used to automatically filter out deleted records during GET _queries_.

---

## 7. Caching Strategy

### 7.1 Redis Configuration

- **TTL:** 1 Hour (3600 seconds).
- **Custom Response Header:** `X-Data-Source: cache` is injected when data is served from Redis without hitting the database.

**Cached Endpoints:**

| Endpoint                         | Cache Key Pattern          |
| -------------------------------- | -------------------------- |
| `GET /companies/:id`             | `companies:{uuid}`         |
| `GET /users/:id`                 | `users:{uuid}`             |
| `GET /applications/:id`          | `applications:{uuid}`      |
| `GET /applications/user/:userId` | `applications:user:{uuid}` |
| `GET /applications/job/:jobId`   | `applications:job:{uuid}`  |
| `GET /bookmarks`                 | `bookmarks:{userId}`       |

### 7.2 Cache Invalidation

Event-driven invalidation — cache keys are deleted programmatically on mutations:

| Mutation                         | Invalidated Cache Key(s)                                                        |
| -------------------------------- | ------------------------------------------------------------------------------- |
| CREATE / UPDATE / DELETE Company | `companies:{uuid}`                                                              |
| UPDATE User                      | `users:{uuid}`                                                                  |
| CREATE Application               | `applications:user:{userId}`, `applications:job:{jobId}`                        |
| UPDATE Application               | `applications:{uuid}`, `applications:user:{userId}`, `applications:job:{jobId}` |
| CREATE / DELETE Bookmark         | `bookmarks:{userId}`                                                            |

---

## 8. Message Broker (RabbitMQ)

### 8.1 RabbitMQ Configuration

| Parameter                  | Value                     |
| -------------------------- | ------------------------- |
| Exchange name              | `openjob.events`          |
| Exchange type              | `direct`                  |
| Routing key                | `application.created`     |
| Queue                      | `application.created`     |
| Dead Letter Exchange (DLX) | `openjob.dlx`             |
| Dead Letter Queue (DLQ)    | `application.created.dlq` |
| Queue durability           | `durable: true`           |
| Message delivery mode      | Persistent                |

### 8.2 Application Notification Flow

1.  **Producer (NestJS HTTP Request):** Client hits `POST /applications`. The system saves the application data to the DB, then publishes a message to exchange `openjob.events` with routing key `application.created`. The system **immediately returns `201 Created`** — no blocking on the email process.
2.  **Message Payload:**
    ```json
    { "applicationId": "<uuid-v7>" }
    ```
3.  **Consumer (Worker Process):** Runs as a background NestJS microservice listening to the `application.created` queue. On receiving a message, the worker queries the DB for:
    - Applicant name, email, and application date.
    - Job owner's email address.
4.  **Action:** Sends an email notification via Nodemailer to the **job owner** (not the applicant).

### 8.3 Retry & Dead Letter Policy

- On processing failure (SMTP error, DB error): message is **nacked** without immediate re-queue.
- Max retries: **3 attempts** with exponential backoff: `1s → 2s → 4s`.
- After 3 failed attempts: message is routed to `application.created.dlq` via the DLX for manual inspection.
- DLQ is **not** auto-retried; it requires manual intervention or a dedicated DLQ consumer.

---

## 9. File Storage

### 9.1 S3-Compatible Storage

Does not use local server disk storage (Local Storage) to keep the application _stateless_ and ready to scale horizontally. Candidate resumes are uploaded directly to an S3 bucket (AWS S3, local MinIO for dev, or Cloudflare R2).

### 9.2 File Validation Rules

- **Max Size:** 5MB.
- **Allowed MIME Type:** `application/pdf` (Mandatory, other file types are rejected).
- **Naming:** Files are renamed using a timestamp prefix to avoid conflicts: `{timestamp}-{sanitized-original-name}.pdf`.

### 9.3 Bucket Structure

```text
{bucket-name}/
└── documents/
    └── {userUuid}/
        └── {timestamp}-{sanitized-name}.pdf
```

Example object key: `documents/550e8400-e29b-41d4-a716-446655440000/1745000000000-resume.pdf`

### 9.4 URL Strategy: Presigned URLs

Resume documents are stored in a **private S3 bucket**. Permanent public URLs are **not** used to prevent unauthorized access to candidate data.

- **Upload:** Server-side upload using the AWS SDK (`PutObject`). The NestJS service streams the file directly from `multer` memory storage — no intermediate disk write.
- **Access:** When `GET /documents/:id` is called, the server generates a **presigned `GetObject` URL** on-the-fly with a TTL of **1 hour (3600 seconds)**.
- The `url` field in `DocumentResponse` is always a **fresh presigned URL** per request, never a permanent link.
- Only the `filename` (S3 object key) is stored permanently in the database.

---

## 10. Mail Service

Uses the **Nodemailer** library configured with SMTP credentials from environment variables. The execution of email dispatch **must** be performed by the RabbitMQ Consumer/Worker, and is **prohibited** from being executed synchronously within the main API _request-response cycle_.

---

## 11. API Design

### 11.1 Standard Response Format

#### Success Response (single resource)

```json
{
  "status": "success",
  "data": { "id": "...", "name": "..." }
}
```

#### Success Response (paginated list)

```json
{
  "status": "success",
  "data": [ ... ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 87,
    "totalPages": 9
  }
}
```

#### Error Response

```json
{
  "status": "fail",
  "message": "Clear and safe error description (no stack trace in production)"
}
```

### 11.2 Rate Limiting

Applied globally via `@nestjs/throttler`. Stricter limits on sensitive endpoints:

| Endpoint                | Limit   | Window   |
| ----------------------- | ------- | -------- |
| `POST /users`           | 5 req   | 1 minute |
| `POST /authentications` | 5 req   | 1 minute |
| `PUT /authentications`  | 10 req  | 1 minute |
| `POST /documents`       | 10 req  | 1 minute |
| All other endpoints     | 100 req | 1 minute |

Rate-limited responses return HTTP `429 Too Many Requests` with a standard `FailResponse` body.

---

## 12. Authentication & Authorization

### 12.1 Auth Strategy

- **Access Token (JWT):** Signed with `HS256` using `ACCESS_TOKEN_KEY`. Validity period: **3 hours**. Payload: `{ "id": "<user-uuid>" }`. Clients attach it in the `Authorization: Bearer <token>` header.
- **Refresh Token (JWT):** Signed with `HS256` using `REFRESH_TOKEN_KEY`. Stored in the `authentications` table for validation. Deleted on logout. Used to issue a new Access Token.
- **Password Hashing:** `bcrypt` with **10 salt rounds**.

### 12.2 Role-Based Access Control (RBAC)

There is no global "admin" system role. Authorization is enforced at the **resource ownership** level — guards check that `authUser.id` matches the resource's `userId` / `ownerId`.

| Resource                         | Action                       | Actor                                                  |
| -------------------------------- | ---------------------------- | ------------------------------------------------------ |
| `POST /users`                    | Register                     | Public                                                 |
| `GET /users/:id`                 | View public profile          | Public                                                 |
| `GET /profile`                   | View own profile             | Self                                                   |
| `POST /companies`                | Create                       | Any authenticated user                                 |
| `PUT /companies/:id`             | Update                       | Company owner                                          |
| `DELETE /companies/:id`          | Soft delete                  | Company owner                                          |
| `POST /categories`               | Create                       | Any authenticated user                                 |
| `PUT /categories/:id`            | Update                       | Any authenticated user                                 |
| `DELETE /categories/:id`         | Soft delete                  | Any authenticated user                                 |
| `POST /jobs`                     | Create                       | Company owner                                          |
| `PUT /jobs/:id`                  | Update                       | Job's company owner                                    |
| `DELETE /jobs/:id`               | Soft delete                  | Job's company owner                                    |
| `POST /applications`             | Apply                        | Authenticated user (cannot apply to own company's job) |
| `GET /applications`              | List all                     | Any authenticated user                                 |
| `GET /applications/:id`          | View detail                  | Applicant **or** job's company owner                   |
| `GET /applications/user/:userId` | List by applicant            | Self (applicant)                                       |
| `GET /applications/job/:jobId`   | List by job                  | Job's company owner                                    |
| `PUT /applications/:id`          | Update status                | Job's company owner (**"job admin"**)                  |
| `DELETE /applications/:id`       | Delete                       | Applicant (self)                                       |
| `POST /jobs/:jobId/bookmark`     | Create bookmark              | Self                                                   |
| `DELETE /jobs/:jobId/bookmark`   | Remove bookmark              | Self                                                   |
| `GET /bookmarks`                 | List own bookmarks           | Self                                                   |
| `POST /documents`                | Upload                       | Any authenticated user                                 |
| `GET /documents/:id`             | Get metadata + presigned URL | Any authenticated user                                 |
| `DELETE /documents/:id`          | Delete                       | Document owner                                         |

### 12.3 Application Status State Machine

```text
               ┌─────────────┐
  (created)    │   pending   │◄──────────────────────┐
 ─────────────►│             │                       │
               └──────┬──────┘                       │
                      │ job admin                    │ job admin
             ┌────────┴────────┐                    │ (reverse)
             ▼                 ▼                    │
      ┌────────────┐   ┌────────────┐               │
      │  accepted  │   │  rejected  │───────────────►┘
      └────────────┘   └────────────┘
             │                 ▲
             └─────────────────┘
                  job admin (reverse)
```

**Transition rules:**

| From       | To          | Actor                                   |
| ---------- | ----------- | --------------------------------------- |
| `pending`  | `accepted`  | Job's company owner                     |
| `pending`  | `rejected`  | Job's company owner                     |
| `accepted` | `rejected`  | Job's company owner (reversed decision) |
| `rejected` | `accepted`  | Job's company owner (reversed decision) |
| Any state  | _(deleted)_ | Applicant (self) — hard delete          |

> **Note:** `pending` is only set at creation. Once a status transition occurs, it cannot revert to `pending`.

---

## 13. Error Handling

_Error_ handling is centralized using a **NestJS Exception Filter**. Standard HTTP status code mapping:

- `400 Bad Request`: DTO/Pipes validation failed.
- `401 Unauthorized`: Token is missing, invalid, or expired.
- `403 Forbidden`: Token is valid, but access to the _resource_ is denied.
- `404 Not Found`: _Resource_ or endpoint not found.
- `422 Unprocessable Entity`: Specific _business logic_ validation failed.
- `500 Internal Server Error`: Unexpected _server-side_ error.

---

## 14. Logging & Monitoring

### 14.1 Log Format

Structured JSON logging via NestJS built-in Logger (or `pino` for production performance):

```json
{
  "level": "info",
  "timestamp": "2026-04-25T10:00:00.000Z",
  "context": "ApplicationService",
  "message": "Application created",
  "correlationId": "req-uuid-v7",
  "userId": "user-uuid"
}
```

### 14.2 Log Levels

| Level   | Usage                                                      |
| ------- | ---------------------------------------------------------- |
| `error` | Unhandled exceptions, DB failures, SMTP errors             |
| `warn`  | Validation failures, auth errors, rate limit hits          |
| `info`  | Request/response lifecycle, queue publish events           |
| `debug` | DB queries, cache hits/misses (dev only, disabled in prod) |

### 14.3 Correlation ID

Every HTTP request is assigned a unique `X-Correlation-ID` (UUID v7), injected by a global interceptor and propagated across all log entries for distributed tracing.

---

## 15. Deployment Architecture

### 15.1 Docker Compose Services (Local Dev)

| Service                 | Image                                | Exposed Port(s)                |
| ----------------------- | ------------------------------------ | ------------------------------ |
| NestJS API              | Custom Dockerfile (`node:24-alpine`) | `5000`                         |
| PostgreSQL              | `postgres:17-alpine`                 | `5432`                         |
| Redis                   | `redis:8-alpine`                     | `6379`                         |
| RabbitMQ                | `rabbitmq:4-management-alpine`       | `5672`, `15672` (mgmt UI)      |
| MinIO (S3-compatible)   | `minio/minio:latest`                 | `9000` (API), `9001` (console) |
| Mailhog (SMTP dev trap) | `mailhog/mailhog`                    | `1025` (SMTP), `8025` (Web UI) |

### 15.2 Health Check

- `GET /health` — Returns `200 OK` when all backing services (PostgreSQL, Redis, RabbitMQ) are reachable.
- Used for Docker Compose `healthcheck` directives and load balancer probes.

---

## 16. Non-Functional Requirements

| Requirement             | Target                                         |
| ----------------------- | ---------------------------------------------- |
| API response time (p95) | < 200ms (non-file endpoints)                   |
| API response time (p99) | < 500ms                                        |
| File upload latency     | < 3s for a 5MB PDF                             |
| Availability            | 99.5% uptime                                   |
| Throughput              | 500 req/s sustained                            |
| Max JSON payload        | 100KB                                          |
| Max multipart payload   | 5MB                                            |
| Access Token TTL        | 3 hours                                        |
| Cache TTL               | 3600 seconds                                   |
| Presigned URL TTL       | 3600 seconds                                   |
| RabbitMQ max retries    | 3 attempts, exponential backoff (1s → 2s → 4s) |

---

## 17. Architecture Decision Records (ADR)

### ADR-001: Selecting NestJS and Prisma

- **Status:** Accepted
- **Decision:** NestJS was chosen because it natively enforces a clean and scalable modular structure (Clean Architecture). Prisma was selected for providing superior _Type-Safety_ for the TypeScript ecosystem and a reliable _migration_ system compared to other ORMs.

### ADR-002: RabbitMQ for Asynchronous Email

- **Status:** Accepted
- **Decision:** The process of sending emails over an SMTP network is often slow (I/O based). Offloading this process to RabbitMQ ensures that main API responses (especially the job application feature) remain in the millisecond range.

### ADR-003: Soft Delete over Hard Delete

- **Status:** Accepted
- **Decision:** To maintain an _Audit Trail_ and referential integrity of applicant data with jobs/companies (even if the company is closed), data is never truly deleted from _disk_, but rather hidden using a `deleted_at` timestamp _flag_.

### ADR-004: S3 Object Storage for Documents

- **Status:** Accepted
- **Decision:** Ensures the _backend_ application does not store file _state_ within its own _container/server_. This simplifies application replication (_load balancing_) and _backup_ processes.

---

## Revision History

| Version | Date       | Author       | Changes          |
| ------- | ---------- | ------------ | ---------------- |
| 1.0.0   | 2026-04-25 | Gilang Heavy | Initial Document |
