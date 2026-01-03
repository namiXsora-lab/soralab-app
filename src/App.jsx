import { Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home";
import Tokushoho from "./pages/Tokushoho";
import PoleVaultDiagnosis from "./pages/PoleVaultDiagnosis";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/tokushoho" element={<Tokushoho />} />
      <Route path="/polevault" element={<PoleVaultDiagnosis />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
