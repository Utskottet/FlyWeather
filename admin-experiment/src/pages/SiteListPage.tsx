import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../domain/api";
import type { SiteSummary } from "../../worker/kv";

export function SiteListPage() {
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  async function refresh() {
    setLoading(true);
    const list = await api.listSites();
    setSites(list);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("Delete this site permanently? This cannot be undone.")) return;
    await api.deleteSite(id);
    await refresh();
  }

  async function handleToggleHidden(site: SiteSummary) {
    await api.setStatus(site.id, site.status === "hidden" ? "active" : "hidden");
    await refresh();
  }

  const visible = showHidden ? sites : sites.filter((s) => s.status !== "hidden");

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Sites</h1>
        <button onClick={() => navigate("/sites/new")}>+ New site</button>
      </div>

      <label style={{ display: "block", marginBottom: 12 }}>
        <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> Show hidden
      </label>

      {loading ? (
        <p>Loading…</p>
      ) : visible.length === 0 ? (
        <p>No sites yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th>Name</th>
              <th>Status</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((site) => (
              <tr key={site.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>
                  <Link to={`/sites/${site.id}`}>{site.name || "(untitled)"}</Link>
                </td>
                <td>{site.status}</td>
                <td>{new Date(site.updatedAt).toLocaleString()}</td>
                <td style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => handleToggleHidden(site)}>{site.status === "hidden" ? "Unhide" : "Hide"}</button>
                  <button onClick={() => handleDelete(site.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
