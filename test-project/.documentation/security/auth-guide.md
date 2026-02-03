---
title: "Authentication Guide"
tier: guide
domains: [security]
audience: [developers]
tags: [auth, oauth, jwt]
status: active
last_updated: '2025-01-15'
version: '1.0.0'
purpose: "Guide for implementing authentication"
---

# Authentication Guide

This guide covers authentication implementation for our application.

## Overview

Learn how to implement secure authentication using OAuth2 and JWT tokens.

## Prerequisites

- Node.js 18+
- Database configured
- Environment variables set

## Step 1: Install Dependencies

```bash
npm install passport passport-jwt jsonwebtoken
```

## Step 2: Configure JWT

Configure your JWT settings in the environment:

```typescript
const jwtConfig = {
  secret: process.env.JWT_SECRET,
  expiresIn: '24h'
};
```

## Step 3: Implement Middleware

Create the authentication middleware:

```typescript
import jwt from 'jsonwebtoken';

export function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

## Step 4: Test Authentication

Run the test suite to verify:

```bash
npm test -- --grep "auth"
```

## Related Documents

- [API Endpoints](../api/endpoints-guide.md)
- [Database Schema](../database/schema-guide.md)
