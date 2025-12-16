import { useRef, useMemo } from "react";
import "./NotificationPanel.css";
import { NotificationSettings } from "../types/notification";

export interface Notification {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  kind?: keyof NotificationSettings["notificationTypes"] | "misc";
}

interface NotificationPanelProps {
  notifications: Notification[];
  onClose: () => void;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  notificationSettings: NotificationSettings;
}

const NotificationPanel = ({
  notifications,
  onClose,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAll,
  notificationSettings,
}: NotificationPanelProps) => {
  const panelRef = useRef<HTMLDivElement>(null);

  const normalizeForMatch = (value: string) => {
    return (value || "")
      .toString()
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s_\-\/]+/g, " ");
  };

  const inferKind = (title: string): Notification["kind"] => {
    const t = normalizeForMatch(title);
    if (t.includes("toplu ogrenci silme") || t.includes("toplu ogrenci")) return "studentBulkDelete";
    if (t.includes("ogrenci silindi")) return "studentDelete";
    if (t.includes("ogrenci eklendi") || t.includes("toplu ogrenci ekleme")) return "studentAdd";
    if (t.includes("ogrenci guncellendi")) return "studentUpdate";
    if (t.includes("toplu kitap silme") || t.includes("toplu kitap")) return "bookBulkDelete";
    if (t.includes("kitap silindi")) return "bookDelete";
    if (t.includes("kitap eklendi") || t.includes("toplu kitap ekleme")) return "bookAdd";
    if (t.includes("kitap guncellendi")) return "bookUpdate";
    if (t.includes("kitap odunc verildi") || t.includes("toplu kitap odunc") || (t.includes("odunc") && t.includes("verildi"))) return "loanBorrow";
    if (t.includes("kitap teslim alindi") || t.includes("teslim alindi") || t.includes("odunc kaydi silindi") || t.includes("toplu odunc") || t.includes("odunc kaldirildi")) return "loanReturn";
    if (t.includes("teslim tarihi uzatildi") || t.includes("uzatildi") || t.includes("uzatma")) return "loanExtend";
    if (t.includes("teslim tarihi yaklasiyor")) return "dueSoon";
    if (t.includes("geciken odunc")) return "overdue";
    return "misc";
  };

  const filteredNotifications = useMemo(() => {
    const settings = notificationSettings;
    if (!settings.notifications) {
      return [];
    }

    return notifications.filter(notification => {
      // Kullanıcı ayarları: sadece tanımlı (misc olmayan) ve check'li türler gösterilsin
      const kind = notification.kind ?? inferKind(notification.title);
      if (!kind || kind === "misc") return false;
      if (settings.notificationTypes?.[kind] === false) return false;
      return true;
    });
  }, [notifications, notificationSettings]);

  const unreadCount = filteredNotifications.filter((n) => !n.read).length;

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return "Az önce";
    if (minutes < 60) return `${minutes} dakika önce`;
    if (hours < 24) return `${hours} saat önce`;
    if (days < 7) return `${days} gün önce`;
    return date.toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "success":
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        );
      case "warning":
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        );
      case "error":
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        );
      default:
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
        );
    }
  };

  return (
    <div className="notification-panel-overlay" onClick={onClose}>
      <div className="notification-panel" ref={panelRef} onClick={(e) => e.stopPropagation()}>
        <div className="notification-panel-header">
          <div className="notification-header-info">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>
              Bildirimler
            </h2>
            {unreadCount > 0 && (
              <span className="notification-badge">{unreadCount}</span>
            )}
          </div>
          <div className="notification-header-actions">
            {unreadCount > 0 && (
              <button
                className="notification-action-btn"
                onClick={onMarkAllAsRead}
                title="Tümünü okundu işaretle"
              >
                Tümünü Okundu İşaretle
              </button>
            )}
            {filteredNotifications.length > 0 && (
              <button
                className="notification-action-btn"
                onClick={onClearAll}
                title="Tümünü temizle"
                style={{ color: "#ef4444" }}
              >
                Tümünü Temizle
              </button>
            )}
            <button className="notification-close-btn" onClick={onClose}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        <div className="notification-panel-body">
          {filteredNotifications.length === 0 ? (
            <div className="notification-empty">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.3 }}>
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
              <p style={{ margin: "16px 0 0 0", color: "#64748b", fontSize: "14px" }}>
                {notifications.length === 0 ? "Henüz bildirim yok" : "Seçili bildirim türleri için bildirim yok"}
              </p>
            </div>
          ) : (
            <div className="notification-list">
              {filteredNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`notification-item ${notification.read ? "read" : "unread"}`}
                  onClick={() => !notification.read && onMarkAsRead(notification.id)}
                >
                  <div className={`notification-icon notification-icon-${notification.type}`}>
                    {getTypeIcon(notification.type)}
                  </div>
                  <div className="notification-content">
                    <div className="notification-title-row">
                      <h3 className="notification-title">{notification.title}</h3>
                      {!notification.read && <span className="notification-unread-dot"></span>}
                    </div>
                    <p className="notification-message">{notification.message}</p>
                    <span className="notification-time">{formatTime(notification.timestamp)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationPanel;
