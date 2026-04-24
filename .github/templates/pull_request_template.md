## 🔗 Closes
<!-- Write the issue number resolved by this PR -->
Closes #__

---

## 📋 Summary
<!-- Brief summary of the implementation. Important technical decisions, trade-offs, or things the reviewer should know. -->


---

## 🔄 Type of Change
<!-- Check the appropriate options -->
- [ ] `chore` — Setup, configuration, tooling
- [ ] `feat` — New feature
- [ ] `fix` — Bug fix
- [ ] `database` — Schema, migration, indexing
- [ ] `docs` — Documentation
- [ ] `refactor` — Refactoring without functional changes
- [ ] `test` — Adding or improving tests

---

## ✅ Tasks Completed
<!-- Copy-paste tasks from the closed issue, check all that are completed. PR must not be merged if any task is unchecked. -->
- [ ] ...
- [ ] ...

---

## 🎯 Acceptance Criteria Verified
<!-- Copy-paste AC from the issue, check all that have been verified. -->
- [ ] ...
- [ ] ...

---

## 🧪 How to Test
<!-- Steps to test these changes manually or via Postman -->
1. ...
2. ...

---

## 🔍 Reviewer Checklist
<!-- For the reviewer — check before approving -->
- [ ] Code follows naming conventions (SysDesign §6.1)
- [ ] No integer `id` is exposed in the response
- [ ] No hardcoded credentials
- [ ] Soft delete queries filter `deletedAt IS NULL`
- [ ] Response shape matches `{ status, data }` / `{ status, message }`
- [ ] All new env vars have been added to `.env.example`
