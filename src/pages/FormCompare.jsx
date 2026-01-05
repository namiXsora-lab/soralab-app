import { useNavigate } from "react-router-dom";
import { mockLogout } from "../auth/mockAuth";
import MainFormApp from "./MainFormApp"; // 実際のimportに合わせて

export default function FormCompare() {
  const navigate = useNavigate();

  return (
    <div>
      <div style={{ padding: 8 }}>
        <button
          onClick={() => {
            mockLogout();
            navigate("/login", { replace: true });
          }}
        >
          仮ログアウト
        </button>
      </div>

      <MainFormApp />
    </div>
  );
}
