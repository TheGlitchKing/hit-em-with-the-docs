---
title: "Database Schema Guide"
tier: guide
domains: [database]
audience: [developers, devops]
tags: [database, postgresql, schema]
status: active
last_updated: '2025-01-10'
version: '1.0.0'
---

# Database Schema Guide

Documentation for the database schema.

## Overview

Our application uses PostgreSQL for data storage.

## Tables

### users

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| email | varchar(255) | User email |
| password_hash | varchar(255) | Hashed password |
| created_at | timestamp | Creation date |

### sessions

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| user_id | integer | Foreign key to users |
| token | varchar(255) | Session token |
| expires_at | timestamp | Expiration date |

## Migrations

Run migrations with:

```bash
npm run db:migrate
```

## Related

- [Authentication Guide](../security/auth-guide.md)
- [API Reference](../api/endpoints-guide.md)
- [Non-existent Document](../missing/document.md)
