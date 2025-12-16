import { useState } from "react";
import { UserResponse } from "../api/types";
import { httpClient } from "../api/client";
import "./ProfileModal.css";

interface ProfileModalProps {
  user: UserResponse;
  onClose: () => void;
  onLogout?: () => void;
}

const ProfileModal = ({ user, onClose, onLogout }: ProfileModalProps) => {
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const roleDisplayName = user.role === "personel" ? "Personel" : user.role === "ADMIN" ? "Yönetici" : user.role === "STUDENT" ? "Öğrenci" : user.role;

  const handlePasswordChange = async () => {
    setError("");

    if (!newPassword || !confirmPassword) {
      setError("Yeni şifre ve şifre onayı gereklidir");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Yeni şifreler eşleşmiyor");
      return;
    }

    if (newPassword.length < 4) {
      setError("Şifre en az 4 karakter olmalıdır");
      return;
    }

    setLoading(true);
    try {
      await httpClient.post(`/admin/management/users/${user.username}/password`, {
        newPassword: newPassword
      });
      alert("Şifre başarıyla değiştirildi");
      setShowPasswordChange(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setError("");
    } catch (error: any) {
      const message = error instanceof Error ? error.message : error?.response?.data?.message;
      setError(message || "Şifre değiştirilemedi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Profil Bilgileri</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div className="modal-body">
          {onLogout && (
            <button
              type="button"
              className="profile-modal-logout-top"
              onClick={(e) => {
                e.stopPropagation();
                onLogout();
              }}
            >
              Oturumu Kapat
            </button>
          )}
          <div className="profile-section">
            <div className="profile-avatar-large">
              <span>{user.username.charAt(0).toUpperCase()}</span>
            </div>
            <div className="profile-info">
              <div className="info-item">
                <label>Kullanıcı Adı</label>
                <p>{user.username}</p>
              </div>
              <div className="info-item">
                <label>Rol</label>
                <p className="role-badge">{roleDisplayName}</p>
              </div>
            </div>
          </div>

          {!showPasswordChange ? (
            <div className={`profile-actions ${onLogout ? "has-logout" : ""}`}>
              <div className="profile-action-group">
                <button
                  className="action-btn secondary"
                  onClick={() => setShowPasswordChange(true)}
                >
                  🔒 Şifre Değiştir
                </button>
                <button className="action-btn primary" onClick={onClose}>
                  Tamam
                </button>
              </div>
            </div>
          ) : (
            <div className="password-change-section">
              <h3>Şifre Değiştir</h3>
              {error && <div className="error-message">{error}</div>}
              <div className="password-form">
                <div className="form-group">
                  <label>Yeni Şifre *</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Yeni şifre"
                    disabled={loading}
                  />
                </div>
                <div className="form-group">
                  <label>Yeni Şifre (Tekrar) *</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Yeni şifreyi tekrar girin"
                    disabled={loading}
                  />
                </div>
                <div className="form-actions">
                  <button
                    className="action-btn primary"
                    onClick={handlePasswordChange}
                    disabled={loading}
                  >
                    {loading ? "Değiştiriliyor..." : "Şifreyi Değiştir"}
                  </button>
                  <button
                    className="action-btn secondary"
                    onClick={() => {
                      setShowPasswordChange(false);
                      setCurrentPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                      setError("");
                    }}
                    disabled={loading}
                  >
                    İptal
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;
