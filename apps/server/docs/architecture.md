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
- Service layer — AI extraction and business logic
- Supabase — Auth and PostgreSQL storage
- OpenRouter — LLM routing

## Principles

- FastAPI routes are thin
- Business logic lives in services
- Schemas are contracts, not logic
- APIs are versioned (`/api/v1`)
