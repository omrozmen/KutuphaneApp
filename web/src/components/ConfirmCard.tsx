import { createPortal } from "react-dom";
import { ReactNode } from "react";

type ConfirmCardProps = {
  isOpen: boolean;
  title: string;
  icon?: string;
  children: ReactNode;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  confirmButtonColor?: string;
  loading?: boolean;
  disabled?: boolean;
};

const ConfirmCard = ({
  isOpen,
  title,
  icon = "⚠️",
  children,
  onConfirm,
  onCancel,
  confirmText = "Onayla",
  cancelText = "İptal",
  confirmButtonColor = "#ef4444",
  loading = false,
  disabled = false,
}: ConfirmCardProps) => {
  if (!isOpen) return null;

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
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "12px",
          padding: "24px",
          maxWidth: "500px",
          width: "90%",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 style={{ margin: 0, color: "#1e293b", fontSize: "20px", fontWeight: 600 }}>
            {icon} {title}
          </h2>
          <button
            onClick={onCancel}
            style={{
              background: "none",
              border: "none",
              fontSize: "24px",
              cursor: "pointer",
              color: "#64748b",
              padding: 0,
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ marginBottom: "20px" }}>
          {children}
        </div>

        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              padding: "10px 20px",
              fontSize: "14px",
              backgroundColor: "#f3f4f6",
              color: "#374151",
              border: "none",
              borderRadius: "6px",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading || disabled}
            style={{
              padding: "10px 20px",
              fontSize: "14px",
              backgroundColor: loading || disabled ? "#94a3b8" : confirmButtonColor,
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: loading || disabled ? "not-allowed" : "pointer",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
            }}
          >
            {loading ? "İşleniyor..." : confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmCard;
