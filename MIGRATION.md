# Migration Guide: v1.x to v2.0.0

This guide helps you migrate from the unscoped `hit-em-with-the-docs` v1.x package to the scoped `@theglitchking/hit-em-with-the-docs` v2.0.0 package.

## What Changed?

### Package Name (Breaking Change)

The package has been renamed to use the `@theglitchking/` scope:

- **Old**: `hit-em-with-the-docs`
- **New**: `@theglitchking/hit-em-with-the-docs`

### New Features in v2.0.0

- **Claude Code Plugin Support**: Now includes Claude Code plugin manifest for seamless integration
- **Enhanced Distribution**: Available via NPM and Claude Code marketplace
- **Improved Documentation**: Better organized with marketplace metadata

### What Stayed the Same

- All CLI commands remain identical
- All features and functionality are unchanged
- Configuration files and directory structure unchanged
- Templates and documentation structure unchanged

## Migration Steps

### 1. Uninstall Old Package

If you installed globally:

```bash
npm uninstall -g hit-em-with-the-docs
```

If you installed as a dev dependency:

```bash
npm uninstall hit-em-with-the-docs
```

### 2. Install New Scoped Package

Global installation (recommended for CLI use):

```bash
npm install -g @theglitchking/hit-em-with-the-docs
```

Dev dependency installation:

```bash
npm install --save-dev @theglitchking/hit-em-with-the-docs
```

### 3. Update package.json (if applicable)

If you have `hit-em-with-the-docs` in your `package.json`, update it:

```diff
{
  "devDependencies": {
-   "hit-em-with-the-docs": "^1.0.0"
+   "@theglitchking/hit-em-with-the-docs": "^2.0.0"
  },
  "scripts": {
-   "docs:maintain": "hit-em-with-the-docs maintain"
+   "docs:maintain": "hewtd maintain"
  }
}
```

### 4. Update GitHub Actions (if applicable)

If you use the GitHub Action, update to v2:

```diff
name: Documentation Maintenance

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
-     - uses: TheGlitchKing/hit-em-with-the-docs@v1
+     - uses: TheGlitchKing/hit-em-with-the-docs@v2
        with:
          mode: maintain
```

### 5. Verify Installation

Test that the new package works:

```bash
# Check version
hewtd --version  # Should show 2.0.0

# Run a simple command
hewtd list

# Test with npx
npx @theglitchking/hit-em-with-the-docs --version
```

### 6. Update CI/CD Scripts (if applicable)

Update any CI/CD scripts that reference the package:

```diff
# Before
- npm install -g hit-em-with-the-docs
- hit-em-with-the-docs maintain --quick

# After
+ npm install -g @theglitchking/hit-em-with-the-docs
+ hewtd maintain --quick
```

## CLI Commands (Unchanged)

All commands remain the same. You can continue using:

```bash
hewtd init
hewtd maintain
hewtd integrate <file>
hewtd audit
hewtd discover patterns
hewtd report health
# ... all other commands
```

## Compatibility Notes

### Node.js Version

v2.0.0 requires Node.js ≥20.0.0 (same as v1.0.0)

### Documentation Structure

Your existing `.documentation/` directory structure is fully compatible. No changes needed.

### Configuration Files

All configuration files remain compatible:
- `.hewtdrc`
- `hewtd.config.js`
- Templates in `.documentation/`

### Templates

All existing templates in the `templates/` directory are fully compatible.

## Troubleshooting

### Issue: Command not found after migration

**Solution**: Ensure you've uninstalled the old package and installed the new one globally:

```bash
npm uninstall -g hit-em-with-the-docs
npm install -g @theglitchking/hit-em-with-the-docs
```

### Issue: Wrong version showing

**Solution**: Clear npm cache and reinstall:

```bash
npm cache clean --force
npm uninstall -g @theglitchking/hit-em-with-the-docs
npm install -g @theglitchking/hit-em-with-the-docs
```

### Issue: Both old and new packages installed

**Solution**: Uninstall both and reinstall only the new one:

```bash
npm uninstall -g hit-em-with-the-docs
npm uninstall -g @theglitchking/hit-em-with-the-docs
npm install -g @theglitchking/hit-em-with-the-docs
```

### Issue: npx using old version

**Solution**: Clear npx cache:

```bash
npx clear-npx-cache
# Or
rm -rf ~/.npm/_npx
```

## Claude Code Plugin Integration (New in v2.0.0)

v2.0.0 adds support for Claude Code marketplace:

### Install via Claude Code

```bash
# In Claude Code CLI
/plugin install TheGlitchKing/hit-em-with-the-docs
```

### Available Commands in Claude Code

Once installed, you can use these commands in Claude Code:

- `/docs load <domain>` - Load documentation for a specific domain
- `/docs list` - List all documentation domains
- `/docs search <query>` - Search documentation
- `/docs stats` - Show documentation health
- `/discover patterns` - Discover coding patterns
- `/discover anti-patterns` - Detect anti-patterns
- `/discover standards` - Extract coding standards
- `/discover dependencies` - Analyze dependencies

## Support and Questions

If you encounter any issues during migration:

1. Check this guide first
2. Review the [README](README.md) for updated documentation
3. Open an issue: https://github.com/TheGlitchKing/hit-em-with-the-docs/issues
4. Check discussions: https://github.com/TheGlitchKing/hit-em-with-the-docs/discussions

## Timeline

- **v1.0.0**: Original unscoped package (deprecated)
- **v1.1.0**: Final unscoped release with deprecation warning (available for 6 months)
- **v2.0.0**: New scoped package with Claude Code support (current)

The old `hit-em-with-the-docs` package will remain available on NPM for 6 months but will show a deprecation warning. After that period, it may be unpublished.

## Summary Checklist

- [ ] Uninstalled old `hit-em-with-the-docs` package
- [ ] Installed new `@theglitchking/hit-em-with-the-docs` package
- [ ] Updated `package.json` (if applicable)
- [ ] Updated GitHub Actions workflow (if applicable)
- [ ] Updated CI/CD scripts (if applicable)
- [ ] Verified installation with `hewtd --version`
- [ ] Tested basic commands
- [ ] Updated team documentation

Welcome to v2.0.0!
