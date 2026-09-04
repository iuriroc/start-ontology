import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { OntologyGraph } from "./graph/OntologyGraph";
import { BackupRestorePage } from "./pages/BackupRestorePage";
import { Dashboard } from "./pages/Dashboard";
import { HandoffsPage } from "./pages/HandoffsPage";
import { RelationshipsPage } from "./pages/RelationshipsPage";
import { ResourcePage } from "./pages/ResourcePage";
import { VersionsPage } from "./pages/VersionsPage";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="ontology/relationships" element={<RelationshipsPage />} />
        <Route path="ontology/handoffs" element={<HandoffsPage />} />
        <Route path="ontology/:resource" element={<ResourcePage />} />
        <Route path="graph" element={<OntologyGraph />} />
        <Route path="versions" element={<VersionsPage />} />
        <Route path="backup" element={<BackupRestorePage />} />
      </Route>
    </Routes>
  );
}
