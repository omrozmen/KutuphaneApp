import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import BookSearch from "./BookSearch";
import { addBooksToCsv } from "../api/googleBooks";

type Props = {
  onRefresh: () => void;
  personelName: string;
};

type ManualBookForm = {
  title: string;
  author: string;
  category: string;
  quantity: number;
  shelf: string;
  publisher: string;
  summary: string;
  year: string;
  pageCount: string;
  bookNumber: string;
};

const BookAddView = ({ onRefresh, personelName }: Props) => {
  const [activeCard, setActiveCard] = useState<"api" | "file" | "manual">("api");
  const [manualForm, setManualForm] = useState<ManualBookForm>({
    title: "",
    author: "",
    category: "Roman",
    quantity: 1,
    shelf: "",
    publisher: "",
    summary: "",
    year: "",
    pageCount: "",
    bookNumber: "",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showApiInfo, setShowApiInfo] = useState(false);
  const [showFileInfo, setShowFileInfo] = useState(false);
  const [showManualInfo, setShowManualInfo] = useState(false);
  const [showIntroNote, setShowIntroNote] = useState(true);

  const categories = [
    "Roman",
    "Tarih",
    "Deneme",
    "Psikoloji",
    "Fantastik",
    "Bilim Kurgu",
    "Macera",
    "Biyografi",
    "Şiir",
    "Çocuk",
    "Eğitim",
    "Sanat",
  ];

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Dosya tipi kontrolü
      const validTypes = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
      if (!validTypes.includes(file.type)) {
        setMessage({ type: "error", text: "Lütfen geçerli bir dosya seçin (JPG, PNG, PDF)" });
        return;
      }
      setSelectedFile(file);
      setMessage({ type: "success", text: `Dosya seçildi: ${file.name}` });
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile) {
      setMessage({ type: "error", text: "Lütfen bir dosya seçin" });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      // TODO: Backend'e dosya yükleme endpoint'i eklendiğinde buraya API çağrısı yapılacak
      // Şimdilik sadece bilgilendirme mesajı
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Simüle edilmiş yükleme
      setMessage({
        type: "success",
        text: "Dosya yükleme özelliği yakında eklenecek. Şimdilik manuel ekleme veya API kullanabilirsiniz.",
      });
      setSelectedFile(null);
    } catch (error) {
      setMessage({ type: "error", text: "Dosya yükleme başarısız oldu" });
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!manualForm.title.trim() || !manualForm.author.trim()) {
      setMessage({ type: "error", text: "Kitap başlığı ve yazar alanları zorunludur" });
      return;
    }

    setLoading(true);

    try {
      const bookData = {
        title: manualForm.title.trim(),
        author: manualForm.author.trim(),
        category: manualForm.category || "Roman",
        quantity: manualForm.quantity || 1,
        shelf: manualForm.shelf.trim() || "",
        publisher: manualForm.publisher.trim() || "",
        summary: manualForm.summary.trim() || "",
        year: manualForm.year ? parseInt(manualForm.year) : undefined,
        pageCount: manualForm.pageCount ? parseInt(manualForm.pageCount) : undefined,
        bookNumber: manualForm.bookNumber ? parseInt(manualForm.bookNumber) : undefined,
      };

      const result = await addBooksToCsv([bookData], personelName);
      setMessage({
        type: "success",
        text: `Kitap başarıyla eklendi! CSV'ye ${result.addedToCsv} kitap eklendi, sisteme ${result.importedToSystem} kitap aktarıldı.`,
      });

      // Formu temizle
      setManualForm({
        title: "",
        author: "",
        category: "Roman",
        quantity: 1,
        shelf: "",
        publisher: "",
        summary: "",
        year: "",
        pageCount: "",
        bookNumber: "",
      });

      onRefresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Kitap ekleme başarısız oldu" });
    } finally {
      setLoading(false);
    }
  };

  // Bilgi pencereleri dışına tıklandığında kapat
  useEffect(() => {
    if (showApiInfo) {
      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (!target.closest('[data-info-popover-api]') && !target.closest('[data-info-button-api]')) {
          setShowApiInfo(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showApiInfo]);

  useEffect(() => {
    if (showFileInfo) {
      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (!target.closest('[data-info-popover-file]') && !target.closest('[data-info-button-file]')) {
          setShowFileInfo(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showFileInfo]);

  useEffect(() => {
    if (showManualInfo) {
      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (!target.closest('[data-info-popover-manual]') && !target.closest('[data-info-button-manual]')) {
          setShowManualInfo(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showManualInfo]);

  return (
    <div>

      {/* Kart Seçimi */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px", marginBottom: "24px" }}>
        {/* Google Books API Kartı */}
        <div
          onClick={() => {
            setActiveCard("api");
            setShowIntroNote(false);
          }}
          style={{
            padding: "24px",
            borderRadius: "12px",
            border: `2px solid ${activeCard === "api" ? "rgba(255, 255, 255, 0.5)" : "rgba(255, 255, 255, 0.3)"}`,
            background: activeCard === "api"
              ? "linear-gradient(135deg, rgba(59, 130, 246, 0.25) 0%, rgba(96, 165, 250, 0.25) 50%, rgba(147, 197, 253, 0.25) 100%)"
              : "linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(96, 165, 250, 0.15) 50%, rgba(147, 197, 253, 0.15) 100%)",
            backdropFilter: "blur(10px)",
            cursor: "pointer",
            transition: "all 0.3s ease",
            textAlign: "center",
            position: "relative",
            zIndex: 1,
            boxShadow: activeCard === "api" ? "0 6px 16px rgba(30, 64, 175, 0.25)" : "0 4px 12px rgba(30, 64, 175, 0.15)",
          }}
          onMouseEnter={(e) => {
            if (activeCard !== "api") {
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.4)";
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(96, 165, 250, 0.2) 50%, rgba(147, 197, 253, 0.2) 100%)";
              e.currentTarget.style.boxShadow = "0 6px 16px rgba(30, 64, 175, 0.2)";
            }
          }}
          onMouseLeave={(e) => {
            if (activeCard !== "api") {
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(96, 165, 250, 0.15) 50%, rgba(147, 197, 253, 0.15) 100%)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(30, 64, 175, 0.15)";
            }
          }}
        >
          {/* Bilgi İkonu - Sağ Üst Köşe */}
          <div style={{ position: "absolute", top: "12px", right: "12px", zIndex: 1000 }}>
            <button
              data-info-button-api
              onClick={(e) => {
                e.stopPropagation();
                setShowApiInfo(!showApiInfo);
              }}
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                border: "2px solid",
                borderColor: showApiInfo ? "#3b82f6" : "#fbbf24",
                background: showApiInfo ? "#eff6ff" : "#fef9e7",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
                color: showApiInfo ? "#1d4ed8" : "#d97706",
                transition: "all 0.2s",
                fontWeight: 700,
                boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                position: "relative",
                padding: 0,
                zIndex: 1001,
              }}
              onMouseEnter={(e) => {
                if (!showApiInfo) {
                  e.currentTarget.style.backgroundColor = "#fef3c7";
                  e.currentTarget.style.borderColor = "#f59e0b";
                }
              }}
              onMouseLeave={(e) => {
                if (!showApiInfo) {
                  e.currentTarget.style.backgroundColor = "#fef9e7";
                  e.currentTarget.style.borderColor = "#fbbf24";
                }
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke={showApiInfo ? "#1d4ed8" : "#d97706"}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ display: "block" }}
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <line x1="9" y1="10" x2="15" y2="10" />
                <line x1="9" y1="14" x2="15" y2="14" />
              </svg>
            </button>
            {showApiInfo && (
              <div
                data-info-popover-api
                style={{
                  position: "absolute",
                  top: "40px",
                  right: "0",
                  width: "400px",
                  maxWidth: "90vw",
                  backgroundColor: "#fef9e7",
                  borderRadius: "12px",
                  border: "1px solid #fbbf24",
                  boxShadow: "0 10px 25px rgba(0, 0, 0, 0.15)",
                  padding: "20px",
                  zIndex: 1001,
                  fontSize: "14px",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    position: "absolute",
                    top: "-8px",
                    right: "20px",
                    width: "16px",
                    height: "16px",
                    backgroundColor: "#fef9e7",
                    borderLeft: "1px solid #fbbf24",
                    borderTop: "1px solid #fbbf24",
                    transform: "rotate(45deg)",
                  }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div>
                    <h3 style={{ marginTop: 0, marginBottom: "10px", fontSize: "16px", fontWeight: 600, color: "#1e293b", display: "flex", alignItems: "center", gap: "8px" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="M21 21l-4.35-4.35"></path>
                      </svg>
                      Google Books API Kullanımı
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px", color: "#475569", lineHeight: "1.5" }}>
                      <p style={{ margin: 0 }}>
                        <strong style={{ color: "#1e293b" }}>Arama:</strong> Arama kutusuna kitap adı veya yazar adı yazarak Google Books API üzerinden kitap arayabilirsiniz.
                      </p>
                      <p style={{ margin: 0 }}>
                        <strong style={{ color: "#1e293b" }}>Sonuçlar:</strong> Arama sonuçları otomatik olarak listelenir. Kitap kapak resmi, başlık, yazar ve diğer bilgiler görüntülenir.
                      </p>
                      <p style={{ margin: 0 }}>
                        <strong style={{ color: "#1e293b" }}>Çoklu Seçim:</strong> Birden fazla kitap seçebilirsiniz. Her kitabın yanındaki checkbox'ı işaretleyerek çoklu seçim yapabilirsiniz.
                      </p>
                      <p style={{ margin: 0 }}>
                        <strong style={{ color: "#1e293b" }}>Adet Belirleme:</strong> Her kitap için istediğiniz kadar adet girebilirsiniz. Adet alanından kaç kopya eklemek istediğinizi belirleyebilirsiniz.
                      </p>
                      <p style={{ margin: 0 }}>
                        <strong style={{ color: "#1e293b" }}>Ekleme:</strong> Seçtiğiniz kitapları "Ekle" butonuna tıklayarak kataloğa ekleyebilirsiniz. Seçilen tüm kitaplar belirlediğiniz adet kadar eklenir.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>🔍</div>
          <h3 style={{ margin: "0 0 8px 0", color: "#0f172a", fontWeight: 700 }}>Google Books API</h3>
          <p style={{ margin: 0, color: "#1e293b", fontSize: "14px", fontWeight: 500 }}>
            API üzerinden kitap arayıp ekleyin
          </p>
        </div>


        {/* Dosya Yükleme Kartı */}
        <div
          onClick={() => {
            setActiveCard("file");
            setShowIntroNote(false);
          }}
          style={{
            padding: "24px",
            borderRadius: "12px",
            border: `2px solid ${activeCard === "file" ? "rgba(255, 255, 255, 0.5)" : "rgba(255, 255, 255, 0.3)"}`,
            background: activeCard === "file"
              ? "linear-gradient(135deg, rgba(59, 130, 246, 0.25) 0%, rgba(96, 165, 250, 0.25) 50%, rgba(147, 197, 253, 0.25) 100%)"
              : "linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(96, 165, 250, 0.15) 50%, rgba(147, 197, 253, 0.15) 100%)",
            backdropFilter: "blur(10px)",
            cursor: "pointer",
            transition: "all 0.3s ease",
            textAlign: "center",
            position: "relative",
            zIndex: 1,
            boxShadow: activeCard === "file" ? "0 6px 16px rgba(30, 64, 175, 0.25)" : "0 4px 12px rgba(30, 64, 175, 0.15)",
          }}
          onMouseEnter={(e) => {
            if (activeCard !== "file") {
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.4)";
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(96, 165, 250, 0.2) 50%, rgba(147, 197, 253, 0.2) 100%)";
              e.currentTarget.style.boxShadow = "0 6px 16px rgba(30, 64, 175, 0.2)";
            }
          }}
          onMouseLeave={(e) => {
            if (activeCard !== "file") {
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(96, 165, 250, 0.15) 50%, rgba(147, 197, 253, 0.15) 100%)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(30, 64, 175, 0.15)";
            }
          }}
        >
          {/* Bilgi İkonu - Sağ Üst Köşe */}
          <div style={{ position: "absolute", top: "12px", right: "12px", zIndex: 1000 }}>
            <button
              data-info-button-file
              onClick={(e) => {
                e.stopPropagation();
                setShowFileInfo(!showFileInfo);
              }}
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                border: "2px solid",
                borderColor: showFileInfo ? "#3b82f6" : "#fbbf24",
                background: showFileInfo ? "#eff6ff" : "#fef9e7",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
                color: showFileInfo ? "#1d4ed8" : "#d97706",
                transition: "all 0.2s",
                fontWeight: 700,
                boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                position: "relative",
                padding: 0,
                zIndex: 1001,
              }}
              onMouseEnter={(e) => {
                if (!showFileInfo) {
                  e.currentTarget.style.backgroundColor = "#fef3c7";
                  e.currentTarget.style.borderColor = "#f59e0b";
                }
              }}
              onMouseLeave={(e) => {
                if (!showFileInfo) {
                  e.currentTarget.style.backgroundColor = "#fef9e7";
                  e.currentTarget.style.borderColor = "#fbbf24";
                }
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke={showFileInfo ? "#1d4ed8" : "#d97706"}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ display: "block" }}
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <line x1="9" y1="10" x2="15" y2="10" />
                <line x1="9" y1="14" x2="15" y2="14" />
              </svg>
            </button>
            {showFileInfo && (
              <div
                data-info-popover-file
                style={{
                  position: "absolute",
                  top: "40px",
                  right: "0",
                  width: "400px",
                  maxWidth: "90vw",
                  backgroundColor: "#fef9e7",
                  borderRadius: "12px",
                  border: "1px solid #fbbf24",
                  boxShadow: "0 10px 25px rgba(0, 0, 0, 0.15)",
                  padding: "20px",
                  zIndex: 1001,
                  fontSize: "14px",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    position: "absolute",
                    top: "-8px",
                    right: "20px",
                    width: "16px",
                    height: "16px",
                    backgroundColor: "#fef9e7",
                    borderLeft: "1px solid #fbbf24",
                    borderTop: "1px solid #fbbf24",
                    transform: "rotate(45deg)",
                  }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div>
                    <h3 style={{ marginTop: 0, marginBottom: "10px", fontSize: "16px", fontWeight: 600, color: "#1e293b", display: "flex", alignItems: "center", gap: "8px" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                      </svg>
                      Dosya Yükleme Kullanımı
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px", color: "#475569", lineHeight: "1.5" }}>
                      <p style={{ margin: 0 }}>
                        <strong style={{ color: "#1e293b" }}>Dosya Seçimi:</strong> "Dosya Seç" butonuna tıklayarak kitap kapağı görseli (JPG, PNG) veya PDF dosyası seçebilirsiniz.
                      </p>
                      <p style={{ margin: 0 }}>
                        <strong style={{ color: "#1e293b" }}>Desteklenen Formatlar:</strong> JPG, PNG (görsel) veya PDF dosyaları yüklenebilir.
                      </p>
                      <p style={{ margin: 0 }}>
                        <strong style={{ color: "#1e293b" }}>Yükleme:</strong> Dosyayı seçtikten sonra "Dosyayı Yükle" butonuna tıklayın. Sistem dosyayı işleyecektir.
                      </p>
                      <p style={{ margin: 0, padding: "8px", backgroundColor: "#fef3c7", borderRadius: "6px", border: "1px solid #fcd34d" }}>
                        <strong style={{ color: "#92400e" }}>Not:</strong> Bu özellik yakında eklenecektir. Şimdilik manuel ekleme veya Google Books API kullanabilirsiniz.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>📄</div>
          <h3 style={{ margin: "0 0 8px 0", color: "#0f172a", fontWeight: 700 }}>Dosya Yükle</h3>
          <p style={{ margin: 0, color: "#1e293b", fontSize: "14px", fontWeight: 500 }}>
            Görsel veya PDF dosyası yükleyin
          </p>
        </div>

        {/* Manuel Ekleme Kartı */}
        <div
          onClick={() => {
            setActiveCard("manual");
            setShowIntroNote(false);
          }}
          style={{
            padding: "24px",
            borderRadius: "12px",
            border: `2px solid ${activeCard === "manual" ? "rgba(255, 255, 255, 0.5)" : "rgba(255, 255, 255, 0.3)"}`,
            background: activeCard === "manual"
              ? "linear-gradient(135deg, rgba(59, 130, 246, 0.25) 0%, rgba(96, 165, 250, 0.25) 50%, rgba(147, 197, 253, 0.25) 100%)"
              : "linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(96, 165, 250, 0.15) 50%, rgba(147, 197, 253, 0.15) 100%)",
            backdropFilter: "blur(10px)",
            cursor: "pointer",
            transition: "all 0.3s ease",
            textAlign: "center",
            position: "relative",
            zIndex: 1,
            boxShadow: activeCard === "manual" ? "0 6px 16px rgba(30, 64, 175, 0.25)" : "0 4px 12px rgba(30, 64, 175, 0.15)",
          }}
          onMouseEnter={(e) => {
            if (activeCard !== "manual") {
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.4)";
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(96, 165, 250, 0.2) 50%, rgba(147, 197, 253, 0.2) 100%)";
              e.currentTarget.style.boxShadow = "0 6px 16px rgba(30, 64, 175, 0.2)";
            }
          }}
          onMouseLeave={(e) => {
            if (activeCard !== "manual") {
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(96, 165, 250, 0.15) 50%, rgba(147, 197, 253, 0.15) 100%)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(30, 64, 175, 0.15)";
            }
          }}
        >
          {/* Bilgi İkonu - Sağ Üst Köşe */}
          <div style={{ position: "absolute", top: "12px", right: "12px", zIndex: 1000 }}>
            <button
              data-info-button-manual
              onClick={(e) => {
                e.stopPropagation();
                setShowManualInfo(!showManualInfo);
              }}
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                border: "2px solid",
                borderColor: showManualInfo ? "#3b82f6" : "#fbbf24",
                background: showManualInfo ? "#eff6ff" : "#fef9e7",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
                color: showManualInfo ? "#1d4ed8" : "#d97706",
                transition: "all 0.2s",
                fontWeight: 700,
                boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                position: "relative",
                padding: 0,
                zIndex: 1001,
              }}
              onMouseEnter={(e) => {
                if (!showManualInfo) {
                  e.currentTarget.style.backgroundColor = "#fef3c7";
                  e.currentTarget.style.borderColor = "#f59e0b";
                }
              }}
              onMouseLeave={(e) => {
                if (!showManualInfo) {
                  e.currentTarget.style.backgroundColor = "#fef9e7";
                  e.currentTarget.style.borderColor = "#fbbf24";
                }
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke={showManualInfo ? "#1d4ed8" : "#d97706"}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ display: "block" }}
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <line x1="9" y1="10" x2="15" y2="10" />
                <line x1="9" y1="14" x2="15" y2="14" />
              </svg>
            </button>
            {showManualInfo && (
              <div
                data-info-popover-manual
                style={{
                  position: "absolute",
                  top: "40px",
                  right: "0",
                  width: "400px",
                  maxWidth: "90vw",
                  backgroundColor: "#fef9e7",
                  borderRadius: "12px",
                  border: "1px solid #fbbf24",
                  boxShadow: "0 10px 25px rgba(0, 0, 0, 0.15)",
                  padding: "20px",
                  zIndex: 1001,
                  fontSize: "14px",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    position: "absolute",
                    top: "-8px",
                    right: "20px",
                    width: "16px",
                    height: "16px",
                    backgroundColor: "#fef9e7",
                    borderLeft: "1px solid #fbbf24",
                    borderTop: "1px solid #fbbf24",
                    transform: "rotate(45deg)",
                  }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div>
                    <h3 style={{ marginTop: 0, marginBottom: "10px", fontSize: "16px", fontWeight: 600, color: "#1e293b", display: "flex", alignItems: "center", gap: "8px" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                      </svg>
                      Manuel Kitap Ekleme Kullanımı
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px", color: "#0f172a", lineHeight: "1.5" }}>
                      <p style={{ margin: 0 }}>
                        <strong style={{ color: "#0f172a" }}>Zorunlu Alanlar:</strong> Kitap başlığı ve yazar adı mutlaka doldurulmalıdır (kırmızı yıldız ile işaretli).
                      </p>
                      <p style={{ margin: 0 }}>
                        <strong style={{ color: "#0f172a" }}>Opsiyonel Alanlar:</strong> Kategori, adet, raf numarası, yayınevi, yayın yılı, sayfa sayısı, kitap numarası ve özet alanları isteğe bağlıdır.
                      </p>
                      <p style={{ margin: 0 }}>
                        <strong style={{ color: "#0f172a" }}>Form Doldurma:</strong> Tüm bilgileri doldurduktan sonra "Kitap Ekle" butonuna tıklayın. Kitap otomatik olarak kataloğa eklenir.
                      </p>
                      <p style={{ margin: 0 }}>
                        <strong style={{ color: "#0f172a" }}>Temizleme:</strong> Formu sıfırlamak için "Temizle" butonunu kullanabilirsiniz.
                      </p>
                      <p style={{ margin: 0 }}>
                        <strong style={{ color: "#0f172a" }}>Avantajlar:</strong> Tam kontrol sağlar. Tüm künye bilgilerini detaylı şekilde girebilirsiniz.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>✍️</div>
          <h3 style={{ margin: "0 0 8px 0", color: "#0f172a", fontWeight: 700 }}>Manuel Ekle</h3>
          <p style={{ margin: 0, color: "#1e293b", fontSize: "14px", fontWeight: 500 }}>
            Künye bilgilerini manuel olarak girin
          </p>
        </div>
      </div>

      {/* Kartların Altında Not Penceresi - Excel/CSV ile Toplu Kayıt */}
      {showIntroNote && (
        <div style={{
          marginTop: "20px",
          marginBottom: "20px",
          padding: "16px",
          background: "rgba(254, 243, 199, 0.7)",
          backdropFilter: "blur(10px)",
          borderRadius: "8px",
          border: "1px solid rgba(252, 211, 77, 0.5)",
        }}>
          <strong style={{ color: "#92400e" }}>Not:</strong> Excel ve CSV formatlarında kitap listesi kayıtları için <strong style={{ color: "#92400e" }}>"Veri Yükle"</strong> sekmesinden toplu halde kitap ekleme, güncelleme ve yönetim işlemlerini yapabilirsiniz.
        </div>
      )}



      {/* Mesaj */}
      {message && (
        <div
          style={{
            padding: "16px",
            borderRadius: "12px",
            marginBottom: "16px",
            background: message.type === "success"
              ? "linear-gradient(135deg, rgba(16, 185, 129, 0.9) 0%, rgba(5, 150, 105, 0.9) 100%)"
              : "linear-gradient(135deg, rgba(239, 68, 68, 0.9) 0%, rgba(220, 38, 38, 0.9) 100%)",
            backdropFilter: "blur(10px)",
            border: `2px solid ${message.type === "success" ? "rgba(16, 185, 129, 0.5)" : "rgba(239, 68, 68, 0.5)"}`,
            color: "#ffffff",
            fontWeight: 600,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.2)",
          }}
        >
          {message.text}
        </div>
      )}

      {/* İçerik Alanları */}
      {activeCard === "api" && <BookSearch onRefresh={onRefresh} personelName={personelName} />}

      {activeCard === "file" && (
        <div className="card">
          <h2 style={{ marginBottom: "24px", color: "#0f172a", fontWeight: 700 }}>📄 Dosya Yükleme</h2>
          <div style={{ padding: "24px", background: "rgba(255, 255, 255, 0.5)", backdropFilter: "blur(10px)", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.3)" }}>
            <div style={{ marginBottom: "20px" }}>
              <label
                htmlFor="file-upload"
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
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#1d4ed8";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#2563eb";
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "8px", verticalAlign: "middle", display: "inline-block" }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Dosya Seç
              </label>
              <input
                id="file-upload"
                type="file"
                accept="image/jpeg,image/png,image/jpg,application/pdf"
                onChange={handleFileSelect}
                style={{ display: "none" }}
              />
              {selectedFile && (
                <div style={{ marginTop: "16px", padding: "12px", background: "rgba(255, 255, 255, 0.7)", backdropFilter: "blur(10px)", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.3)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: "4px" }}>{selectedFile.name}</div>
                      <div style={{ fontSize: "14px", color: "#6b7280" }}>
                        {(selectedFile.size / 1024).toFixed(2)} KB
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedFile(null)}
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

            <div style={{ marginTop: "20px", padding: "16px", background: "rgba(254, 243, 199, 0.7)", backdropFilter: "blur(10px)", borderRadius: "8px", border: "1px solid rgba(252, 211, 77, 0.5)" }}>
              <strong>Not:</strong> Dosya yükleme özelliği yakında eklenecektir. Şimdilik manuel ekleme veya Google Books API kullanabilirsiniz.
            </div>

            <button
              onClick={handleFileUpload}
              disabled={loading || !selectedFile}
              style={{
                marginTop: "20px",
                padding: "12px 24px",
                backgroundColor: loading || !selectedFile ? "#9ca3af" : "#10b981",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: loading || !selectedFile ? "not-allowed" : "pointer",
                fontWeight: 600,
                width: "100%",
              }}
            >
              {loading ? "Yükleniyor..." : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "6px", verticalAlign: "middle", display: "inline-block" }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                  Dosyayı Yükle
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {activeCard === "manual" && (
        <div className="card">
          <h2 style={{ marginBottom: "24px", color: "#0f172a", fontWeight: 700 }}>✍️ Manuel Kitap Ekleme</h2>
          <form onSubmit={handleManualSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px" }}>
              {/* Zorunlu Alanlar */}
              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: 600, fontSize: "14px", color: "#1e293b" }}>
                  Kitap Başlığı <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  value={manualForm.title}
                  onChange={(e) => setManualForm({ ...manualForm, title: e.target.value })}
                  required
                  placeholder="Kitap başlığını girin"
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: 600, fontSize: "14px", color: "#1e293b" }}>
                  Yazar <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  value={manualForm.author}
                  onChange={(e) => setManualForm({ ...manualForm, author: e.target.value })}
                  required
                  placeholder="Yazar adını girin"
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
                />
              </div>

              {/* Opsiyonel Alanlar */}
              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: 600, fontSize: "14px", color: "#1e293b" }}>
                  Kategori
                </label>
                <select
                  value={manualForm.category}
                  onChange={(e) => setManualForm({ ...manualForm, category: e.target.value })}
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: 600, fontSize: "14px", color: "#1e293b" }}>
                  Adet
                </label>
                <input
                  type="number"
                  value={manualForm.quantity}
                  onChange={(e) => setManualForm({ ...manualForm, quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                  min="1"
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: 600, fontSize: "14px", color: "#1e293b" }}>
                  Raf Numarası
                </label>
                <input
                  type="text"
                  value={manualForm.shelf}
                  onChange={(e) => setManualForm({ ...manualForm, shelf: e.target.value })}
                  placeholder="Örn: Raf-ROM-A01-01"
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: 600, fontSize: "14px", color: "#1e293b" }}>
                  Yayınevi
                </label>
                <input
                  type="text"
                  value={manualForm.publisher}
                  onChange={(e) => setManualForm({ ...manualForm, publisher: e.target.value })}
                  placeholder="Yayınevi adını girin"
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: 600, fontSize: "14px", color: "#1e293b" }}>
                  Yayın Yılı
                </label>
                <input
                  type="number"
                  value={manualForm.year}
                  onChange={(e) => setManualForm({ ...manualForm, year: e.target.value })}
                  placeholder="Örn: 2020"
                  min="1800"
                  max="2024"
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: 600, fontSize: "14px", color: "#1e293b" }}>
                  Sayfa Sayısı
                </label>
                <input
                  type="number"
                  value={manualForm.pageCount}
                  onChange={(e) => setManualForm({ ...manualForm, pageCount: e.target.value })}
                  placeholder="Örn: 350"
                  min="1"
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: 600, fontSize: "14px", color: "#1e293b" }}>
                  Kitap Numarası
                </label>
                <input
                  type="number"
                  value={manualForm.bookNumber}
                  onChange={(e) => setManualForm({ ...manualForm, bookNumber: e.target.value })}
                  placeholder="Örn: 1234"
                  min="1"
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: 600, fontSize: "14px", color: "#1e293b" }}>
                Özet
              </label>
              <textarea
                value={manualForm.summary}
                onChange={(e) => setManualForm({ ...manualForm, summary: e.target.value })}
                placeholder="Kitap özetini girin (opsiyonel)"
                rows={4}
                style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db", resize: "vertical" }}
              />
            </div>

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "12px" }}>
              <button
                type="button"
                onClick={() => {
                  setManualForm({
                    title: "",
                    author: "",
                    category: "Roman",
                    quantity: 1,
                    shelf: "",
                    publisher: "",
                    summary: "",
                    year: "",
                    pageCount: "",
                    bookNumber: "",
                  });
                  setMessage(null);
                }}
                style={{
                  padding: "12px 24px",
                  backgroundColor: "#f3f4f6",
                  color: "#374151",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Temizle
              </button>
              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: "12px 24px",
                  backgroundColor: loading ? "#9ca3af" : "#2563eb",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontWeight: 600,
                }}
              >
                {loading ? "Ekleniyor..." : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "6px", verticalAlign: "middle" }}>
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                    </svg>
                    Kitap Ekle
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default BookAddView;

