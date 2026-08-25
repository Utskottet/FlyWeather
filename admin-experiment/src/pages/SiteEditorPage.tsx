import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../domain/api";
import { emptyDraftInput, type SiteDraftInput } from "../domain/siteDraft";
import { hasOverlappingBands } from "../domain/bandOverlap";
import { SiteForm } from "../components/SiteForm/SiteForm";
import { downloadYaml, copyYamlToClipboard } from "../domain/yamlExport";

export function SiteEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const navigate = useNavigate();

  const [draft, setDraft] = useState<SiteDraftInput | null>(isNew ? emptyDraftInput() : null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isNew && id) {
      api.getSite(id).then(setDraft);
    }
  }, [id, isNew]);

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    try {
      if (isNew) {
        await api.createSite(draft);
      } else if (id) {
        await api.updateSite(id, draft);
      }
      navigate("/sites");
    } finally {
      setSaving(false);
    }
  }

  if (!draft) return <p style={{ margin: 40 }}>Loading…</p>;

  const exportable = { ...draft, id: isNew ? undefined : id };
  const hasOverlaps = hasOverlappingBands(draft.bands);
  const blocked = saving || !draft.name || !draft.description || hasOverlaps;

  async function handleCopyYaml() {
    await copyYamlToClipboard(exportable);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={{ maxWidth: 640, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>{isNew ? "New site" : "Edit site"}</h1>

      <SiteForm value={draft} onChange={setDraft} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={handleSave} disabled={blocked}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={() => navigate("/sites")}>Cancel</button>
        <button type="button" onClick={handleCopyYaml} disabled={blocked}>
          {copied ? "Copied!" : "Copy YAML"}
        </button>
        <button type="button" onClick={() => downloadYaml(exportable)} disabled={blocked}>
          Download .yaml
        </button>
      </div>
      <p style={{ color: "#666", fontSize: 13, marginTop: 8 }}>
        YAML export is a manual hand-off for review - nothing here writes into the real site's <code>sites/**</code> data.
      </p>
    </div>
  );
}
