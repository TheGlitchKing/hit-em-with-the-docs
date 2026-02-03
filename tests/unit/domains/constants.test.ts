import { describe, it, expect } from 'vitest';
import {
  DOMAINS,
  DOMAIN_DEFINITIONS,
  getDomainDefinition,
  getAllDomains,
  getDomainsByCategory,
  getDomainsByPriority,
  isValidDomain,
  getAllKeywords,
} from '../../../src/core/domains/constants.js';

describe('Domain Constants', () => {
  describe('DOMAINS', () => {
    it('should have 15 domains', () => {
      expect(DOMAINS).toHaveLength(15);
    });

    it('should include all expected domains', () => {
      const expectedDomains = [
        'agents', 'api', 'architecture', 'backups', 'database',
        'devops', 'features', 'plans', 'procedures', 'quickstart',
        'security', 'standards', 'testing', 'troubleshooting', 'workflows',
      ];

      for (const domain of expectedDomains) {
        expect(DOMAINS).toContain(domain);
      }
    });
  });

  describe('DOMAIN_DEFINITIONS', () => {
    it('should have a definition for each domain', () => {
      for (const domain of DOMAINS) {
        expect(DOMAIN_DEFINITIONS[domain]).toBeDefined();
      }
    });

    it('should have required properties for each definition', () => {
      for (const domain of DOMAINS) {
        const def = DOMAIN_DEFINITIONS[domain];
        expect(def.id).toBe(domain);
        expect(def.name).toBeTruthy();
        expect(def.description).toBeTruthy();
        expect(def.keywords).toBeInstanceOf(Array);
        expect(def.keywords.length).toBeGreaterThan(0);
        expect(def.loadPriority).toBeGreaterThanOrEqual(1);
        expect(def.loadPriority).toBeLessThanOrEqual(10);
        expect(['core', 'development', 'features', 'advanced']).toContain(def.category);
      }
    });
  });

  describe('getDomainDefinition', () => {
    it('should return the correct definition', () => {
      const securityDef = getDomainDefinition('security');
      expect(securityDef.id).toBe('security');
      expect(securityDef.name).toBe('Security');
    });
  });

  describe('getAllDomains', () => {
    it('should return all domains', () => {
      const domains = getAllDomains();
      expect(domains).toEqual(DOMAINS);
    });
  });

  describe('getDomainsByCategory', () => {
    it('should return domains for core category', () => {
      const coreDomains = getDomainsByCategory('core');
      expect(coreDomains).toContain('security');
      expect(coreDomains).toContain('devops');
      expect(coreDomains).toContain('database');
      expect(coreDomains).toContain('api');
    });

    it('should return domains for development category', () => {
      const devDomains = getDomainsByCategory('development');
      expect(devDomains).toContain('standards');
      expect(devDomains).toContain('testing');
    });
  });

  describe('getDomainsByPriority', () => {
    it('should return domains sorted by priority (highest first)', () => {
      const sorted = getDomainsByPriority();

      // First domain should have highest priority
      const firstPriority = DOMAIN_DEFINITIONS[sorted[0]!].loadPriority;
      const lastPriority = DOMAIN_DEFINITIONS[sorted[sorted.length - 1]!].loadPriority;

      expect(firstPriority).toBeGreaterThanOrEqual(lastPriority);
    });

    it('should have standards near the top (priority 10)', () => {
      const sorted = getDomainsByPriority();
      const standardsIndex = sorted.indexOf('standards');
      expect(standardsIndex).toBeLessThan(5);
    });
  });

  describe('isValidDomain', () => {
    it('should return true for valid domains', () => {
      expect(isValidDomain('security')).toBe(true);
      expect(isValidDomain('api')).toBe(true);
      expect(isValidDomain('standards')).toBe(true);
    });

    it('should return false for invalid domains', () => {
      expect(isValidDomain('invalid')).toBe(false);
      expect(isValidDomain('')).toBe(false);
      expect(isValidDomain('SECURITY')).toBe(false); // Case sensitive
    });
  });

  describe('getAllKeywords', () => {
    it('should return a map of keywords to domains', () => {
      const keywords = getAllKeywords();

      expect(keywords).toBeInstanceOf(Map);
      expect(keywords.size).toBeGreaterThan(0);
    });

    it('should map security keywords to security domain', () => {
      const keywords = getAllKeywords();

      const securityKeyword = keywords.get('security');
      expect(securityKeyword).toContain('security');

      const authKeyword = keywords.get('auth');
      expect(authKeyword).toContain('security');
    });
  });
});
