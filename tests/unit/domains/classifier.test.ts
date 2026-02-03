import { describe, it, expect } from 'vitest';
import {
  TIERS,
  TIER_DEFINITIONS,
  classifyTier,
  getTierDefinition,
  isValidTier,
  getTierDisplayName,
} from '../../../src/core/domains/classifier.js';

describe('Tier Classifier', () => {
  describe('TIERS', () => {
    it('should have 5 tiers', () => {
      expect(TIERS).toHaveLength(5);
    });

    it('should include all expected tiers', () => {
      expect(TIERS).toContain('guide');
      expect(TIERS).toContain('standard');
      expect(TIERS).toContain('example');
      expect(TIERS).toContain('reference');
      expect(TIERS).toContain('admin');
    });
  });

  describe('TIER_DEFINITIONS', () => {
    it('should have a definition for each tier', () => {
      for (const tier of TIERS) {
        expect(TIER_DEFINITIONS[tier]).toBeDefined();
      }
    });

    it('should have required properties', () => {
      for (const tier of TIERS) {
        const def = TIER_DEFINITIONS[tier];
        expect(def.id).toBe(tier);
        expect(def.name).toBeTruthy();
        expect(def.description).toBeTruthy();
        expect(def.indicators).toBeInstanceOf(Array);
        expect(def.headingPatterns).toBeInstanceOf(Array);
        expect(def.sizeRange.min).toBeLessThan(def.sizeRange.max);
      }
    });
  });

  describe('classifyTier', () => {
    it('should classify guide content', () => {
      const guideContent = `
# How to Setup Authentication

## Overview
This guide shows you how to set up authentication.

## Prerequisites
- Node.js installed
- Database configured

## Step 1: Install dependencies
First, install the required packages.

## Step 2: Configure settings
Next, configure your settings.

## Step 3: Test the setup
Finally, test everything works.
`;

      const result = classifyTier(guideContent);
      expect(result.tier).toBe('guide');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify standard content', () => {
      const standardContent = `
# API Design Standards

## Rules

### Rule 1: Use REST conventions
You MUST use REST conventions for all endpoints.

**DO:**
- Use nouns for resources

**DON'T:**
- Use verbs in URLs

### Rule 2: Naming conventions
All endpoints SHOULD follow kebab-case naming.

## Guidelines
Follow these best practices for consistent API design.
`;

      const result = classifyTier(standardContent);
      expect(['standard', 'guide']).toContain(result.tier);
    });

    it('should classify example content', () => {
      const exampleContent = `
# React Component Example

## Code

\`\`\`typescript
export function Button({ label }: Props) {
  return <button>{label}</button>;
}
\`\`\`

## Usage

\`\`\`typescript
<Button label="Click me" />
\`\`\`

## Output
Renders a button with the label.
`;

      const result = classifyTier(exampleContent);
      expect(['example', 'guide']).toContain(result.tier);
    });

    it('should classify reference content', () => {
      const referenceContent = `
# API Reference

## Endpoints

### GET /api/users

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | number | No | Page number |
| limit | number | No | Items per page |

### POST /api/users

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| name | string | Yes | User name |
| email | string | Yes | User email |

## Types

### User

| Property | Type | Description |
|----------|------|-------------|
| id | string | Unique ID |
| name | string | Display name |

## Methods

### getUser(id)
Returns a user by ID.
`;

      const result = classifyTier(referenceContent);
      expect(['reference', 'admin']).toContain(result.tier);
    });

    it('should return confidence between 0 and 1', () => {
      const content = 'Some random content';
      const result = classifyTier(content);

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should return scores for all tiers', () => {
      const content = 'Some content here';
      const result = classifyTier(content);

      expect(result.scores).toHaveProperty('guide');
      expect(result.scores).toHaveProperty('standard');
      expect(result.scores).toHaveProperty('example');
      expect(result.scores).toHaveProperty('reference');
      expect(result.scores).toHaveProperty('admin');
    });
  });

  describe('getTierDefinition', () => {
    it('should return the correct definition', () => {
      const guideDef = getTierDefinition('guide');
      expect(guideDef.id).toBe('guide');
      expect(guideDef.name).toBe('Guide');
    });
  });

  describe('isValidTier', () => {
    it('should return true for valid tiers', () => {
      expect(isValidTier('guide')).toBe(true);
      expect(isValidTier('standard')).toBe(true);
      expect(isValidTier('admin')).toBe(true);
    });

    it('should return false for invalid tiers', () => {
      expect(isValidTier('invalid')).toBe(false);
      expect(isValidTier('')).toBe(false);
      expect(isValidTier('GUIDE')).toBe(false);
    });
  });

  describe('getTierDisplayName', () => {
    it('should return display names', () => {
      expect(getTierDisplayName('guide')).toBe('Guide');
      expect(getTierDisplayName('standard')).toBe('Standard');
      expect(getTierDisplayName('admin')).toBe('Admin');
    });
  });
});
