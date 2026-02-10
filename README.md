# Omni AI

Omni is an AI-first system that converts natural language input into structured data such as transactions, todos, and notes.

Instead of manual forms and rigid schemas, users simply express intent — Omni handles extraction, normalization, and confirmation.

This repository is a **monorepo** containing the mobile client, backend API, and shared packages.

---

## Repository Structure

```txt
apps/
├── client/        # Expo + React Native mobile app
└── server/        # FastAPI backend

packages/          # Shared code (types, schemas, AI configs — future)
docs/              # Project-level documentation
