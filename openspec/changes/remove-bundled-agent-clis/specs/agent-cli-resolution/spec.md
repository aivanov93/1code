## ADDED Requirements
### Requirement: External Agent CLI Resolution
The desktop app SHALL use external Claude and Codex executables from the environment instead of bundled copies in `resources/bin`.

#### Scenario: Claude override wins
- **WHEN** `CLAUDE_CODE_EXECUTABLE` is set
- **THEN** Claude sessions use that executable

#### Scenario: PATH fallback works
- **WHEN** no explicit override is set and `claude` or `codex` exists on PATH
- **THEN** the app resolves and launches the CLI from PATH

#### Scenario: Missing executable fails clearly
- **WHEN** the configured override is invalid or the CLI is absent from PATH
- **THEN** the app surfaces a clear error telling the user to set the override or install the CLI
