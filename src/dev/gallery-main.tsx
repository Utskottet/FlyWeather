import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RoseGallery } from "./RoseGallery.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RoseGallery />
  </StrictMode>,
);
