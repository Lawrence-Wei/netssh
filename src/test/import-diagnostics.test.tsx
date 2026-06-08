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
});
