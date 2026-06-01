import { create } from "zustand";
import { HOST_QUICK_CMDS, SNIPPET_CATEGORIES, SNIPPETS, type QuickCommand, type SnippetCategory } from "../config/defaults";
import type { Snippet } from "../config/types";

interface SnippetsState {
  snippets: Snippet[];
  categories: SnippetCategory[];
  quickCommands: Record<string, QuickCommand[]>;
}

export const useSnippets = create<SnippetsState>(() => ({
  snippets: SNIPPETS,
  categories: SNIPPET_CATEGORIES,
  quickCommands: HOST_QUICK_CMDS,
}));
