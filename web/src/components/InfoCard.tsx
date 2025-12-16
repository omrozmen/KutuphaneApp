import { createPortal } from "react-dom";
import { ReactNode } from "react";

type InfoCardProps = {
  isOpen: boolean;
  title: string;
  icon?: string;
  children: ReactNode;
  onClose: () => void;
  type?: "info" | "success" | "warning" | "error";
  showCloseButton?: boolean;
  onConfirm?: () => void;
  confirmText?: string;
};

const InfoCard = ({
  isOpen,
  title,
  icon,
  children,
  onClose,
  type = "info",
  showCloseButton = true,
  onConfirm,
  confirmText = "Tamam",
}: InfoCardProps) => {
  if (!isOpen) return null;

  const typeConfig = {
    info: {
      color: "#3b82f6",
      bgColor: "#eff6ff",
      iconSvg: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
      )
    },
    success: {
      color: "#10b981",
      bgColor: "#ecfdf5",
      iconSvg: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      )
    },
    warning: {
      color: "#f59e0b",
      bgColor: "#fffbeb",
      iconSvg: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
      )
    },
    error: {
      color: "#ef4444",
      bgColor: "#fef2f2",
      iconSvg: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
      )
    },
  };

  const config = typeConfig[type];
  // Eğer dışarıdan özel icon gelirse (string emoji veya ReactNode) onu kullan, yoksa default SVG
  const displayIcon = icon ? (typeof icon === 'string' ? <span style={{ fontSize: "32px" }}>{icon}</span> : icon) : config.iconSvg;

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60000,
        backdropFilter: "blur(2px)"
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="info-card-modal"
        style={{
          backgroundColor: "white",
          borderRadius: "16px",
          padding: "32px 24px",
          maxWidth: "400px",
          width: "90%",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          textAlign: "center",
          animation: "slideIn 0.3s ease-out"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "50%",
            backgroundColor: config.bgColor,
            color: config.color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px auto",
            boxShadow: `0 4px 6px -1px ${config.bgColor}`
          }}
        >
          {displayIcon}
        </div>

        <h3 style={{ margin: "0 0 12px 0", fontSize: "20px", fontWeight: 700, color: "#1e293b" }}>
          {title}
        </h3>

        <div style={{ margin: "0 0 24px 0", color: "#64748b", fontSize: "15px", lineHeight: "1.5" }}>
          {children}
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
          {onConfirm ? (
            <>
              <button
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: "10px 20px",
                  backgroundColor: "white",
                  color: "#64748b",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: "15px"
                }}
              >
                İptal
              </button>
              <button
                onClick={() => { onConfirm(); onClose(); }}
                style={{
                  flex: 1,
                  padding: "10px 20px",
                  backgroundColor: config.color,
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                  fontSize: "15px"
                }}
              >
                {confirmText}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              style={{
                padding: "10px 32px",
                backgroundColor: config.color,
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                fontSize: "15px",
                minWidth: "120px"
              }}
            >
              {confirmText}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default InfoCard;
