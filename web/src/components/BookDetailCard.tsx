import { Book, StudentStat } from "../api/types";

type Props = {
  book: Book;
  students?: StudentStat[];
  onStudentClick?: (student: StudentStat) => void;
  onEdit?: (book: Book) => void;
  showEditButton?: boolean;
};

const BookDetailCard = ({
  book,
  students = [],
  onStudentClick,
  onEdit,
  showEditButton = false,
}: Props) => {
  // Kitap durumu hesaplama
  const getConditionCounts = (book: Book) => {
    const total = book.totalQuantity ?? Math.max(book.quantity ?? 0, 0);
    return {
      healthy: book.healthyCount ?? Math.max(total - (book.damagedCount ?? 0) - (book.lostCount ?? 0), 0),
      damaged: book.damagedCount ?? 0,
      lost: book.lostCount ?? 0,
      total: total,
    };
  };

  const conditionCounts = getConditionCounts(book);
  const healthyCount = conditionCounts.healthy;
  const damagedCount = conditionCounts.damaged;
  const lostCount = conditionCounts.lost;
  const conditionTotal = healthyCount + damagedCount + lostCount;

  // İstatistikler
  const currentQuantity = book.quantity || 0;
  const activeBorrowedCount = book.loans.length || 0;
  
  // Aktif ödünçlerden geciken sayısı
  const activeLateCount = book.loans.filter(l => {
    const dueDate = new Date(l.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dueDate.getTime() < today.getTime();
  }).length;
  
  const totalQuantity = book.totalQuantity > 0 
    ? book.totalQuantity 
    : currentQuantity + activeBorrowedCount;

  // Gün farkı hesaplama
  const getDaysDiff = (dueDateStr: string | Date) => {
    const dueDate = new Date(dueDateStr);
    dueDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  // İsim normalizasyonu
  const normalizePersonName = (value: string) => {
    return (value || "")
      .toString()
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s_\-\/]+/g, " ");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Künye Bilgileri */}
      <div style={{ 
        padding: "20px", 
        backgroundColor: "#f8fafc", 
        borderRadius: "8px",
        border: "1px solid #e2e8f0"
      }}>
        <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "18px", fontWeight: 600, color: "#1e293b" }}>Künye Bilgileri</h3>
        <div style={{ display: "grid", gap: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span style={{ color: "#64748b", fontSize: "14px", fontWeight: 500 }}>Yazar:</span>
            <span style={{ fontWeight: 600, fontSize: "14px", color: book.author ? "#1e293b" : "#94a3b8", textAlign: "right" }}>
              {book.author || "-"}
            </span>
          </div>
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span style={{ color: "#0f172a", fontSize: "14px", fontWeight: 600 }}>Kategori:</span>
            <span style={{ fontWeight: 600, fontSize: "14px", color: book.category ? "#4338ca" : "#64748b", textAlign: "right" }}>
              {book.category ? (
                <span style={{
                  backgroundColor: "#e0e7ff",
                  color: "#4338ca",
                  padding: "2px 8px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: 500,
                }}>
                  {book.category}
                </span>
              ) : "-"}
            </span>
          </div>
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span style={{ color: "#0f172a", fontSize: "14px", fontWeight: 600 }}>Ödünçte:</span>
            <span style={{ fontWeight: 600, fontSize: "14px", color: book.loans.length > 0 ? "#ef4444" : "#10b981", textAlign: "right" }}>
              {book.loans.length} adet
            </span>
          </div>
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span style={{ color: "#0f172a", fontSize: "14px", fontWeight: 600 }}>Raf Numarası:</span>
            <span style={{ fontWeight: 600, fontSize: "14px", color: book.shelf ? "#3b82f6" : "#94a3b8", textAlign: "right" }}>
              {book.shelf || "-"}
            </span>
          </div>
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span style={{ color: "#0f172a", fontSize: "14px", fontWeight: 600 }}>Yayınevi:</span>
            <span style={{ fontWeight: 600, fontSize: "14px", color: book.publisher ? "#0f172a" : "#64748b", textAlign: "right" }}>
              {book.publisher || "-"}
            </span>
          </div>
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span style={{ color: "#0f172a", fontSize: "14px", fontWeight: 600 }}>Yayın Yılı:</span>
            <span style={{ fontWeight: 600, fontSize: "14px", color: book.year ? "#0f172a" : "#64748b", textAlign: "right" }}>
              {book.year || "-"}
            </span>
          </div>
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span style={{ color: "#0f172a", fontSize: "14px", fontWeight: 600 }}>Sayfa Sayısı:</span>
            <span style={{ fontWeight: 600, fontSize: "14px", color: book.pageCount ? "#0f172a" : "#64748b", textAlign: "right" }}>
              {book.pageCount ? `${book.pageCount} sayfa` : "-"}
            </span>
          </div>
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span style={{ color: "#0f172a", fontSize: "14px", fontWeight: 600 }}>Kitap Numarası:</span>
            <span style={{ fontWeight: 600, fontSize: "14px", color: book.bookNumber ? "#0f172a" : "#64748b", textAlign: "right" }}>
              {book.bookNumber ? `#${book.bookNumber}` : "-"}
            </span>
          </div>
          
          {book.summary && (
            <div style={{ marginTop: "8px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
              <strong style={{ color: "#0f172a", fontSize: "14px", fontWeight: 700, display: "block", marginBottom: "8px" }}>Özet:</strong>
              <p style={{ margin: 0, fontSize: "14px", lineHeight: "1.6", color: "#0f172a" }}>
                {book.summary}
              </p>
            </div>
          )}

          <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
            <strong style={{ color: "#0f172a", fontSize: "14px", fontWeight: 700, display: "block", marginBottom: "8px" }}>Kitap Durumu</strong>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }}>
              {[
                { label: "Sağlam", color: "#16a34a", background: "#dcfce7", value: healthyCount },
                { label: "Hasarlı", color: "#b45309", background: "#fef3c7", value: damagedCount },
                { label: "Kayıp", color: "#dc2626", background: "#fee2e2", value: lostCount },
              ].map((item) => (
                <div key={item.label} style={{ background: item.background, borderRadius: "12px", padding: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: item.color, fontWeight: 700, fontSize: "13px" }}>{item.label}</span>
                    <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "16px" }}>{item.value} adet</span>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ margin: "8px 0 0 0", fontSize: "13px", color: "#475569" }}>
              Toplam fiziksel stok: <strong>{conditionTotal}</strong> / {book.totalQuantity}
            </p>
          </div>
        </div>
      </div>
      
      {/* Kitap İstatistikleri */}
      <div style={{ padding: "16px", backgroundColor: "#ffffff", borderRadius: "8px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)" }}>
        <h3 style={{ marginTop: 0, marginBottom: "12px", fontSize: "16px", fontWeight: 600, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"></line>
            <line x1="12" y1="20" x2="12" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="14"></line>
          </svg>
          Kitap İstatistikleri
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
            <div style={{ 
              textAlign: "center", 
              padding: "12px 10px", 
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              borderRadius: "8px", 
              boxShadow: "0 2px 4px rgba(102, 126, 234, 0.2)",
              color: "white"
            }}>
              <div style={{ marginBottom: "4px", display: "flex", justifyContent: "center" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                </svg>
              </div>
              <div style={{ fontSize: "24px", fontWeight: 700, marginBottom: "4px" }}>
                {totalQuantity}
              </div>
              <div style={{ fontSize: "11px", fontWeight: 500, opacity: 0.95 }}>Toplam Adet</div>
            </div>

            <div style={{ 
              textAlign: "center", 
              padding: "12px 10px", 
              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
              borderRadius: "8px", 
              boxShadow: "0 2px 4px rgba(16, 185, 129, 0.2)",
              color: "white"
            }}>
              <div style={{ marginBottom: "4px", display: "flex", justifyContent: "center" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                  <line x1="8" y1="8" x2="16" y2="8"></line>
                  <line x1="8" y1="12" x2="16" y2="12"></line>
                  <line x1="8" y1="16" x2="16" y2="16"></line>
                </svg>
              </div>
              <div style={{ fontSize: "24px", fontWeight: 700, marginBottom: "4px" }}>
                {currentQuantity}
              </div>
              <div style={{ fontSize: "11px", fontWeight: 500, opacity: 0.95 }}>Mevcut Adet</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: activeLateCount > 0 ? "repeat(2, 1fr)" : "1fr", gap: "12px" }}>
            <div style={{ 
              textAlign: "center", 
              padding: "12px 10px", 
              background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
              borderRadius: "8px", 
              boxShadow: "0 2px 4px rgba(245, 158, 11, 0.2)",
              color: "white"
            }}>
              <div style={{ marginBottom: "4px", display: "flex", justifyContent: "center" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                  <path d="M9 9l3 3 3-3"></path>
                </svg>
              </div>
              <div style={{ fontSize: "24px", fontWeight: 700, marginBottom: "4px" }}>
                {activeBorrowedCount}
              </div>
              <div style={{ fontSize: "11px", fontWeight: 500, opacity: 0.95 }}>Aktif Ödünç</div>
            </div>

            {activeLateCount > 0 && (
              <div style={{ 
                textAlign: "center", 
                padding: "12px 10px", 
                background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                borderRadius: "8px", 
                boxShadow: "0 2px 4px rgba(239, 68, 68, 0.2)",
                color: "white"
              }}>
                <div style={{ marginBottom: "4px", display: "flex", justifyContent: "center" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>
                </div>
                <div style={{ fontSize: "24px", fontWeight: 700, marginBottom: "4px" }}>
                  {activeLateCount}
                </div>
                <div style={{ fontSize: "11px", fontWeight: 500, opacity: 0.95 }}>Geciken</div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Aktif Ödünçler */}
      {book.loans.length > 0 && (
        <div>
          <strong style={{ color: "#64748b", fontSize: "14px", display: "block", marginBottom: "8px" }}>Aktif Ödünçler</strong>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {book.loans.map((loan, index) => {
              const diff = getDaysDiff(loan.dueDate);
              const isLate = diff < 0;
              const remainingDays = diff;
              const isWarning = !isLate && remainingDays >= 0 && remainingDays <= 3;
              const borrowerNorm = normalizePersonName(loan.borrower);
              const student = students.find(s => {
                const full = `${s.name} ${s.surname || ""}`.trim();
                return (
                  normalizePersonName(s.name) === borrowerNorm ||
                  normalizePersonName(full) === borrowerNorm
                );
              });
              const isOrphanBorrower = !!borrowerNorm && !student;
              
              return (
                <div
                  key={index}
                  onClick={() => {
                    if (student && onStudentClick) {
                      onStudentClick(student);
                    }
                  }}
                  style={{
                    padding: "12px",
                    backgroundColor: "#f8fafc",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    cursor: student && onStudentClick ? "pointer" : "default",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (student && onStudentClick) {
                      e.currentTarget.style.backgroundColor = "#f0f9ff";
                      e.currentTarget.style.borderColor = "#3b82f6";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (student && onStudentClick) {
                      e.currentTarget.style.backgroundColor = "#f8fafc";
                      e.currentTarget.style.borderColor = "#e2e8f0";
                    }
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
                        <div style={{ fontWeight: 700, fontSize: "16px", color: "#1e293b" }}>
                          {loan.borrower}
                        </div>
                        {isOrphanBorrower && (
                          <span style={{
                            padding: "2px 8px",
                            borderRadius: "8px",
                            fontSize: "11px",
                            fontWeight: 600,
                            backgroundColor: "#fef3c7",
                            color: "#d97706",
                          }}>
                            Öğrenci Bulunamadı
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "13px", color: "#64748b", marginBottom: "4px" }}>
                        Teslim Tarihi: {new Date(loan.dueDate).toLocaleDateString("tr-TR")}
                      </div>
                      {loan.personel && (
                        <div style={{ fontSize: "13px", color: "#64748b" }}>
                          Personel: {loan.personel}
                        </div>
                      )}
                    </div>
                    <div style={{
                      padding: "4px 12px",
                      borderRadius: "12px",
                      fontSize: "12px",
                      fontWeight: 600,
                      backgroundColor: isLate ? "#fee2e2" : isWarning ? "#fef3c7" : "#d1fae5",
                      color: isLate ? "#dc2626" : isWarning ? "#d97706" : "#059669",
                    }}>
                      {isLate ? `Gecikmiş (${Math.abs(remainingDays)} gün)` : `${remainingDays} gün kaldı`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default BookDetailCard;

