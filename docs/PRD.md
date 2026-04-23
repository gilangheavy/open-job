# 📄 Product Requirements Document (PRD) - OpenJob API

> **Version:** 1.0.0
> **Tech Stack:** TypeScript, NestJS, PostgreSQL, Prisma / TypeORM, Redis, RabbitMQ, S3
> **Last Updated:** 2026-04-25

---

## 1. Product Overview & Background

**OpenJob** is an internal recruitment application for a multinational company to manage prospective employees. This product is a RESTful API that handles job applications, candidate profiles, company profiles, document management, and notifications.

### 1.1 Goals

To build an enterprise-scale RESTful API that is stable, secure, and scalable. This system includes CRUD resource operations, JWT authentication, authorization, data validation, and PostgreSQL database normalization. Furthermore, the system is equipped with advanced features such as PDF document upload to S3 Object Storage, performance optimization via Redis _caching_, and asynchronous processing (Message Queue) using RabbitMQ for email notifications.

---

## 2. Tech Stack & Architecture

- **Framework:** NestJS (TypeScript)
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Validation:** Zod or `class-validator` (via NestJS Pipes).
- **Caching:** Redis (via _in-memory_ or Upstash).
- **Message Broker:** RabbitMQ.
- **Mail Service:** Nodemailer.
- **File Storage:** **Mandatory** use of S3 Object Storage (AWS S3, Cloudflare R2, or MinIO). Local storage is strictly prohibited.
- **API Documentation:** Swagger / OpenAPI (to handle Request & Response payload contracts in detail).

---

## 3. Core Features & Scope

- **User Management:** Register, view public profile, view _logged-in_ user profile.
- **Authentication:** Login, refresh token, logout (using JWT access & refresh tokens).
- **Company Management:** Company data CRUD with **Soft Delete** implementation.
- **Category Management:** Job category CRUD with **Soft Delete** implementation.
- **Job Management:** Job posting CRUD with search (_query params_: `title`, `company-name`), **Pagination**, and **Soft Delete**.
- **Application Management:** Apply for jobs, view applications, update application status.
- **Bookmark Management:** Save/remove job postings to/from _bookmarks_.
- **Document Management:** Upload PDF resumes to S3 (size and MIME type validation), _serve_ document URL/file.
- **Security & Protection:** Protect _endpoints_ using JWT Auth Guards and **Rate Limiting** to prevent abuse/DDoS.
- **Performance Optimization (Caching):** Store frequently accessed API responses in Redis (1-hour TTL).
- **Asynchronous Processing:** Publish new application _events_ to RabbitMQ. A Consumer/Worker will process the queue and send email notifications to the job owner using Nodemailer.

---

## 4. Database Design & Relations

### 4.1 Main Entities

1.  `users`: id, fullname, email (UNIQUE), password, timestamps, deleted_at.
2.  `authentications` (refresh_tokens): token (PK), user_id.
3.  `companies`: id, name, description, location, user_id (owner), timestamps, deleted_at.
4.  `categories`: id, name, timestamps, deleted_at.
5.  `jobs`: id, company_id, category_id, title, description, location, salary, type, timestamps, deleted_at.
6.  `applications`: id, user_id, job_id, status, timestamps, deleted_at.
7.  `bookmarks`: id, user_id, job_id, timestamps.
8.  `documents`: id, user_id, filename, original_name, mime_type, size, url, timestamps.

### 4.2 Database Rules

- Table normalization with appropriate _Foreign Keys_.
- _Unique constraint_ on `users.email`.
- _Unique composite constraint_ on `bookmarks` (`user_id`, `job_id`).
- **Soft Deletion** implementation (using the `deleted_at` column) on main entities to maintain data integrity and audit trails.

---

## 5. API Specification & Endpoints

_(Note: Detailed response formats and payload schemas will be documented separately using **Swagger/OpenAPI**)_

### 5.1 Public Endpoints (No Auth Required)

| Method | Endpoint                     | Description                                            |
| :----- | :--------------------------- | :----------------------------------------------------- |
| `POST` | `/users`                     | Register new user                                      |
| `GET`  | `/users/:id`                 | Get user profile by ID                                 |
| `POST` | `/authentications`           | Login (Returns Access & Refresh Tokens)                |
| `PUT`  | `/authentications`           | Refresh access token                                   |
| `GET`  | `/companies`                 | List Companies (Support Pagination `?page=1&limit=10`) |
| `GET`  | `/companies/:id`             | Detail Company                                         |
| `GET`  | `/categories`                | List Category (Support Pagination)                     |
| `GET`  | `/categories/:id`            | Detail Category                                        |
| `GET`  | `/jobs`                      | List Jobs (Support search query & Pagination)          |
| `GET`  | `/jobs/:id`                  | Detail Jobs                                            |
| `GET`  | `/jobs/company/:companyId`   | Jobs by company (Support Pagination)                   |
| `GET`  | `/jobs/category/:categoryId` | Jobs by category (Support Pagination)                  |
| `GET`  | `/documents`                 | List all documents                                     |
| `GET`  | `/documents/:id`             | Get document URL / view by ID                          |

### 5.2 Protected Endpoints (Bearer Token Required)

| Method         | Endpoint                             | Description                                          |
| :------------- | :----------------------------------- | :--------------------------------------------------- |
| `GET`          | `/profile`                           | Get logged-in user profile                           |
| `GET`          | `/profile/applications`              | Get logged-in user applications (Support Pagination) |
| `GET`          | `/profile/bookmarks`                 | Get logged-in user bookmarks (Support Pagination)    |
| `DELETE`       | `/authentications`                   | Logout                                               |
| `POST/PUT/DEL` | `/companies`, `/categories`, `/jobs` | Manage master data (DELETE = Soft Delete)            |
| `POST`         | `/applications`                      | Apply for job (Triggers RabbitMQ)                    |
| `GET`          | `/applications`                      | List applications (Support Pagination)               |
| `GET`          | `/applications/:id`                  | Detail applications                                  |
| `PUT/DEL`      | `/applications/:id`                  | Manage applications status                           |
| `GET`          | `/applications/user/:userId`         | Applications by user (Support Pagination)            |
| `GET`          | `/applications/job/:jobId`           | Applications by job (Support Pagination)             |
| `POST/DEL`     | `/jobs/:jobId/bookmark`              | Manage bookmarks                                     |
| `GET`          | `/jobs/:jobId/bookmark/:id`          | Get bookmark detail                                  |
| `GET`          | `/bookmarks`                         | List all bookmarks for user (Support Pagination)     |
| `POST`         | `/documents`                         | Upload PDF to S3 (multipart/form-data)               |
| `DELETE`       | `/documents/:id`                     | Delete document record                               |

---

## 6. Security & Validation

- **JWT Authentication:**
  - Access Token: signed with `HS256` using `ACCESS_TOKEN_KEY`, lifespan **3 hours**, payload `{ "id": "<user-uuid>" }`.
  - Refresh Token: signed with `HS256` using `REFRESH_TOKEN_KEY`, stored in the `authentications` table for validation during _refresh_ or _logout_.
  - Password hashing: **bcrypt** with **10 salt rounds**.
- **Request Validation:** Utilize DTOs and Pipes (`class-validator` or Zod) to prevent _bad requests_. Password fields must have a minimum length of **8 characters**.
- **File Validation:** The `/documents` endpoint only accepts the `application/pdf` _MIME type_ with a maximum file size limit (e.g., 5MB).
- **Rate Limiting:** Applied globally via `@nestjs/throttler`. Concrete limits: `POST /users` (5 req/min), `POST /authentications` (5 req/min), `PUT /authentications` (10 req/min), `POST /documents` (10 req/min). Global fallback: **100 req/min**. Responses: HTTP `429 Too Many Requests`.
- **Error Handling:** Centralized handling using NestJS _Exception Filters_.

---

## 7. Caching Strategy (Redis)

- **Objective:** Reduce PostgreSQL _query_ load for frequently accessed data.
- **Cache Targets:**
  - `GET /companies/:id`
  - `GET /users/:id`
  - `GET /applications/:id`
  - `GET /applications/user/:userId`
  - `GET /applications/job/:jobId`
  - `GET /bookmarks`
- **TTL (Time-To-Live):** 1 hour (3600 seconds).
- **Custom Header:** If data is returned from Redis, append the `X-Data-Source: cache` header.
- **Cache Invalidation:**
  - **CREATE/UPDATE/DELETE** Company → invalidates `companies:{id}` cache.
  - **UPDATE** User → invalidates `users:{id}` cache.
  - **CREATE** Application → invalidates `applications:user:{userId}` and `applications:job:{jobId}` cache.
  - **UPDATE** Application → invalidates `applications:{id}`, `applications:user:{userId}`, and `applications:job:{jobId}` cache.
  - **CREATE/DELETE** Bookmark → invalidates `bookmarks:{userId}` cache.

---

## 8. Asynchronous Processing (RabbitMQ)

- **Workflow:**
  1.  When a candidate applies for a job (`POST /applications`), the system saves the data to the `applications` table.
  2.  NestJS acts as a **Producer**, sending a _message_ (payload: `application_id`) to the `application:created` queue.
  3.  The application returns a `201 Created` success response to the client without waiting for the email process to finish.
- **Consumer (Worker):**
  - An asynchronous _worker_ program listens to the queue.
  - Upon receiving a _message_, the _worker_ queries application details and retrieves the email address of the **job owner**.
  - The _worker_ sends an email notification using Nodemailer to the _job owner_ containing: Applicant Name, Applicant Email, and Application Date.

---

## 9. Environment Variables Requirements

- **App:** `PORT`, `HOST`
- **Database:** `DATABASE_URL` (if using Prisma) or `PGHOST`, `PGUSER`, `PGPASSWORD`, etc.
- **JWT:** `ACCESS_TOKEN_KEY`, `REFRESH_TOKEN_KEY`
- **Redis:** `REDIS_HOST` (or `REDIS_URL`)
- **RabbitMQ:** `RABBITMQ_HOST`, `RABBITMQ_PORT`, `RABBITMQ_USER`, `RABBITMQ_PASSWORD`
- **Mail:** `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASSWORD`
- **S3 Storage:** `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET_NAME`

---

## 10. Acceptance Criteria

- The application can be run using `npm run start:dev`.
- PostgreSQL and NestJS are successfully connected; CRUD operations run using Soft Delete.
- Search and Pagination function correctly on GET list endpoints.
- JWT authentication is functional; protected routes cannot be accessed without a valid token.
- File uploads are successfully sent to S3 Object Storage and filter out non-PDF extensions.
- _Caching_ tests successfully return the `X-Data-Source: cache` header on the second request.
- Email notifications are sent _asynchronously_ via RabbitMQ upon a successful job application process.
- Endpoints are fully documented using Swagger/OpenAPI.
- The code is clean, modular (NestJS _Clean Architecture_), and does not leak credentials.

---

## Revision History

| Version | Date       | Author       | Changes          |
| ------- | ---------- | ------------ | ---------------- |
| 1.0.0   | 2026-04-25 | Gilang Heavy | Initial Document |
