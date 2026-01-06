import { Routes, Route, Navigate } from "react-router-dom";
import Signup from "./pages/Signup";
import Confirm from "./pages/Confirm";

import Home from "./pages/Home";
import Tokushoho from "./pages/Tokushoho";
import PoleVaultDiagnosis from "./pages/PoleVaultDiagnosis";

import FormCompare from "./pages/FormCompare";
import RequireAuth from "./auth/RequireAuth";
import Login from "./pages/Login";
import Success from "./pages/Success";
import Cancel from "./pages/Cancel";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/tokushoho" element={<Tokushoho />} />

      {/* ログイン画面 */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/confirm" element={<Confirm />} />
      <Route path="/success" element={<Success />} />
      <Route path="/cancel" element={<Cancel />} />

      {/* ランニングフォーム比較：ログイン必須 */}
      <Route
        path="/form-compare"
        element={
          <RequireAuth>
            <FormCompare />
          </RequireAuth>
        }
      />

      {/* 棒高跳び診断（開発中なのでそのまま） */}
      <Route path="/polevault" element={<PoleVaultDiagnosis />} />

      {/* 存在しないURLはトップへ */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
