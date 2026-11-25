# Backend — reserved area

This folder is intentionally empty. It will host future server-side code: store, database, APIs and
their configuration files.

For now the frontend is completely static. The dominance algorithm, the computed frontier and the
example templates live in `../frontend/src/domain/` and are not loaded from any service. Projects
are kept as portable JSON files exported from the workspace; there is no local or remote persistence.

## When this folder is populated

1. Define runtime, dependencies and scripts in a dedicated `package.json`.
2. Add a `store` layer connected to the chosen database.
3. Document endpoints and environment variables in this file.
4. Update `../doc/SPEC.md` and `../doc/TECH_STACK.md`.
5. Keep `../frontend/src/domain/pareto.ts` as the single source of the dominance algorithm.
