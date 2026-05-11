# Architecture Overview

## Purpose

The Omni backend is an AI-first API that converts natural language input
into structured data (transactions, todos, notes).

It is designed to:
- minimize client-side logic
- evolve schemas safely
- support AI-driven workflows

## High-level Components

- FastAPI — HTTP boundary and OpenAPI contracts
- Service layer — orchestration entrypoints and business logic
- LangGraph — workflow graph for LLM-backed orchestration
- Supabase — Auth and PostgreSQL storage
- SQLAlchemy + Alembic — ORM models and schema migrations for app-owned tables
- DeepSeek API — model access via the OpenAI-format chat completions API

## Principles

- FastAPI routes are thin
- Business logic lives in services
- Graph nodes stay isolated from HTTP concerns
- Schemas are contracts, not logic
- APIs are versioned (`/api/v1`)
