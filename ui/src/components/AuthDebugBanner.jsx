import { useEffect, useState } from "react";
import { getCurrentUser } from "../services/authService";

export default function AuthDebugBanner() {
  const [message, setMessage] = useState("Supabase Auth 확인 중...");

  useEffect(() => {
    getCurrentUser()
      .then((user) => {
        if (user) {
          setMessage(`로그인됨: ${user.email}`);
        } else {
          setMessage("현재 유저: null");
        }
      })
      .catch((error) => {
        setMessage(`Auth 테스트 에러: ${error.message}`);
      });
  }, []);

  return (
    <div
      style={{
        padding: "10px 14px",
        background: "#111",
        color: "#fff",
        fontSize: "13px",
        borderBottom: "1px solid #333",
        zIndex: 9999,
      }}
    >
      {message}
    </div>
  );
}