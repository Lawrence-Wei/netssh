# Iteration Report: README topology screenshot

## Task

Update the README screenshot so GitHub shows the App UI with multiple Sites and multiple service/device nodes in the network topology view.

## Files Changed

- `README.md`
- `docs/assets/netssh-app-screenshot.png`
- `.ai/backlog.md`
- `.ai/reports/2026-06-08-2210-readme-topology-screenshot.md`

## Summary

- Replaced the previous empty-workbench README screenshot with a topology-focused App screenshot.
- Captured a temporary browser profile seeded with demo Site/Host data only for the screenshot.
- The screenshot shows Office Core, Branch Lab, Homelab, and Cloud Edge with routers, switches, NAS/PVE, Docker, and cloud VPS services.
- Updated README image alt text to describe the topology view.

## Validation

- Passed: `tools\ai-loop\run-validation.ps1`

## Notes

- Demo asset data was injected into a temporary Chrome profile for screenshot capture and was not added to product defaults.
