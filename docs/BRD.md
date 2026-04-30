# 📑 Business Requirements Document (BRD) - OpenJob

> **Version:** 1.0.0
> **Product Name:** OpenJob
> **Target Audience:** Internal Recruitment Team, Job Seekers (Candidates), HR/Company Representatives

---

## 1. Executive Summary

**OpenJob** is an enterprise-scale internal recruitment platform designed to connect talent (job seekers) with available job vacancies across various companies. The system aims to digitize, automate, and accelerate the recruitment cycle, starting from job publication and candidate search to the application and notification processes.

The primary focus of this product is **access speed** (through Redis _caching_), **background processing stability** (asynchronous notifications via RabbitMQ), and **data security** (centralized document storage in S3, JWT authentication, and _rate limiting_).

---

## 2. Business Objectives

1. **Digitization of the Recruitment Process:** Transitioning manual/email-based job application processes into a single centralized platform.
2. **HR Operational Efficiency:** Ensuring job creators (HR/Companies) receive instant and reliable notifications (via email) when there is a new applicant without overloading the main _server_.
3. **Fast User Experience:** Presenting job vacancy data, company profiles, and user profiles instantly using _caching_ technology.
4. **Data Security & Compliance:** Guaranteeing user data privacy, implementing _soft delete_ for audit trails/data history, and securely storing resumes (PDFs) in cloud storage (S3).

---

## 3. Target Users (User Personas)

1. **Candidate (Job Seeker):**
   - Registers and manages a public profile.
   - Searches and filters job vacancies based on title or company.
   - Saves (_bookmarks_) interesting job vacancies.
   - Uploads a resume (CV) in PDF format.
   - Applies for jobs and monitors application status.

2. **Employer / HR (Company):**
   - Registers a company entity.
   - Creates, updates, and deletes (_soft delete_) job postings.
   - Receives real-time email notifications when a candidate applies.
   - Views and updates applicant statuses (e.g., _pending_, _accepted_, _rejected_).

---

## 4. Business Workflows

### 4.1. User Registration & Authentication Workflow

1. A user (Candidate/Employer) visits the application and fills out the registration form (Full Name, Email, Password).
2. The system validates email uniqueness. If _valid_, the password is encrypted (Bcrypt) and the data is stored in the database.
3. The user _Logs in_ with their email and password.
4. The system verifies the credentials and returns an **Access Token** (short TTL) & **Refresh Token** (long TTL).
5. The user utilizes the Access Token to access internal features (_Protected Endpoints_).

### 4.2. Job Posting Creation Workflow

1. An _Employer_ (who is logged in) creates a Company profile.
2. The _Employer_ creates a Job Category if it doesn't already exist.
3. The _Employer_ publishes a Job Vacancy with details: Title, Description, Location, Salary, and Job Type.
4. The vacancy immediately becomes available on the _public feed_ and can be searched by _Candidates_.

### 4.3. Job Application & Notification Workflow

1. A _Candidate_ searches for job vacancies on the public page.
2. Before applying, the _Candidate_ must upload a resume (PDF, max 5MB) via the Document Management feature (uploaded to S3 Object Storage).
3. The _Candidate_ clicks the "Apply" button on the selected vacancy.
4. The system records the application data in the database with a default status: _Pending_.
5. **(Asynchronous Process):** The main system (_Producer_) sends a message to the RabbitMQ queue (`application:created`) and immediately returns a success response to the _Candidate_.
6. A RabbitMQ _Worker/Consumer_ receives the message, looks up the email address of the _Employer_ who created the vacancy, and then sends an email notification (via Nodemailer) containing the applicant's data.

### 4.4. Application Management Workflow

1. The _Employer_ receives the email notification and opens the OpenJob dashboard.
2. The _Employer_ views the list of incoming applications for their vacancy.
3. The _Employer_ downloads/views the candidate's PDF resume directly via the S3 _presigned_ URL provided by the system.
4. After evaluation, the _Employer_ updates the candidate's application status to _Accepted_ or _Rejected_.
5. The _Candidate_ can monitor this status change on their profile dashboard.

### 4.5. Performance Optimization Workflow (Data Caching)

1. When a _Candidate_ or visitor views Company details, User details, or lists of Applications/Bookmarks, the system first checks the Redis _cache_.
2. If the data exists in Redis (_Cache Hit_), the system returns the data in milliseconds along with the `X-Data-Source: cache` _header_.
3. If the data does not exist (_Cache Miss_), the system queries the PostgreSQL database, returns the data to the client, and then stores that data in Redis with a TTL (Time-to-Live) of 1 Hour.
4. If an _Employer_ or _Candidate_ modifies data (Update/Delete/Create), the system automatically deletes (_Invalidates_) the related _cache_ data in Redis to ensure information remains accurate.

---

## 5. Key Business Rules & Constraints

- **Identity Security:** The internal _Primary Key_ (Integer ID) from the _database_ must not be exposed to the public/API. The system must use a UUID as the public identity (_Public Identifier_).
- **Data Integrity:** Deletion of master data (Company, Category, Job, Application) must use the **Soft Delete** method (populating the `deleted_at` column) so that recruitment history is not permanently lost.
- **Document Validation:** The system only accepts resume documents in PDF format (`application/pdf`) to prevent _malware_ uploads or non-standard _files_, with a strictly configured size limit (e.g., 5MB).
- **API Protection (Rate Limiting):** Crucial endpoints such as Login, Registration, and Document Upload must be protected from _brute-force_ or _spam_ attacks using a _Rate Limiting_ mechanism (e.g., 5-10 requests per minute).

---

## Revision History

| Version | Date       | Author       | Changes          |
| ------- | ---------- | ------------ | ---------------- |
| 1.0.0   | 2026-04-25 | Gilang Heavy | Initial Document |
