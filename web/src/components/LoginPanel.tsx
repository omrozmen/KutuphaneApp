import { FormEvent, useState } from "react";
import "./LoginPanel.css";

type Props = {
  onLogin: (username: string, password: string) => Promise<void>;
  busy?: boolean;
};

const LoginPanel = ({ onLogin, busy }: Props) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await onLogin(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Giriş başarısız oldu");
    }
  };

  return (
    <div className="login-panel">
      <div className="login-header">
        <div className="login-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>
        <h2>Kütüphane Yönetim Sistemi</h2>
        <p>Lütfen giriş yapın</p>
      </div>
      <form onSubmit={handleSubmit} className="login-form">
        <div className="form-group">
          <label>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            Kullanıcı Adı
          </label>
          <input 
            value={username} 
            placeholder="Kullanıcı adınızı girin" 
            onChange={(e) => setUsername(e.target.value)}
            disabled={busy}
            required
          />
        </div>
        <div className="form-group">
          <label>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            Parola
          </label>
          <input
            type="password"
            value={password}
            placeholder="Parolanızı girin"
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            required
          />
        </div>
        {error && (
          <div className="error-message">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>{error}</span>
          </div>
        )}
        <button className="login-button" type="submit" disabled={busy || !username || !password}>
          {busy ? (
            <>
              <span className="login-spinner">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10" strokeDasharray="47" strokeDashoffset="47" opacity="0.2"></circle>
                  <circle cx="12" cy="12" r="10" strokeDasharray="47" strokeDashoffset="11.75"></circle>
                </svg>
              </span>
              Giriş yapılıyor...
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                <polyline points="10 17 15 12 10 7"></polyline>
                <line x1="15" y1="12" x2="3" y2="12"></line>
              </svg>
              Giriş Yap
            </>
          )}
        </button>
      </form>
    </div>
  );
};

export default LoginPanel;
