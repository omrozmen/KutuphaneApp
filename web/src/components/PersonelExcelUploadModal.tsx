import { useState } from "react";
import { createPortal } from "react-dom";
import { httpClient } from "../api/client";

type UploadResult = {
  added: number;
  skipped: number;
  total: number;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (result?: UploadResult) => void;
};

const PersonelIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  </svg>
);

const UploadIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7"></path>
    <polyline points="7 12 12 17 17 12"></polyline>
    <line x1="12" y1="17" x2="12" y2="3"></line>
  </svg>
);

const VALID_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
];

const VALID_EXTENSIONS = [".xlsx", ".xls", ".csv"];

const PersonelExcelUploadModal = ({ isOpen, onClose, onSuccess }: Props) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  if (!isOpen) {
    return null;
  }

  const resetState = () => {
    setSelectedFile(null);
    setMessage(null);
    setShowDetails(false);
    setUploadResult(null);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf("."));
    if (!VALID_TYPES.includes(file.type) && !VALID_EXTENSIONS.includes(fileExtension)) {
      setMessage({ type: "error", text: "Lütfen geçerli bir Excel/CSV dosyası seçin (.xlsx, .xls, .csv)" });
      return;
    }

    setSelectedFile(file);
    setMessage(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setMessage({ type: "error", text: "Lütfen bir dosya seçin" });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("tableType", "personel");

      const response = await httpClient.post<{ added: number; skipped: number; total: number }>("/admin/upload-excel", formData);
      setMessage({
        type: "success",
        text: `Yükleme tamamlandı. ${response.added} kayıt eklendi, ${response.skipped} kayıt atlandı (Toplam: ${response.total}).`,
      });
      setUploadResult(response);
      setSelectedFile(null);
      setShowDetails(false);
      const fileInput = document.getElementById("personel-excel-input") as HTMLInputElement | null;
      if (fileInput) {
        fileInput.value = "";
      }
      onSuccess?.(response);
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Dosya yüklenemedi, lütfen tekrar deneyin.",
      });
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
        padding: "16px",
      }}
      onClick={() => {
        onClose();
        resetState();
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: "620px",
          width: "100%",
          borderRadius: "16px",
          padding: "28px",
          position: "relative",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: "10px" }}>
              <PersonelIcon />
              Excel/CSV ile Personel Ekle
            </h2>
            <p style={{ margin: "6px 0 0", color: "#475569", fontSize: "14px" }}>
              Admin panelinden ayrılmadan personel listesini toplu olarak içe aktarın.
            </p>
          </div>
          <button
            onClick={() => {
              onClose();
              resetState();
            }}
            style={{
              background: "none",
              border: "none",
              fontSize: "24px",
              cursor: "pointer",
              color: "#94a3b8",
            }}
            aria-label="Modalı kapat"
          >
            ×
          </button>
        </div>

        {message && (
          <div
            style={{
              padding: "12px",
              borderRadius: "8px",
              marginBottom: "16px",
              backgroundColor: message.type === "success" ? "#dcfce7" : "#fee2e2",
              color: message.type === "success" ? "#14532d" : "#991b1b",
              fontSize: "14px",
            }}
          >
            {message.text}
          </div>
        )}

        {uploadResult && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "12px",
              marginBottom: "16px",
            }}
          >
            {[
              { label: "Eklenen", value: uploadResult.added, color: "#10b981" },
              { label: "Atlanan", value: uploadResult.skipped, color: "#f97316" },
              { label: "Toplam", value: uploadResult.total, color: "#2563eb" },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  border: `1px solid ${stat.color}`,
                  borderRadius: "12px",
                  padding: "14px",
                  backgroundColor: "white",
                  boxShadow: "0 4px 12px rgba(15, 23, 42, 0.08)",
                }}
              >
                <div style={{ color: "#64748b", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {stat.label}
                </div>
                <div style={{ fontSize: "24px", fontWeight: 700, color: stat.color }}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <label
            htmlFor="personel-excel-input"
            style={{
              border: "2px dashed #cbd5f5",
              borderRadius: "12px",
              padding: "24px",
              textAlign: "center",
              cursor: "pointer",
              background: "#f8fafc",
              transition: "all 0.2s",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  backgroundColor: "#e0f2fe",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#0f172a",
                }}
              >
                <UploadIcon />
              </div>
              <div>
                <strong style={{ fontSize: "15px", color: "#0f172a" }}>Dosyanızı sürükleyip bırakın</strong>
                <div style={{ fontSize: "13px", color: "#64748b", marginTop: "4px" }}>
                  veya bilgisayarınızdan seçim yapın (.xlsx, .xls, .csv)
                </div>
              </div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 16px",
                  backgroundColor: "#2563eb",
                  color: "white",
                  borderRadius: "999px",
                  fontWeight: 600,
                  fontSize: "13px",
                }}
              >
                Dosya Seç
              </div>
            </div>
          </label>
          <input
            id="personel-excel-input"
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            style={{ display: "none" }}
            onChange={handleFileSelect}
          />

          {selectedFile && (
            <div
              style={{
                padding: "14px",
                borderRadius: "10px",
                border: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                backgroundColor: "#f8fafc",
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{selectedFile.name}</div>
                <div style={{ fontSize: "12px", color: "#64748b" }}>
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </div>
              </div>
              <button
                onClick={() => setSelectedFile(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#ef4444",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Kaldır
              </button>
            </div>
          )}

          <div
            style={{
              padding: "14px",
              borderRadius: "10px",
              border: "1px solid #fbbf24",
              backgroundColor: "#fef9c3",
              fontSize: "13px",
              color: "#92400e",
            }}
          >
            <div style={{ marginBottom: "8px" }}>
              <strong>Zorunlu:</strong> Kullanıcı Adı, Ad
            </div>
            <div style={{ marginBottom: "8px" }}>
              <strong>Opsiyonel:</strong> Şifre, Soyad, Pozisyon
            </div>
            <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #fbbf24" }}>
              <strong>Export başlıkları (tam desteklenir):</strong> "Kullanıcı Adı", "Ad"
            </div>
          </div>

          <button
            onClick={() => setShowDetails(!showDetails)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "#f1f5f9",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              padding: "14px 18px",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "14px",
              color: "#0f172a",
            }}
          >
            Excel yükleme rehberi
            <span style={{ fontSize: "18px" }}>{showDetails ? "−" : "+"}</span>
          </button>

          {showDetails && (
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "16px",
                backgroundColor: "#fff",
                fontSize: "13px",
                color: "#475569",
                lineHeight: 1.6,
              }}
            >
              <div style={{ marginBottom: "12px" }}>
                <strong style={{ color: "#1e293b", display: "block", marginBottom: "8px" }}>Genel Bilgiler:</strong>
                <ul style={{ margin: 0, paddingLeft: "20px" }}>
                  <li>Dosyanın ilk satırında sütun başlıklarının bulunduğundan emin olun.</li>
                  <li>Aynı kullanıcı adıyla gelen kayıtlar otomatik olarak atlanır.</li>
                  <li>Excel veya CSV formatında kaydedilen dosyaları kullanabilirsiniz.</li>
                </ul>
              </div>
              
              <div style={{ marginBottom: "12px", padding: "12px", backgroundColor: "#fee2e2", borderRadius: "6px", border: "1px solid #fca5a5" }}>
                <strong style={{ color: "#991b1b", display: "block", marginBottom: "6px" }}>Zorunlu Sütunlar:</strong>
                <div style={{ color: "#991b1b", fontSize: "12px" }}>
                  • <strong>Kullanıcı Adı</strong> (veya "username")<br/>
                  • <strong>Ad</strong> (veya "name")
                </div>
              </div>
              
              <div style={{ marginBottom: "12px", padding: "12px", backgroundColor: "#d1fae5", borderRadius: "6px", border: "1px solid #86efac" }}>
                <strong style={{ color: "#166534", display: "block", marginBottom: "6px" }}>Opsiyonel Sütunlar:</strong>
                <div style={{ color: "#166534", fontSize: "12px" }}>
                  • <strong>Şifre</strong> (veya "password", "sifre") - Belirtilmezse varsayılan şifre kullanılır<br/>
                  • <strong>Soyad</strong> (veya "surname", "soyad")<br/>
                  • <strong>Pozisyon</strong> (veya "position", "pozisyon", "görev", "gorev")
                </div>
              </div>
              
              <div style={{ padding: "12px", backgroundColor: "#eff6ff", borderRadius: "6px", border: "1px solid #93c5fd" }}>
                <strong style={{ color: "#1e40af", display: "block", marginBottom: "6px" }}>Export Başlıkları (Tam Desteklenir):</strong>
                <div style={{ color: "#1e40af", fontSize: "12px" }}>
                  Export edilen Excel dosyalarındaki başlıklar doğrudan kullanılabilir:<br/>
                  • "Kullanıcı Adı"<br/>
                  • "Ad"
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "20px" }}>
          <button
            onClick={() => {
              onClose();
              resetState();
            }}
            style={{
              padding: "10px 20px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              background: "#fff",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Vazgeç
          </button>
          <button
            onClick={handleUpload}
            disabled={loading}
            style={{
              padding: "10px 24px",
              borderRadius: "8px",
              border: "none",
              backgroundColor: loading ? "#94a3b8" : "#10b981",
              color: "white",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {loading ? "Yükleniyor..." : (
              <>
                <UploadIcon />
                Yüklemeyi Başlat
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PersonelExcelUploadModal;
