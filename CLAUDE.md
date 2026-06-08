# Claude Development Guidelines

Write high-quality, modular, maintainable, and readable code.

## Project Structure

Keep frontend, backend, persistence, tooling, and documentation responsibilities separate. Prefer feature-oriented modules with clear ownership and small public interfaces.

## Versioning

Use Semantic Versioning in the MAJOR.MINOR.PATCH format. Tag releases, keep release notes clear, and document migration notes for incompatible changes.

## Code Standards

- Use meaningful names for variables, functions, modules, and files.
- Keep configuration, user-facing text, constants, and business logic separated.
- Add focused comments only where they clarify non-obvious behavior.
- Keep formatting consistent and avoid unnecessary duplication.
- Add tests for security logic, parsers, imports, connection behavior, and bug fixes.
- Prefer small, reviewable changes over broad rewrites.

## Output Expectations

When making development changes, explain the structure touched, summarize what changed, and include validation results.
