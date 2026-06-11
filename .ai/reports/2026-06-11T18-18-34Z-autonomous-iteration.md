# Validation Report

- Started: 2026-06-11 18:18:34
- Finished: 2026-06-11 18:19:05
- Result: passed

## Commands

### lint: passed

```text
> netssh@1.1.14 lint
> eslint src --ext .ts,.tsx
```

### test: passed

```text

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at Sidebar (D:\projects\netssh\src\layouts\Sidebar.tsx:18:3)
    at div
    at div
    at App (D:\projects\netssh\src\pages\App.tsx:44:29)
    at ConfirmProvider (D:\projects\netssh\src\components\ConfirmDialog.tsx:6:28)

[90mstderr[2m | src/test/integration.test.tsx[2m > [22m[2m手动连接[2m > [22m[2m手动连接 Connect 按钮可点击
[22m[39mWarning: An update to Sidebar inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at Sidebar (D:\projects\netssh\src\layouts\Sidebar.tsx:18:3)
    at div
    at div
    at App (D:\projects\netssh\src\pages\App.tsx:44:29)
    at ConfirmProvider (D:\projects\netssh\src\components\ConfirmDialog.tsx:6:28)

[90mstderr[2m | src/test/integration.test.tsx[2m > [22m[2mSSH Config 导入[2m > [22m[2m侧边栏 Import 按钮存在且可点击
[22m[39mWarning: An update to Sidebar inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at Sidebar (D:\projects\netssh\src\layouts\Sidebar.tsx:18:3)
    at div
    at div
    at App (D:\projects\netssh\src\pages\App.tsx:44:29)
    at ConfirmProvider (D:\projects\netssh\src\components\ConfirmDialog.tsx:6:28)

[90mstderr[2m | src/test/integration.test.tsx[2m > [22m[2m搜索与过滤[2m > [22m[2mAll → Local → Cloud 过滤互斥
[22m[39mWarning: An update to Sidebar inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at Sidebar (D:\projects\netssh\src\layouts\Sidebar.tsx:18:3)
    at div
    at div
    at App (D:\projects\netssh\src\pages\App.tsx:44:29)
    at ConfirmProvider (D:\projects\netssh\src\components\ConfirmDialog.tsx:6:28)

 [32m✓[39m src/test/integration.test.tsx [2m([22m[2m27 tests[22m[2m)[22m[33m 1919[2mms[22m[39m
   [33m[2m✓[22m[39m 主机管理 UI[2m > [22mAdd host → 自动跳转到详情 → 点击 Edit → Connect [33m562[2mms[22m[39m
   [33m[2m✓[22m[39m 主机管理 UI[2m > [22m新主机详情显示 hostname、user、port、Connect 按钮 [33m485[2mms[22m[39m
   [33m[2m✓[22m[39m 搜索与过滤[2m > [22m搜索框输入后清空不 crash [33m304[2mms[22m[39m
 [32m✓[39m src/test/smoke.test.tsx [2m([22m[2m51 tests[22m[2m)[22m[33m 5457[2mms[22m[39m
   [33m[2m✓[22m[39m 3. Sidebar[2m > [22msearch input accepts typing [33m306[2mms[22m[39m
   [33m[2m✓[22m[39m 5. HostDetail & Editor[2m > [22mdetail view shows SSH info after saving host [33m539[2mms[22m[39m
   [33m[2m✓[22m[39m 5. HostDetail & Editor[2m > [22mEdit button reopens editor [33m563[2mms[22m[39m
   [33m[2m✓[22m[39m 14. Error Handling[2m > [22mXSS input in search does not crash [33m496[2mms[22m[39m

[2m Test Files [22m [1m[32m9 passed[39m[22m[90m (9)[39m
[2m      Tests [22m [1m[32m93 passed[39m[22m[90m (93)[39m
[2m   Start at [22m 18:18:39
[2m   Duration [22m 10.24s[2m (transform 1.89s, setup 545ms, collect 7.97s, tests 9.98s, environment 20.42s, prepare 2.34s)[22m
```

### build: passed

```text
> netssh@1.1.14 build
> tsc && vite build

[36mvite v5.4.21 [32mbuilding for production...[36m[39m
transforming...
[32m✓[39m 102 modules transformed.
rendering chunks...
computing gzip size...
[2mdist/[22m[32mindex.html                        [39m[1m[2m    0.55 kB[22m[1m[22m[2m │ gzip:   0.33 kB[22m
[2mdist/[22m[32massets/asus-Ds_p0d2U.png          [39m[1m[2m   23.73 kB[22m[1m[22m
[2mdist/[22m[32massets/proxmox-IPtpGYKl.png       [39m[1m[2m   28.30 kB[22m[1m[22m
[2mdist/[22m[32massets/huawei-Cq9wBr02.png        [39m[1m[2m   35.97 kB[22m[1m[22m
[2mdist/[22m[32massets/raspberry-pi-CZhK8q0S.png  [39m[1m[2m   41.63 kB[22m[1m[22m
[2mdist/[22m[32massets/zspace-logo-9NFp48k3.png   [39m[1m[2m   61.37 kB[22m[1m[22m
[2mdist/[22m[35massets/index-BIRGgg5g.css         [39m[1m[2m   69.90 kB[22m[1m[22m[2m │ gzip:  13.57 kB[22m
[2mdist/[22m[36massets/window-CdxGPXez.js         [39m[1m[2m   13.96 kB[22m[1m[22m[2m │ gzip:   3.46 kB[22m[2m │ map:   100.52 kB[22m
[2mdist/[22m[36massets/index-D0z2-usb.js          [39m[1m[33m1,034.67 kB[39m[22m[2m │ gzip: 304.14 kB[22m[2m │ map: 3,198.57 kB[22m
[33m
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.[39m
[32m✓ built in 6.69s[39m
```

### cargo-test: passed

```text
Finished `test` profile [unoptimized + debuginfo] target(s) in 1.31s
     Running unittests src\lib.rs (src-tauri\target\debug\deps\netssh_lib-334ba2e04876ca74.exe)

running 9 tests
test credentials::tests::round_trip ... ignored, writes to the real keystore — run manually
test serial::tests::normalize_line_ending_known_modes ... ok
test ssh::tests::host_matches_bracketed_nonstandard_port ... ok
test serial::tests::parse_invalid_data_bits ... ok
test ssh::tests::host_matches_plain_host_matches_all_ports ... ok
test serial::tests::parse_data_bits_default ... ok
test ssh::tests::host_matches_comma_separated_entries ... ok
test ssh_config::tests::preserves_multiple_aliases_and_site_comments ... ok
test ssh_config::tests::parses_basic_config ... ok

test result: ok. 8 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.01s

     Running unittests src\main.rs (src-tauri\target\debug\deps\netssh-ba909a0ae94dd030.exe)

running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

     Running tests\integration.rs (src-tauri\target\debug\deps\integration-6c9df998f8afc914.exe)

running 8 tests
test host_matches_complex_known_hosts_lines ... ok
test registry_insert_and_remove ... ok
test known_hosts_does_not_match_wrong_host ... ok
test known_hosts_parses_plain_entry ... ok
test known_hosts_ignores_comments_and_blanks ... ok
test expand_tilde_expands_user_home ... ok
test ssh_config_parse_handles_includes_and_wildcards ... ok
test storage_db_open_and_migrate ... ok

test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.05s

   Doc-tests netssh_lib

running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```
