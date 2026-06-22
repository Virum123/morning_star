import { useState } from "react";
import { signIn, signUp } from "../services/authService";

export default function LoginPage({ onAuthSuccess }) {
  const [mode, setMode] = useState("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  const isSignIn = mode === "signIn";

  async function handleSubmit(event) {
    event.preventDefault();

    setIsLoading(true);
    setMessage("");

    try {
      if (isSignIn) {
        await signIn(email, password);
        setMessage("로그인 성공");
      } else {
        await signUp(email, password);
        setMessage("회원가입 성공. 이메일 확인 설정에 따라 로그인이 필요할 수 있습니다.");
      }

      onAuthSuccess?.();
    } catch (error) {
      setMessage(error.message ?? "인증 처리 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#111",
        color: "#fff",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "360px",
          padding: "24px",
          border: "1px solid #333",
          borderRadius: "12px",
          background: "#1b1b1b",
        }}
      >
        <h2 style={{ marginBottom: "16px" }}>
          {isSignIn ? "로그인" : "회원가입"}
        </h2>

        <label style={{ display: "block", marginBottom: "8px" }}>
          이메일
        </label>
        <input
          type="email"
          value={email}
          placeholder="email@example.com"
          onChange={(event) => setEmail(event.target.value)}
          required
          style={{
            width: "100%",
            padding: "10px",
            marginBottom: "12px",
            borderRadius: "8px",
            border: "1px solid #444",
            background: "#111",
            color: "#fff",
          }}
        />

        <label style={{ display: "block", marginBottom: "8px" }}>
          비밀번호
        </label>
        <input
          type="password"
          value={password}
          placeholder="비밀번호"
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={6}
          style={{
            width: "100%",
            padding: "10px",
            marginBottom: "16px",
            borderRadius: "8px",
            border: "1px solid #444",
            background: "#111",
            color: "#fff",
          }}
        />

        <button
          type="submit"
          disabled={isLoading}
          style={{
            width: "100%",
            padding: "10px",
            borderRadius: "8px",
            border: "none",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          {isLoading ? "처리 중..." : isSignIn ? "로그인" : "회원가입"}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(isSignIn ? "signUp" : "signIn");
            setMessage("");
          }}
          style={{
            width: "100%",
            padding: "10px",
            marginTop: "10px",
            borderRadius: "8px",
            border: "1px solid #444",
            background: "transparent",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          {isSignIn ? "회원가입으로 전환" : "로그인으로 전환"}
        </button>

        {message && (
          <p style={{ marginTop: "14px", fontSize: "13px", color: "#ddd" }}>
            {message}
          </p>
        )}
      </form>
    </div>
  );
}
