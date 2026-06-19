# ASUS Router Icon Detection

## Task

Fix ASUS router icon detection so ASUS routers are not overwritten by the generic Linux / Tux icon after SSH metadata probing.

## Files Changed

- `src-tauri/src/ssh.rs`
- `src/components/BrandIcons.tsx`
- `src/components/HostForm.tsx`
- `src/utils/deployScope.ts`
- `src/assets/i18n/en.json`
- `src/assets/i18n/zh.json`
- `src/test/host-metadata.test.tsx`
- `src/test/host-form-connection-type.test.tsx`

## Validation

- `npm test -- --run src/test/host-metadata.test.tsx src/test/host-form-connection-type.test.tsx`
- `cargo test --manifest-path src-tauri\Cargo.toml host_metadata_probe_prefers_asus_router_over_generic_linux`
- `tools\ai-loop\run-validation.ps1`
- `npm run tauri:build`

All validation commands passed. The generated installer was installed locally with `netssh-auto-install`.

## Notes

ASUSWRT / RT-AX / RT-AC / GT-AX / AiMesh signals now take precedence over generic Linux detection. The resulting `asus` metadata has enough confidence to replace an older `linux` icon override.
