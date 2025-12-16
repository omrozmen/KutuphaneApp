import { useState } from "react";
import { httpClient } from "../api/client";

type Props = {
  onRefresh: () => void;
  bookCount?: number;
  studentCount?: number;
  onNotify?: (type: "info" | "success" | "warning" | "error", title: string, message: string) => void;
};

type TableType = "books" | "students" | "loans" | "";

// İkonlar
const BookIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
  </svg>
);

const StudentIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
    <circle cx="9" cy="7" r="4"></circle>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
  </svg>
);

const LoanIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path><path d="M9 9l3 3 3-3"></path></svg>
);

const ExcelUpload = ({ onRefresh, bookCount, studentCount, onNotify }: Props) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [tableType, setTableType] = useState<TableType>("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showExcelNote, setShowExcelNote] = useState(true);
  const [showExcelDetails, setShowExcelDetails] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Excel formatı kontrolü
    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-excel", // .xls
      "text/csv", // .csv
    ];

    const validExtensions = [".xlsx", ".xls", ".csv"];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf("."));

    if (!validTypes.includes(file.type) && !validExtensions.includes(fileExtension)) {
      setMessage({ type: "error", text: "Lütfen geçerli bir Excel dosyası seçin (.xlsx, .xls, .csv)" });
      return;
    }

    setSelectedFile(file);
    setMessage(null);
    setTableType("");
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setMessage({ type: "error", text: "Lütfen bir dosya seçin" });
      onNotify?.("error", "Hata", "Lütfen bir dosya seçin");
      return;
    }

    if (!tableType) {
      setMessage({ type: "error", text: "Lütfen tablo tipini seçin" });
      onNotify?.("error", "Hata", "Lütfen tablo tipini seçin");
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("tableType", tableType);

      const response = await httpClient.post<{
        added: number;
        skipped: number;
        total: number;
      }>("/admin/upload-excel", formData);

      setMessage({
        type: "success",
        text: `${response.added} kayıt eklendi, ${response.skipped} kayıt atlandı (duplicate). Toplam: ${response.total} kayıt işlendi.`,
      });
      onNotify?.(
        "success",
        "Başarılı",
        `${response.added} kayıt eklendi, ${response.skipped} kayıt atlandı (duplicate). Toplam: ${response.total} kayıt işlendi.`
      );

      setSelectedFile(null);
      setTableType("");

      // Input'u temizle
      const fileInput = document.getElementById("excel-file-input") as HTMLInputElement;
      if (fileInput) {
        fileInput.value = "";
      }

      await onRefresh();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Dosya yükleme başarısız oldu",
      });
      onNotify?.(
        "error",
        "Hata",
        error instanceof Error ? error.message : "Dosya yükleme başarısız oldu"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* İlk Kart - Veri Yükleme */}
      <div className="card" style={{ position: "relative" }}>
        <h2 style={{ marginBottom: "24px", display: "flex", alignItems: "center", gap: "10px", paddingRight: "50px" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          Veri Yükle
        </h2>

        {message && (
          <div
            style={{
              padding: "12px",
              borderRadius: "6px",
              marginBottom: "16px",
              backgroundColor: message.type === "success" ? "#d1fae5" : "#fee2e2",
              color: message.type === "success" ? "#065f46" : "#991b1b",
            }}
          >
            {message.text}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Dosya Seçimi */}
          <div>
            <label
              htmlFor="excel-file-input"
              style={{
                display: "inline-block",
                padding: "12px 24px",
                backgroundColor: "#2563eb",
                color: "white",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: 600,
                textAlign: "center",
                transition: "background-color 0.2s",
                marginBottom: "12px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#1d4ed8";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#2563eb";
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "8px" }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Excel Dosyası Seç (.xlsx, .xls, .csv)
            </label>
            <input
              id="excel-file-input"
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />
            {selectedFile && (
              <div style={{ marginTop: "12px", padding: "12px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: "4px" }}>{selectedFile.name}</div>
                    <div style={{ fontSize: "14px", color: "#6b7280" }}>
                      {(selectedFile.size / 1024).toFixed(2)} KB
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedFile(null);
                      setTableType("");
                      setMessage(null);
                      const fileInput = document.getElementById("excel-file-input") as HTMLInputElement;
                      if (fileInput) {
                        fileInput.value = "";
                      }
                    }}
                    style={{
                      padding: "6px 12px",
                      backgroundColor: "#ef4444",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                  >
                    Kaldır
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Tablo Tipi Seçimi */}
          {selectedFile && (
            <div>
              <label style={{ display: "block", marginBottom: "8px", fontWeight: 600, fontSize: "14px" }}>
                Hangi tabloya veri eklenecek?
                <span style={{ color: "#ef4444" }}> *</span>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
                <div
                  onClick={() => setTableType("books")}
                  style={{
                    padding: "16px",
                    borderRadius: "8px",
                    border: `2px solid ${tableType === "books" ? "#2563eb" : "#e5e7eb"}`,
                    backgroundColor: tableType === "books" ? "#eff6ff" : "white",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (tableType !== "books") {
                      e.currentTarget.style.borderColor = "#93c5fd";
                      e.currentTarget.style.backgroundColor = "#f8fafc";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (tableType !== "books") {
                      e.currentTarget.style.borderColor = "#e5e7eb";
                      e.currentTarget.style.backgroundColor = "white";
                    }
                  }}
                >
                  <div style={{ marginBottom: "8px", color: tableType === "books" ? "#2563eb" : "#64748b" }}>
                    <BookIcon />
                  </div>
                  <div style={{ fontWeight: 600, marginBottom: "4px" }}>Kitaplar</div>
                  {tableType === "books" ? (
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "8px" }}>
                      <div style={{ marginBottom: "4px" }}>
                        <strong style={{ color: "#dc2626" }}>Zorunlu:</strong> Başlık, Yazar
                      </div>
                      <div>
                        <strong style={{ color: "#059669" }}>Opsiyonel:</strong> Kategori, Adet, Miktar, Raf, Yayınevi, Özet, Numara, Yıl, Sayfa Sayısı
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: "12px", color: "#64748b" }}>
                      Başlık, Yazar, Kategori, Adet, Miktar, Raf, Yayınevi, Özet, Numara, Yıl, Sayfa Sayısı
                    </div>
                  )}
                </div>

                <div
                  onClick={() => setTableType("students")}
                  style={{
                    padding: "16px",
                    borderRadius: "8px",
                    border: `2px solid ${tableType === "students" ? "#2563eb" : "#e5e7eb"}`,
                    backgroundColor: tableType === "students" ? "#eff6ff" : "white",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (tableType !== "students") {
                      e.currentTarget.style.borderColor = "#93c5fd";
                      e.currentTarget.style.backgroundColor = "#f8fafc";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (tableType !== "students") {
                      e.currentTarget.style.borderColor = "#e5e7eb";
                      e.currentTarget.style.backgroundColor = "white";
                    }
                  }}
                >
                  <div style={{ marginBottom: "8px", color: tableType === "students" ? "#2563eb" : "#64748b" }}>
                    <StudentIcon />
                  </div>
                  <div style={{ fontWeight: 600, marginBottom: "4px" }}>Öğrenciler</div>
                  {tableType === "students" ? (
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "8px" }}>
                      <div style={{ marginBottom: "4px" }}>
                        <strong style={{ color: "#dc2626" }}>Zorunlu:</strong> Ad, Soyad, Numara
                      </div>
                      <div>
                        <strong style={{ color: "#059669" }}>Opsiyonel:</strong> Kullanıcı Adı, Şifre, Sınıf, Şube, Ceza Puanı
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: "12px", color: "#64748b" }}>

                      Kullanıcı Adı, Şifre, Ad, Soyad, Sınıf, Şube, Numara
                    </div>
                  )}
                </div>

                <div
                  onClick={() => setTableType("loans")}
                  style={{
                    padding: "16px",
                    borderRadius: "8px",
                    border: `2px solid ${tableType === "loans" ? "#2563eb" : "#e5e7eb"}`,
                    backgroundColor: tableType === "loans" ? "#eff6ff" : "white",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (tableType !== "loans") {
                      e.currentTarget.style.borderColor = "#93c5fd";
                      e.currentTarget.style.backgroundColor = "#f8fafc";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (tableType !== "loans") {
                      e.currentTarget.style.borderColor = "#e5e7eb";
                      e.currentTarget.style.backgroundColor = "white";
                    }
                  }}
                >
                  <div style={{ marginBottom: "8px", color: tableType === "loans" ? "#2563eb" : "#64748b" }}>
                    <LoanIcon />
                  </div>
                  <div style={{ fontWeight: 600, marginBottom: "4px" }}>Ödünç Listesi</div>
                  {tableType === "loans" ? (
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "8px" }}>
                      <div style={{ marginBottom: "4px" }}>
                        <strong style={{ color: "#dc2626" }}>Zorunlu:</strong> Kitap Başlık, Yazar, Ad, Soyad, Teslim Tarihi
                      </div>
                      <div>
                        <strong style={{ color: "#059669" }}>Opsiyonel:</strong> Personel
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: "12px", color: "#64748b" }}>
                      Kitap Başlık, Yazar, Ad, Soyad, Teslim Tarihi (Opsiyonel: Personel)
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}


          {/* Bilgilendirme */}
          {selectedFile && tableType && (
            <div style={{ padding: "16px", backgroundColor: "#fef3c7", borderRadius: "8px", border: "1px solid #fcd34d" }}>
              <div style={{ fontWeight: 600, marginBottom: "8px", color: "#92400e", display: "flex", alignItems: "center", gap: "8px" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
                Bilgi
              </div>
              <ul style={{ margin: 0, paddingLeft: "20px", color: "#78350f", fontSize: "14px" }}>
                <li>Yeni veriler mevcut verilerin altına eklenecektir</li>
                <li>Aynı veriler (tüm sütunlar eşleşiyorsa) otomatik olarak atlanacaktır</li>
                <li>Excel dosyasında header satırı olmalıdır</li>
                <li>Zorunlu sütunlar doldurulmalıdır</li>
              </ul>
            </div>
          )}

          {/* Yükle Butonu */}
          {selectedFile && tableType && (
            <button
              onClick={handleUpload}
              disabled={loading}
              style={{
                padding: "12px 24px",
                backgroundColor: loading ? "#9ca3af" : "#10b981",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: loading ? "not-allowed" : "pointer",
                fontWeight: 600,
                fontSize: "16px",
              }}
            >
              {loading ? (
                "Yükleniyor..."
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "8px" }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                  Dosyayı Yükle ve Ekle
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* İkinci Kart - Not Penceresi */}
      <div className="card" style={{ marginTop: "20px", backgroundColor: "#ffffff", padding: "16px", transition: "all 0.3s ease" }}>
        <div
          style={{
            background: "rgba(254, 243, 199, 0.7)",
            backdropFilter: "blur(10px)",
            borderRadius: "8px",
            border: "1px solid rgba(252, 211, 77, 0.5)",
            overflow: "hidden",
            transition: "all 0.3s ease",
          }}
        >
          <div
            onClick={() => setShowExcelNote(!showExcelNote)}
            style={{
              padding: "16px",
              cursor: "pointer",
              transition: "all 0.3s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(254, 243, 199, 0.9)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ flex: 1, display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: "2px", flexShrink: 0, color: "#92400e" }}>
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
                <div style={{ flex: 1 }}>
                  <strong style={{ color: "#92400e" }}>Nasıl Çalışır?</strong> Excel veya CSV dosyanızı seçtikten sonra verilerin ekleneceği tabloyu belirleyin. Sistem dosyanızdaki verileri otomatik olarak okuyup, mevcut verilerle karşılaştırarak yeni kayıtları ekler. Aynı veriler otomatik olarak atlanır ve zorunlu alanlar kontrol edilir.
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowExcelDetails(!showExcelDetails);
                  if (!showExcelNote) {
                    setShowExcelNote(true);
                  }
                }}
                style={{
                  padding: "6px 12px",
                  backgroundColor: "#f59e0b",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  transition: "background-color 0.2s",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#d97706";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#f59e0b";
                }}
              >
                Detaylı Bilgi
              </button>
            </div>
          </div>

          {/* Excel Detayları - Butona tıklandığında açılır */}
          {showExcelNote && showExcelDetails && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                padding: "16px",
                backgroundColor: "#ffffff",
                borderTop: "2px solid #f59e0b",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: "12px", fontSize: "16px", fontWeight: 600, color: "#92400e", display: "flex", alignItems: "center", gap: "8px" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                </svg>
                Excel/CSV Veri Yükleme Rehberi
              </h3>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "14px" }}>
                <div>
                  <h4 style={{ margin: "0 0 8px 0", color: "#1e293b", fontWeight: 600, fontSize: "15px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="16" y1="13" x2="8" y2="13"></line>
                      <line x1="16" y1="17" x2="8" y2="17"></line>
                    </svg>
                    Veri Seçimi Nasıl Yapılır?
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: "20px", color: "#475569", lineHeight: "1.8" }}>
                    <li><strong style={{ color: "#1e293b" }}>Dosya Formatı:</strong> Excel (.xlsx, .xls) veya CSV dosyası seçebilirsiniz.</li>
                    <li><strong style={{ color: "#1e293b" }}>Başlık Satırı:</strong> Dosyanızın ilk satırında mutlaka kolon başlıkları (header) olmalıdır.</li>
                    <li><strong style={{ color: "#1e293b" }}>Tablo Seçimi:</strong> Verilerin ekleneceği tabloyu seçin (Kitaplar, Öğrenciler veya Personeller).</li>
                  </ul>
                </div>

                <div>
                  <h4 style={{ margin: "0 0 8px 0", color: "#1e293b", fontWeight: 600, fontSize: "15px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 11 12 14 22 4"></polyline>
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                    </svg>
                    Veri Uyumu ve Başlık Eşleştirme
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: "20px", color: "#475569", lineHeight: "1.8" }}>
                    <li><strong style={{ color: "#1e293b" }}>Türkçe/İngilizce:</strong> Kolon başlıkları Türkçe veya İngilizce olabilir. Sistem otomatik olarak eşleştirir.</li>
                    <li><strong style={{ color: "#1e293b" }}>Büyük/Küçük Harf:</strong> Başlıklar büyük-küçük harf duyarlı değildir.</li>
                    <li><strong style={{ color: "#1e293b" }}>Boşluklar:</strong> Başlıklardaki boşluklar otomatik olarak temizlenir.</li>
                  </ul>
                </div>

                <div>
                  <h4 style={{ margin: "0 0 8px 0", color: "#1e293b", fontWeight: 600, fontSize: "15px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                      <line x1="4" y1="10" x2="20" y2="10"></line>
                    </svg>
                    Hangi Veriler Yüklenebilir?
                  </h4>

                  <div style={{ marginBottom: "12px", padding: "12px", backgroundColor: "#eff6ff", borderRadius: "6px", border: "1px solid #93c5fd", display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <div style={{ flexShrink: 0, marginTop: "2px" }}>
                      <BookIcon />
                    </div>
                    <div style={{ flex: 1 }}>
                      <strong style={{ color: "#1e40af", display: "block", marginBottom: "6px" }}>Kitaplar İçin:</strong>
                      <div style={{ fontSize: "13px", color: "#1e40af", lineHeight: "1.6" }}>
                        <strong>Zorunlu:</strong> Başlık, Yazar<br />
                        <strong>Alternatif başlıklar:</strong> "Başlık" / "Baslik" / "Title" / "Kitap Başlık" / "Kitap Başlığı" / "Yazar" / "Author" / "Yazar Adı"<br />
                        <strong>Opsiyonel:</strong> Kategori, Adet, Miktar, Raf, Yayınevi, Özet, Numara, Yıl, Sayfa Sayısı<br />

                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: "12px", padding: "12px", backgroundColor: "#f0fdf4", borderRadius: "6px", border: "1px solid #86efac", display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <div style={{ flexShrink: 0, marginTop: "2px" }}>
                      <StudentIcon />
                    </div>
                    <div style={{ flex: 1 }}>
                      <strong style={{ color: "#166534", display: "block", marginBottom: "6px" }}>Öğrenciler İçin:</strong>
                      <div style={{ fontSize: "13px", color: "#166534", lineHeight: "1.6" }}>
                        <strong>Zorunlu:</strong> Ad, Soyad, Numara<br />
                        <strong>Alternatif başlıklar:</strong> "Ad" / "Name", "Soyad" / "Surname", "Numara" / "No" / "StudentNumber"<br />
                        <strong>Opsiyonel:</strong> Kullanıcı Adı, Şifre, Sınıf, Şube, Ceza Puanı<br />

                      </div>
                    </div>
                  </div>

                  <div style={{ padding: "12px", backgroundColor: "#fef3c7", borderRadius: "6px", border: "1px solid #fcd34d", display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <div style={{ flexShrink: 0, marginTop: "2px" }}>
                      <LoanIcon />
                    </div>
                    <div style={{ flex: 1 }}>
                      <strong style={{ color: "#92400e", display: "block", marginBottom: "6px" }}>Ödünç Listesi İçin:</strong>
                      <div style={{ fontSize: "13px", color: "#92400e", lineHeight: "1.6" }}>
                        <strong>Zorunlu:</strong> Kitap Başlık, Yazar, Ad, Soyad, Teslim Tarihi<br />
                        <strong>Alternatif başlıklar:</strong> "Kitap Başlık" / "Kitap Başlığı" / "Başlık" / "Title", "Ad" / "Name", "Soyad" / "Surname", "Teslim Tarihi" / "Teslim_Tarihi" / "DueDate" / "Teslim Tarihi"<br />
                        <strong>Opsiyonel:</strong> Personel<br />


                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 style={{ margin: "0 0 8px 0", color: "#1e293b", fontWeight: 600, fontSize: "15px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
                    </svg>
                    Veri Başlıkları Nasıl Olmalı?
                  </h4>
                  <div style={{ padding: "12px", backgroundColor: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "13px", color: "#475569", lineHeight: "1.8" }}>
                      <strong style={{ color: "#1e293b" }}>Örnek Başlık Formatları:</strong><br />
                      • Türkçe (kayıt dosyası ile uyumlu): "Başlık", "Yazar", "Kategori", "Miktar", "Ad", "Numara", "Teslim Tarihi"<br />
                      • İngilizce: "Title", "Author", "Category", "Quantity"<br />
                      • Karışık: "Kitap Başlığı", "Book Title", "Yazar Adı", "Author Name"<br />
                      <br />
                      <strong style={{ color: "#1e293b" }}>Not:</strong> Sistem esnek eşleştirme yapar (boşluk/altçizgi/tire ve Türkçe karakterler sorun olmaz), ancak zorunlu alanlar mutlaka doldurulmalıdır.
                    </div>
                  </div>
                </div>

                <div style={{ padding: "12px", backgroundColor: "#fee2e2", borderRadius: "6px", border: "1px solid #fca5a5" }}>
                  <strong style={{ color: "#991b1b", display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                      <line x1="12" y1="9" x2="12" y2="13"></line>
                      <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                    Önemli Uyarılar
                  </strong>
                  <ul style={{ margin: "6px 0 0 0", paddingLeft: "20px", fontSize: "13px", color: "#991b1b", lineHeight: "1.6" }}>
                    <li>Zorunlu alanlar boş bırakılamaz, aksi halde o satır atlanır.</li>
                    <li>Alternatif başlıklar, zorunlu alanların alternatifidir. Tablonuzda zorunlu alanlar başlıkları mevcut değilse, alternatif başlıkları kullanabilirsiniz.</li>
                    <li>Aynı veriler (tüm kolonlar eşleşiyorsa) otomatik olarak atlanır.</li>
                    <li>Yeni veriler mevcut verilerin altına eklenir, mevcut veriler silinmez.</li>
                    <li>Dosya yükleme işlemi tamamlandıktan sonra sonuç raporu gösterilir.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ExcelUpload;
