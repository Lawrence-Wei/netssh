import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { exists } from "@tauri-apps/plugin-fs";
import { ImportDialog } from "../pages/ImportDialog";

describe("ImportDialog diagnostics", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockClear();
    vi.mocked(exists).mockClear();
  });

  it("warns when an imported SSH IdentityFile path is missing", async () => {
    const missingPath = "C:\\Users\\lawrence\\.ssh\\missing_ed25519";

    vi.mocked(invoke).mockResolvedValueOnce([
      {
        alias: "office-core-sw",
        hostname: "10.8.0.10",
        user: "admin",
        port: 22,
        identity_file: missingPath,
        group: "office",
        source: "ssh-config",
        raw: "Host office-core-sw",
      },
    ]);
    vi.mocked(exists).mockResolvedValueOnce(false);

    render(
      <ImportDialog
        lang="en"
        existingHosts={[]}
        onClose={vi.fn()}
        onImport={vi.fn()}
      />
    );

    await userEvent.click(screen.getByText("Read ~/.ssh"));

    expect(await screen.findByText(/references a missing IdentityFile/i)).toBeTruthy();
    expect(screen.getByText(new RegExp(missingPath.replace(/\\/g, "\\\\").replace(/\./g, "\\.")))).toBeTruthy();
    expect(exists).toHaveBeenCalledWith(missingPath);
  });

  it("keeps import actions visible when many diagnostics are shown", async () => {
    const entries = Array.from({ length: 24 }, (_, index) => ({
      alias: `host-${index}`,
      hostname: `10.8.0.${index + 1}`,
      user: "root",
      port: 22,
      identity_file: `C:\\Users\\lawrence\\.ssh\\missing_${index}`,
      group: "office",
      source: "ssh-config",
      raw: `Host host-${index}`,
    }));
    const onImport = vi.fn();

    vi.mocked(invoke).mockResolvedValueOnce(entries);
    vi.mocked(exists).mockResolvedValue(false);

    render(
      <ImportDialog
        lang="en"
        existingHosts={[]}
        onClose={vi.fn()}
        onImport={onImport}
      />
    );

    await userEvent.click(screen.getByText("Read ~/.ssh"));

    expect(await screen.findByText(/host-23 references a missing IdentityFile/i)).toBeTruthy();
    expect(document.querySelector(".import-card__body .import-diagnostics")).toBeTruthy();
    expect(document.querySelector(".import-card__actions")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: /^Import$/ }));
    expect(onImport).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ alias: "host-0" }),
      expect.objectContaining({ alias: "host-23" }),
    ]));
  });
});
