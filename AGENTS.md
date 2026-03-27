<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

## Testing

- Prefer Electron Playwright for app-shell flows instead of browser-only Playwright when the behavior depends on the real desktop app.
- Install browser deps with `bun run test:electron:install`.
- Run the smoke / regression suite with `bun run test:electron`.
- Use `bun run test:electron:headed` while developing selectors or interaction behavior.
- Electron tests should launch against an isolated `ONECODE_USER_DATA_PATH` so they never mutate the normal `Agents Dev` profile.
