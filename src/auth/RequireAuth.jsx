import { Navigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { getCurrentUser } from "aws-amplify/auth";

export default function RequireAuth({ children }) {
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await getCurrentUser();
        if (alive) setOk(true);
      } catch {
        if (alive) setOk(false);
      } finally {
        if (alive) setChecking(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (checking) return null; // ちらつき防止（必要ならローディング表示にしてOK）

  if (!ok) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
