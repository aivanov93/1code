## ADDED Requirements
### Requirement: App-Global Model Catalog
The app SHALL maintain editable app-global Claude and Codex model catalogs in persisted settings.

#### Scenario: Seed defaults once
- **WHEN** the app runs for the first time
- **THEN** it seeds the Claude and Codex catalogs with default rows
- **AND** after initialization the user-owned catalogs remain authoritative

#### Scenario: Separate provider catalogs
- **WHEN** the user edits models in settings
- **THEN** Claude and Codex appear as separate editable tables

### Requirement: Pass-Through Model Slugs
The app SHALL pass configured model slugs through unchanged to provider execution paths.

#### Scenario: Claude send path
- **WHEN** a Claude model row is selected
- **THEN** the configured Claude slug is sent unchanged to the Claude execution path

#### Scenario: Codex send path
- **WHEN** a Codex model row and thinking level are selected
- **THEN** the configured Codex slug and selected thinking level are composed into the outgoing model string without additional slug mapping

### Requirement: Catalog-Based Fallbacks
The app SHALL keep model selection preferences separate from the catalog and fall back safely when rows disappear.

#### Scenario: Deleted selected model
- **WHEN** the currently selected model row is deleted or missing after migration
- **THEN** the app falls back to the provider default row
