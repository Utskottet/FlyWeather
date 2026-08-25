import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { SiteListPage } from "./pages/SiteListPage";
import { SiteEditorPage } from "./pages/SiteEditorPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/sites" element={<SiteListPage />} />
        <Route path="/sites/:id" element={<SiteEditorPage />} />
        <Route path="*" element={<Navigate to="/sites" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
