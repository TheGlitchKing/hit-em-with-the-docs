---
title: "API Endpoints Reference"
tier: reference
domains: [api]
audience: [developers]
tags: [api, rest, endpoints]
status: active
last_updated: '2025-01-15'
version: '1.0.0'
purpose: "Reference for all API endpoints"
---

# API Endpoints Reference

Complete reference for all API endpoints.

## Authentication

### POST /api/auth/login

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| email | string | Yes | User email |
| password | string | Yes | User password |

**Response:**

```json
{
  "token": "jwt-token-here",
  "user": { "id": 1, "email": "user@example.com" }
}
```

### POST /api/auth/logout

Invalidates the current session.

## Users

### GET /api/users

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | number | No | Page number |
| limit | number | No | Items per page |

### GET /api/users/:id

Get user by ID.

### POST /api/users

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| name | string | Yes | User name |
| email | string | Yes | User email |

## Related

- [Authentication Guide](../security/auth-guide.md)
