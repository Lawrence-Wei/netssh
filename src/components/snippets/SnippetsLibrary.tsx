import { useMemo, useState } from "react";
import { t } from "../../services/i18n";
import type { SnippetCategory } from "../../data/defaults";
import type { Lang, Snippet } from "../../types";
import { Icon } from "../shared/Icons";

interface SnippetsLibraryProps {
  lang: Lang;
  snippets: Snippet[];
  categories: SnippetCategory[];
  onRun?: (snippet: Snippet) => void;
}

export function SnippetsLibrary({ lang, snippets, categories, onRun }: SnippetsLibraryProps) {
  const [cat, setCat] = useState("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    let list = snippets;
    if (cat !== "all") list = list.filter((snippet) => snippet.category === cat);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((snippet) => `${snippet.name} ${snippet.cmd} ${snippet.desc}`.toLowerCase().includes(q));
    }
    return list;
  }, [cat, query, snippets]);

  const cats = categories.map((category) => ({
    ...category,
    label: t(category.i18n, lang),
    count: category.id === "all" ? snippets.length : snippets.filter((snippet) => snippet.category === category.id).length,
  }));

  return (
    <div className="snippets">
      <nav className="snippets-nav">
        <span className="eyebrow">{t("snippets.eyebrow", lang)}</span>
        {cats.map((category) => (
          <button key={category.id} className={cat === category.id ? "active" : ""} onClick={() => setCat(category.id)}>
            <span>{category.label}</span>
            <span className="badge">{category.count}</span>
          </button>
        ))}
      </nav>

      <div className="snippets-main">
        <div className="head">
          <div>
            <span className="eyebrow">{t("snippets.eyebrow", lang)}</span>
            <h2>{t("snippets.title", lang)}</h2>
            <p className="lead">{t("snippets.lead", lang)}</p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div className="search" style={{ width: 240 }}>
              {Icon.search}
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("snippets.search", lang)} />
            </div>
            <button className="btn">
              {Icon.plus}
              <span>{t("snippets.new", lang)}</span>
            </button>
          </div>
        </div>

        <div className="snippet-grid">
          {filtered.map((snippet) => (
            <div className="snippet-card" key={snippet.id} onClick={() => onRun?.(snippet)}>
              <div className="ribbon" />
              <div className="head-row">
                <h4>{snippet.name}</h4>
                <span className="pill">{snippet.category}</span>
              </div>
              <p className="desc">{snippet.desc}</p>
              <pre>$ {snippet.cmd}</pre>
              <div className="foot">
                <div className="tags">
                  {snippet.tags.map((tag) => (
                    <span key={tag} className={"tag" + (tag === "danger" ? " env-prod" : "")}>{tag}</span>
                  ))}
                </div>
                <span className="run">
                  {Icon.play}
                  <span>{t("snippets.run", lang)}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
