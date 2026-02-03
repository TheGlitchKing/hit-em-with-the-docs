---
title: "API Endpoints Guide"
tier: reference
domains: [api]
audience: [developers]
tags: [api, rest, endpoints]
status: active
last_updated: '2025-01-15'
version: '1.0.0'
---

# API Endpoints Guide

Complete reference for all API endpoints.

## Authentication Endpoints

### POST /api/auth/login

Login with email and password.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| email | string | Yes | User email |
| password | string | Yes | User password |

**Response:**

```json
{
  "token": "jwt-token-here",
  "user": {
    "id": 1,
    "email": "user@example.com"
  }
}
```

### POST /api/auth/logout

Invalidate the current session.

## User Endpoints

### GET /api/users

List all users.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | number | No | Page number |
| limit | number | No | Items per page |

### GET /api/users/:id

Get a user by ID.

### POST /api/users

Create a new user.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| name | string | Yes | User name |
| email | string | Yes | User email |
| password | string | Yes | User password |

## Related

- [Authentication Guide](../security/auth-guide.md)
