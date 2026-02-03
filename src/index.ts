/**
 * hit-em-with-the-docs
 *
 * Self-managing documentation system with hierarchical structure,
 * intelligent automation, pattern discovery, and agent orchestration.
 */

// Core domain system
export * from './core/domains/constants.js';
export * from './core/domains/detector.js';
export * from './core/domains/classifier.js';

// Metadata system
export * from './core/metadata/schema.js';
export * from './core/metadata/generator.js';

// Utilities
export * from './utils/logger.js';
export * from './utils/glob.js';
export * from './utils/frontmatter.js';
export * from './utils/markdown.js';

// Generators
export * from './generators/scaffold.js';
export * from './generators/index-generator.js';
export * from './generators/registry-generator.js';

// Core automation
export * from './core/metadata/sync.js';
export * from './core/links/checker.js';
export * from './core/links/tracker.js';
export * from './core/audit/auditor.js';
export * from './core/integrate/integrator.js';
export * from './core/maintain/orchestrator.js';

// Discovery system
export * from './core/discover/patterns.js';
export * from './core/discover/antipatterns.js';
export * from './core/discover/standards.js';
export * from './core/discover/dependencies.js';

// Reports
export * from './reports/health-report.js';
export * from './reports/audit-report.js';
export * from './reports/link-report.js';
