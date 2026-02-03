import { describe, it, expect } from 'vitest';
import {
  detectDomain,
  detectDomainFromPath,
  detectDomainFromContent,
  suggestDomainsForFile,
} from '../../../src/core/domains/detector.js';

describe('Domain Detector', () => {
  describe('detectDomain', () => {
    it('should detect domain from file path', () => {
      const result = detectDomain('.documentation/security/auth-guide.md');
      expect(result.domain).toBe('security');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect domain from devops path', () => {
      const result = detectDomain('.documentation/devops/docker-setup.md');
      expect(result.domain).toBe('devops');
    });

    it('should detect domain from database path', () => {
      const result = detectDomain('.documentation/database/schema-guide.md');
      expect(result.domain).toBe('database');
    });

    it('should return null domain for unknown path', () => {
      const result = detectDomain('random/path/file.md');
      expect(result.domain).toBeNull();
    });

    it('should use content when path has low confidence', () => {
      const content = `
# Security Authentication Guide

This guide covers authentication and authorization with OAuth2 and JWT.
Learn how to implement secure authentication patterns.

## OAuth2 Implementation
Configure OAuth2 and authentication for secure access.
Handle secrets and credentials properly.
`;
      const result = detectDomain('docs/guide.md', content);
      expect(result.domain).toBe('security');
      expect(result.method).toBe('keywords');
    });
  });

  describe('detectDomainFromPath', () => {
    it('should detect domain from first path segment', () => {
      const result = detectDomainFromPath('.documentation/api/endpoints.md', '.documentation');
      expect(result.domain).toBe('api');
      expect(result.confidence).toBe(1.0);
    });

    it('should handle Windows-style paths', () => {
      const result = detectDomainFromPath('.documentation\\security\\auth.md', '.documentation');
      expect(result.domain).toBe('security');
    });

    it('should detect from filename if no folder match', () => {
      const result = detectDomainFromPath('random/security-guide.md', '.');
      expect(result.domain).toBe('security');
      expect(result.confidence).toBeLessThan(1.0);
    });

    it('should return null for non-matching paths', () => {
      const result = detectDomainFromPath('random/folder/file.md', '.documentation');
      expect(result.domain).toBeNull();
    });
  });

  describe('detectDomainFromContent', () => {
    it('should detect security domain from keywords', () => {
      const content = `
# Authentication Guide

Learn how to implement secure authentication with OAuth2 and JWT tokens.
Handle authorization and permissions correctly.
`;
      const result = detectDomainFromContent(content);
      expect(result.domain).toBe('security');
      expect(result.method).toBe('keywords');
    });

    it('should detect devops domain from keywords', () => {
      const content = `
# Docker Deployment

Deploy your application using Docker containers and CI/CD pipelines.
Configure Kubernetes for production.
`;
      const result = detectDomainFromContent(content);
      expect(result.domain).toBe('devops');
    });

    it('should detect database domain from keywords', () => {
      const content = `
# Database Schema

Define your PostgreSQL schema with proper migrations.
Use SQL queries efficiently.
`;
      const result = detectDomainFromContent(content);
      expect(result.domain).toBe('database');
    });

    it('should provide alternative domains', () => {
      const content = `
# API Security

Secure your REST API endpoints with authentication.
Use proper database queries for user validation.
`;
      const result = detectDomainFromContent(content);
      expect(result.alternativeDomains.length).toBeGreaterThan(0);
    });

    it('should return null for no keyword matches', () => {
      const content = 'Random content with no specific keywords.';
      const result = detectDomainFromContent(content);
      expect(result.domain).toBeNull();
    });
  });

  describe('suggestDomainsForFile', () => {
    it('should suggest security for auth-related filename', () => {
      const suggestions = suggestDomainsForFile('authentication-guide.md');
      expect(suggestions).toContain('security');
    });

    it('should suggest api for endpoint-related filename', () => {
      const suggestions = suggestDomainsForFile('rest-api-endpoints.md');
      expect(suggestions).toContain('api');
    });

    it('should suggest testing for test-related filename', () => {
      const suggestions = suggestDomainsForFile('test-strategy.md');
      expect(suggestions).toContain('testing');
    });

    it('should return empty array for generic filename', () => {
      const suggestions = suggestDomainsForFile('readme.md');
      expect(suggestions).toBeInstanceOf(Array);
    });
  });
});
