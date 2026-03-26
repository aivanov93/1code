# Change: configurable model catalog

## Why
1Code hardcodes its Claude and Codex model catalogs in the renderer. That blocks newer models like Opus/Sonnet 1M and Codex 5.4, forces slug mapping logic into code, and makes the Models settings screen misleading because it only hides hardcoded rows instead of letting the user define the catalog.

## What Changes
- Replace hardcoded Claude and Codex model arrays with app-global stored catalogs
- Make the Models settings screen an editable catalog table instead of visibility toggles
- Pass configured model slugs through unchanged to Claude/Codex execution paths
- Remove the old custom Claude model override UI from the Models settings surface

## Impact
- Affected specs: `model-catalog`
- Affected code: renderer model atoms/selectors/transports, Models settings UI
