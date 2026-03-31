## ADDED Requirements

### Requirement: Register Graphite As A Details Sidebar Widget

The system SHALL provide a `Graphite` details-sidebar widget that follows the existing per-workspace widget visibility and ordering model.

#### Scenario: Default widget placement in a local workspace

- **WHEN** a user opens a local workspace that has no saved widget preferences
- **THEN** the details sidebar SHALL include a `Graphite` widget
- **AND** the widget SHALL be visible by default
- **AND** the widget SHALL appear immediately after `Changes` in the default widget order
- **AND** the widget SHALL not expose expanded-sidebar mode in v1

#### Scenario: Per-workspace widget preferences still apply

- **WHEN** a user hides, shows, or reorders the `Graphite` widget from `Edit widgets`
- **THEN** the system SHALL persist that visibility/order using the same per-workspace behavior as the other details widgets

#### Scenario: Remote chat does not show Graphite

- **WHEN** the active chat is a remote or sandbox workspace without a local worktree
- **THEN** the `Graphite` widget SHALL not render

### Requirement: Surface Graphite Eligibility And Empty States

The system SHALL detect whether a local repo can provide Graphite stack data and SHALL show read-only empty states when it cannot.

#### Scenario: Graphite CLI is unavailable

- **WHEN** the active local workspace does not have an executable `gt` CLI available
- **THEN** the `Graphite` widget SHALL render an install/setup empty state
- **AND** the widget SHALL include a CTA for enabling Graphite support

#### Scenario: Repo is not initialized for Graphite

- **WHEN** the repo-level Graphite listing command fails or the current branch is not Graphite-tracked
- **THEN** the `Graphite` widget SHALL render an initialization empty state
- **AND** the widget SHALL include a CTA for initializing or setting up Graphite for that repo

### Requirement: Render The Full Repo Stack Tree

The system SHALL render the repo's full Graphite stack tree using Graphite-provided hierarchy and worktree placement data.

#### Scenario: Show all stacks in the repo

- **WHEN** Graphite data is available for the active local workspace
- **THEN** the widget SHALL show the full repo tree rather than only the current stack
- **AND** each tree row SHALL show the branch name
- **AND** each tree row MAY show the checked-out worktree basename when Graphite reports one
- **AND** the tree SHALL remain in the normal sidebar scroll flow with no widget-specific internal height cap

### Requirement: Render The Current Stack PR Summary

The system SHALL render a current-stack PR list ordered from tip to trunk and enrich it with GitHub metadata when available.

#### Scenario: GitHub metadata is available

- **WHEN** Graphite data is available and GitHub metadata can be resolved
- **THEN** the widget SHALL show current-stack PR rows ordered tip -> trunk
- **AND** each PR row SHALL include the PR number
- **AND** each PR row SHALL include a Graphite link and a GitHub link
- **AND** each PR row SHALL include PR state, review decision, and aggregate checks status
- **AND** each PR row SHALL list failing check names when checks are failing

#### Scenario: GitHub metadata is unavailable

- **WHEN** Graphite data is available but GitHub metadata cannot be resolved
- **THEN** the widget SHALL still show the full repo tree
- **AND** the widget SHALL still show any current-stack PR rows available from Graphite
- **AND** GitHub-dependent metadata fields MAY be omitted
- **AND** the widget SHALL not replace the full content with a blocking error state

### Requirement: Keep V1 Read-Only And Link-First

The system SHALL keep the v1 `Graphite` widget read-only and use outbound links as its primary interaction model.

#### Scenario: Tree row interaction

- **WHEN** a user clicks a tree row that has a Graphite PR link
- **THEN** the system SHALL open the Graphite PR

#### Scenario: PR row interaction

- **WHEN** a user clicks a current-stack PR row
- **THEN** the system SHALL open the Graphite PR

#### Scenario: No mutation actions in v1

- **WHEN** the `Graphite` widget is rendered
- **THEN** it SHALL not expose stack mutation actions such as sync, restack, submit, checkout, create branch, move branch, rename branch, or delete branch
