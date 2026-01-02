import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Tokushoho from "./pages/Tokushoho";
import PoleVaultDiagnosis from "./pages/PoleVaultDiagnosis";

export default function App() {

  const path = window.location.pathname;
  if (path === "/tokushoho") return <Tokushoho />;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/polevault" element={<PoleVaultDiagnosis />} />
      </Routes>
    </BrowserRouter>
  );
}