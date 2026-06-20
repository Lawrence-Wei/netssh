# Windows Autostart + Tray Startup

## Summary

Implemented the Settings -> Advanced autostart toggle as a real Windows current-user startup entry. When enabled, Netssh writes an `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` value that launches the installed executable with `--minimized-to-tray`.

## Changes

- Added Rust lifecycle setup for tray creation, close-to-tray behavior, and startup-hidden launch.
- Added Tauri commands to read and update the Windows autostart state.
- Enabled the Tauri tray feature and Windows registry bindings.
- Wired Settings -> Advanced autostart switch to the backend commands.
- Added frontend mocks and a settings test for the autostart toggle.

## Notes

- The startup entry is per-user and does not require administrator rights.
- Disabling the setting removes the Netssh Run value.
- The tray menu has restore and quit actions; closing the main window hides it to tray.
