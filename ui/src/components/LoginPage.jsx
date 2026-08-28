import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  requestPasswordReset,
  signIn,
  signUp,
  updatePassword,
} from "../services/authService";
import {
  getRememberLoginPreference,
  setRememberLoginPreference,
} from "../lib/supabaseClient";
import morningStarIcon from "../assets/morning_star_app_icon.png";
import "./LoginPage.css";

export default function LoginPage({
  isPasswordRecovery = false,
  onAuthSuccess,
  onPasswordRecoveryComplete,
}) {
  const [mode, setMode] = useState(isPasswordRecovery ? "resetPassword" : "signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [rememberLogin, setRememberLogin] = useState(getRememberLoginPreference);

  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  const isSignIn = mode === "signIn";
  const isResetPassword = mode === "resetPassword";

  async function handleSubmit(event) {
    event.preventDefault();

    setIsLoading(true);
    setMessage("");

    try {
      if (isResetPassword) {
        if (password !== passwordConfirm) {
          throw new Error("비밀번호가 일치하지 않습니다.");
        }

        await updatePassword(password);
        setMessage("비밀번호가 변경되었습니다.");
        onPasswordRecoveryComplete?.();
      } else if (isSignIn) {
        setRememberLoginPreference(rememberLogin);
        await signIn(email, password);
        setMessage("로그인 성공");
      } else {
        setRememberLoginPreference(rememberLogin);
        await signUp(email, password);
        setMessage("회원가입 성공. 이메일 확인 설정에 따라 로그인이 필요할 수 있습니다.");
      }

      if (!isResetPassword) {
        onAuthSuccess?.();
      }
    } catch (error) {
      setMessage(error.message ?? "인증 처리 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePasswordResetRequest() {
    if (!email.trim()) {
      setMessage("비밀번호를 찾으려면 이메일을 먼저 입력해 주세요.");
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      await requestPasswordReset(email.trim());
      setMessage("비밀번호 재설정 메일을 보냈습니다. 받은 편지함을 확인해 주세요.");
    } catch (error) {
      setMessage(error.message ?? "재설정 메일을 보내지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  function changeMode(nextMode) {
    setMode(nextMode);
    setPassword("");
    setPasswordConfirm("");
    setMessage("");
  }

  function handleFindEmail() {
    setMessage("이메일 찾기는 본인 확인 수단을 추가한 뒤 제공할 수 있습니다.");
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <img src={morningStarIcon} alt="" />
          <div>
            <strong>Morning Star</strong>
            <span>오늘 밤, 내일을 벼리다</span>
          </div>
        </div>
        <h2 className="login-title">
          {isResetPassword ? "비밀번호 재설정" : isSignIn ? "로그인" : "회원가입"}
        </h2>

        <div className="login-fields">
          {!isResetPassword && (
            <label className="login-field">
              <span className="visually-hidden">이메일</span>
              <input
                className="login-input"
                type="email"
                value={email}
                placeholder="이메일을 입력하세요"
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
          )}

          <label className="login-field login-password-field">
            <span className="visually-hidden">
              {isResetPassword ? "새 비밀번호" : "비밀번호"}
            </span>
            <input
              className="login-input login-password-input"
              type={isPasswordVisible ? "text" : "password"}
              value={password}
              placeholder={isResetPassword ? "새 비밀번호를 입력하세요" : "비밀번호를 입력하세요"}
              autoComplete={isResetPassword ? "new-password" : "current-password"}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={isSignIn ? 6 : 8}
            />
            <button
              className="login-password-toggle"
              type="button"
              onClick={() => setIsPasswordVisible((visible) => !visible)}
              aria-label={isPasswordVisible ? "비밀번호 숨기기" : "비밀번호 보기"}
            >
              {isPasswordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </label>

          {isResetPassword && (
            <label className="login-field">
              <span className="visually-hidden">새 비밀번호 확인</span>
              <input
                className="login-input"
                type={isPasswordVisible ? "text" : "password"}
                value={passwordConfirm}
                placeholder="새 비밀번호를 다시 입력하세요"
                autoComplete="new-password"
                onChange={(event) => setPasswordConfirm(event.target.value)}
                required
                minLength={8}
              />
            </label>
          )}
        </div>

        {isSignIn && (
          <div className="login-options">
            <label className="login-remember">
              <input
                type="checkbox"
                checked={rememberLogin}
                onChange={(event) => setRememberLogin(event.target.checked)}
              />
              <span>로그인 유지</span>
            </label>
            <button
              className="login-text-button"
              type="button"
              disabled={isLoading}
              onClick={handlePasswordResetRequest}
            >
              비밀번호 찾기
            </button>
          </div>
        )}

        <button className="login-submit" type="submit" disabled={isLoading}>
          {isLoading
            ? "처리 중..."
            : isResetPassword
              ? "비밀번호 변경"
              : isSignIn
                ? "이메일로 로그인"
                : "회원가입"}
        </button>

        {!isResetPassword && (
          <div className="login-links" aria-label="계정 도움말">
            {isSignIn ? (
              <>
                <button type="button" onClick={() => changeMode("signUp")}>회원가입</button>
                <span className="login-link-divider" aria-hidden="true" />
                <button type="button" onClick={handleFindEmail}>이메일 찾기</button>
              </>
            ) : (
              <button type="button" onClick={() => changeMode("signIn")}>로그인으로 돌아가기</button>
            )}
          </div>
        )}

        {message && (
          <p className="login-message" role="status" aria-live="polite">
            {message}
          </p>
        )}
      </form>
    </div>
  );
}
