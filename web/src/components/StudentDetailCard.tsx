import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { StudentStat, LoanInfo, Book, StudentHistoryEntry, StudentHistoryResponse } from "../api/types";
import { httpClient } from "../api/client";
import BookDetailModal from "./BookDetailModal";

type Props = {
  student: StudentStat;
  loans?: LoanInfo[];
  books?: Book[];
  maxPenaltyPoints?: number;
  personelName?: string;
  onRefresh?: () => void;
  onEdit?: (student: StudentStat) => void;
  onBookClick?: (book: Book) => void;
  studentHistory?: StudentHistoryResponse | null;
  historyEntries?: StudentHistoryEntry[];
  deriveLoanCounters?: (student: StudentStat, options?: { activeOverride?: number }) => {
    totalBorrowed: number;
    totalReturned: number;
    activeLoans: number;
  };
  resolveLateCount?: (student: StudentStat) => number;
  calculateLateBooksCount?: (studentName: string, loans: LoanInfo[], books: Book[]) => number;
  loading?: boolean;
  showEditButton?: boolean;
  onReturnBook?: (bookId: string, borrower: string) => Promise<void>;
};

const StudentDetailCard = ({
  student,
  loans = [],
  books = [],
  maxPenaltyPoints = 100,
  personelName = "",
  onRefresh,
  onEdit,
  onBookClick,
  studentHistory,
  historyEntries = [],
  deriveLoanCounters,
  resolveLateCount,
  calculateLateBooksCount,
  loading = false,
  showEditButton = true,
  onReturnBook,
}: Props) => {
  const [penaltyInputId] = useState(`penalty-input-${student.name}-${student.surname}-${Date.now()}`);
  const [updatingPenalty, setUpdatingPenalty] = useState(false);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [returnConfirmModal, setReturnConfirmModal] = useState<{
    loan: LoanInfo;
    book: Book;
  } | null>(null);
  const [returningBook, setReturningBook] = useState(false);
  const [infoModal, setInfoModal] = useState<{
    title: string;
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);

  // Default functions if not provided
  const defaultDeriveLoanCounters = (student: StudentStat) => {
    const borrowed = student.borrowed || 0;
    const returned = student.returned || 0;
    const active = Math.max(borrowed - returned, 0);
    return {
      totalBorrowed: borrowed,
      totalReturned: returned,
      activeLoans: active,
    };
  };

  const defaultResolveLateCount = (student: StudentStat) => student.late || 0;

  const defaultCalculateLateBooksCount = (studentName: string, loans: LoanInfo[], books: Book[]) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return loans.filter(loan => {
      if (loan.borrower !== studentName) return false;
      const dueDate = new Date(loan.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate < today && books.some(b => b.id === loan.bookId);
    }).length;
  };

  const getDeriveLoanCounters = deriveLoanCounters || defaultDeriveLoanCounters;
  const getResolveLateCount = resolveLateCount || defaultResolveLateCount;
  const getCalculateLateBooksCount = calculateLateBooksCount || defaultCalculateLateBooksCount;

  const { totalBorrowed, totalReturned, activeLoans } = studentHistory?.activeLoans !== undefined
    ? getDeriveLoanCounters(student, { activeOverride: studentHistory.activeLoans })
    : getDeriveLoanCounters(student);

  const returnedLateCount = studentHistory?.lateReturns !== undefined
    ? studentHistory.lateReturns
    : getResolveLateCount(student);

  const calculateActiveLateLoans = () => {
    const studentFullName = `${student.name} ${student.surname}`.trim();
    return getCalculateLateBooksCount(studentFullName, loans, books);
  };
  const activeLateCount = calculateActiveLateLoans();
  const lateCount = returnedLateCount + activeLateCount;

  const penaltyPoints = student.penaltyPoints || 0;

  // DEBUG: Ceza durumu kontrol
  console.log('[StudentDetailCard] Penalty Check:', {
    studentName: `${student.name} ${student.surname}`,
    penaltyPoints,
    maxPenaltyPoints,
    isPenalized: penaltyPoints >= maxPenaltyPoints,
    shouldShowWarning: penaltyPoints >= maxPenaltyPoints
  });

  const handlePenaltyUpdate = async () => {
    const input = document.getElementById(penaltyInputId) as HTMLInputElement;
    if (!input) return;
    const newPenaltyPoints = parseInt(input.value) || 0;
    if (newPenaltyPoints < 0) {
      alert("Ceza puanı negatif olamaz.");
      return;
    }
    try {
      setUpdatingPenalty(true);
      await httpClient.put(`/admin/students/${encodeURIComponent(student.name)}/penalty`, {
        penaltyPoints: newPenaltyPoints,
        personelName: personelName || ""
      });
      if (onRefresh) {
        await onRefresh();
      }
      alert("Ceza puanı başarıyla güncellendi.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ceza puanı güncellenirken bir hata oluştu");
    } finally {
      setUpdatingPenalty(false);
    }
  };

  const calculateDurationInDays = (start?: string, end?: string) => {
    if (!start || !end) return null;
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
    const diffMs = endDate.getTime() - startDate.getTime();
    if (diffMs < 0) return 0;
    return Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
  };

  // İstatistik Hesaplamaları
  const completedHistoryEntries = useMemo(
    () =>
      historyEntries.filter((entry) => {
        const status = entry.status?.toUpperCase() ?? "";
        return (
          status === "RETURNED" &&
          (typeof entry.durationDays === "number" ||
            (entry.borrowedAt && entry.returnedAt))
        );
      }),
    [historyEntries]
  );

  const completedDurations = useMemo(
    () =>
      completedHistoryEntries
        .map(
          (entry) =>
            entry.durationDays ??
            calculateDurationInDays(entry.borrowedAt, entry.returnedAt)
        )
        .filter(
          (value): value is number =>
            typeof value === "number" && !Number.isNaN(value)
        ),
    [completedHistoryEntries]
  );

  const averageReadingDays = useMemo(() => {
    if (!completedDurations.length) {
      return null;
    }
    const total = completedDurations.reduce((sum, day) => sum + day, 0);
    return Math.round(total / completedDurations.length);
  }, [completedDurations]);

  const totalLateDays = useMemo(
    () =>
      studentHistory?.books?.reduce(
        (sum, summary) => sum + (summary.totalLateDays ?? 0),
        0
      ) ?? 0,
    [studentHistory]
  );

  const lastActivityDate = useMemo<Date | null>(() => {
    if (!historyEntries.length) {
      return null;
    }
    let latest: Date | null = null;
    historyEntries.forEach((entry) => {
      const candidate = entry.returnedAt ?? entry.borrowedAt;
      if (!candidate) {
        return;
      }
      const candidateDate = new Date(candidate);
      if (Number.isNaN(candidateDate.getTime())) {
        return;
      }
      if (!latest || candidateDate.getTime() > latest.getTime()) {
        latest = candidateDate;
      }
    });
    return latest;
  }, [historyEntries]);

  const completionRate = useMemo(() => {
    if (!studentHistory) {
      return null;
    }
    const borrowed = studentHistory.totalBorrowed ?? 0;
    if (!borrowed) {
      return null;
    }
    const returned = studentHistory.totalReturned ?? 0;
    return Math.round((returned / borrowed) * 100);
  }, [studentHistory]);

  const historySummaryCards = useMemo(() => {
    if (!studentHistory) {
      return [];
    }
    const borrowed = studentHistory.totalBorrowed ?? 0;
    const returned = studentHistory.totalReturned ?? 0;
    return [
      {
        key: "avg",
        label: "Ortalama Okuma",
        value: averageReadingDays !== null ? `${averageReadingDays} gün` : "—",
        subLabel:
          completedDurations.length > 0
            ? `${completedDurations.length} tamamlanan kitap`
            : undefined,
        accent: "#0ea5e9",
      },
      {
        key: "completion",
        label: "Tamamlama Oranı",
        value: completionRate !== null ? `%${completionRate}` : "—",
        subLabel: borrowed > 0 ? `${returned}/${borrowed} kitap` : undefined,
        accent: "#10b981",
      },
      {
        key: "late-days",
        label: "Gecikme Günleri",
        value: totalLateDays > 0 ? `${totalLateDays} gün` : "Yok",
        subLabel: `${studentHistory.lateReturns ?? 0} gecikme`,
        accent: "#ef4444",
      },
      {
        key: "last-activity",
        label: "Son Aktivite",
        value: lastActivityDate
          ? lastActivityDate.toLocaleDateString("tr-TR")
          : "—",
        subLabel: lastActivityDate
          ? lastActivityDate.toLocaleTimeString("tr-TR", {
            hour: "2-digit",
            minute: "2-digit",
          })
          : undefined,
        accent: "#475569",
      },
    ];
  }, [
    studentHistory,
    averageReadingDays,
    completionRate,
    totalLateDays,
    lastActivityDate,
    completedDurations.length,
  ]);

  const studentFullName = `${student.name} ${student.surname}`.trim();
  const validLoans = loans.filter(l =>
    l.borrower === student.name ||
    l.borrower === studentFullName
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Temel Bilgiler */}
      <div style={{ padding: "20px", backgroundColor: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)" }}>
        <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "18px", fontWeight: 600, color: "#1e293b" }}>Temel Bilgiler</h3>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 0.8fr 0.8fr", gap: "16px" }}>
          <div>
            <strong style={{ color: "#64748b", fontSize: "14px", display: "block", marginBottom: "4px" }}>Ad Soyad</strong>
            <p style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>{studentFullName}</p>
          </div>
          <div>
            <strong style={{ color: "#64748b", fontSize: "14px", display: "block", marginBottom: "4px" }}>Öğrenci Numarası</strong>
            <p style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>{student.studentNumber || "-"}</p>
          </div>
          <div>
            <strong style={{ color: "#64748b", fontSize: "14px", display: "block", marginBottom: "4px" }}>Sınıf</strong>
            <p style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>{student.class || "-"}</p>
          </div>
          <div>
            <strong style={{ color: "#64748b", fontSize: "14px", display: "block", marginBottom: "4px" }}>Şube</strong>
            <p style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>{student.branch || "-"}</p>
          </div>
        </div>
      </div>

      {/* İstatistikler */}
      <div style={{ padding: "20px", backgroundColor: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)" }}>
        <h3 style={{ marginTop: 0, marginBottom: "20px", fontSize: "18px", fontWeight: 600, color: "#1e293b", display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"></line>
            <line x1="12" y1="20" x2="12" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="14"></line>
          </svg>
          Ödünç İstatistikleri
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
                {totalBorrowed}
              </div>
              <div style={{ fontSize: "11px", fontWeight: 500, opacity: 0.95 }}>Toplam Ödünç</div>
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
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <div style={{ fontSize: "24px", fontWeight: 700, marginBottom: "4px" }}>
                {totalReturned}
              </div>
              <div style={{ fontSize: "11px", fontWeight: 500, opacity: 0.95 }}>İade</div>
            </div>
          </div>

          {activeLateCount > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
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
                  {activeLoans}
                </div>
                <div style={{ fontSize: "11px", fontWeight: 500, opacity: 0.95 }}>Aktif Ödünç</div>
              </div>

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
            </div>
          ) : (
            <div style={{
              textAlign: "center",
              padding: "12px 10px",
              background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
              borderRadius: "8px",
              boxShadow: "0 2px 4px rgba(245, 158, 11, 0.2)",
              color: "white",
              width: "100%"
            }}>
              <div style={{ marginBottom: "4px", display: "flex", justifyContent: "center" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                </svg>
              </div>
              <div style={{ fontSize: "24px", fontWeight: 700, marginBottom: "4px" }}>
                {activeLoans}
              </div>
              <div style={{ fontSize: "11px", fontWeight: 500, opacity: 0.95 }}>Aktif Ödünç</div>
            </div>
          )}
        </div>
      </div>

      {/* Ceza Puanı */}
      <div style={{ padding: "20px", backgroundColor: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)" }}>
        <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "18px", fontWeight: 600, color: "#1e293b", display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          Ceza Puanı
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ flex: 1 }}>
              <strong style={{ color: "#64748b", fontSize: "14px", display: "block", marginBottom: "4px" }}>Ceza Puanı</strong>
              <p style={{ margin: 0, fontSize: "24px", fontWeight: 700, color: penaltyPoints >= maxPenaltyPoints ? "#ef4444" : penaltyPoints > 0 ? "#f59e0b" : "#10b981" }}>
                {penaltyPoints}
              </p>
              <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#64748b" }}>
                (Ceza puanları otomatik olarak hesaplanır ve maksimum değer kaydedilir. Kitaplar teslim edilse bile maksimum değer korunur. Sadece manuel güncelleme ile değişir)
              </p>
            </div>
            {penaltyPoints >= maxPenaltyPoints && (
              <div style={{
                padding: "12px 20px",
                backgroundColor: "#fee2e2",
                borderRadius: "8px",
                border: "2px solid #ef4444",
                color: "#dc2626",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                Ceza Durumunda - Kitap Alamaz
              </div>
            )}
          </div>
          {showEditButton && (
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                type="number"
                id={penaltyInputId}
                min="0"
                defaultValue={penaltyPoints}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "6px",
                  border: "1px solid #d1d5db",
                  fontSize: "14px"
                }}
                placeholder="Ceza puanı"
              />
              <button
                onClick={handlePenaltyUpdate}
                disabled={updatingPenalty || loading}
                style={{
                  padding: "10px 20px",
                  fontSize: "14px",
                  backgroundColor: (updatingPenalty || loading) ? "#9ca3af" : "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: (updatingPenalty || loading) ? "not-allowed" : "pointer",
                  fontWeight: 600,
                }}
              >
                {updatingPenalty ? "Güncelleniyor..." : "Güncelle"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Aktif Ödünçler */}
      {validLoans.length > 0 && (
        <div>
          <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "18px", fontWeight: 600, color: "#1e293b" }}>Aktif Ödünçler</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {validLoans.map((loan, idx) => {
              const dueDate = new Date(loan.dueDate);
              dueDate.setHours(0, 0, 0, 0);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const diffTime = dueDate.getTime() - today.getTime();
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              const isLate = diffDays < 0;
              const remainingDays = diffDays;
              const isWarning = !isLate && remainingDays >= 0 && remainingDays <= 3;
              const book = books.find(b => b.id === loan.bookId);

              return (
                <div
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (book) {
                      setSelectedBook(book);
                    }
                  }}
                  style={{
                    padding: "16px",
                    backgroundColor: "#f8fafc",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    transition: "all 0.2s",
                    cursor: book && onBookClick ? "pointer" : "default",
                  }}
                  onMouseEnter={(e) => {
                    if (book && onBookClick) {
                      e.currentTarget.style.backgroundColor = "#f1f5f9";
                      e.currentTarget.style.borderColor = "#cbd5e1";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (book && onBookClick) {
                      e.currentTarget.style.backgroundColor = "#f8fafc";
                      e.currentTarget.style.borderColor = "#e2e8f0";
                    }
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, marginBottom: "8px", fontSize: "16px", color: "#1e293b" }}>
                        {loan.title}
                      </div>
                      <div style={{ fontSize: "13px", color: "#64748b", marginBottom: "4px" }}>
                        <strong>Yazar:</strong> {loan.author}
                      </div>
                      <div style={{ fontSize: "13px", color: "#64748b", marginBottom: "4px" }}>
                        <strong>Kategori:</strong> {loan.category}
                      </div>
                      <div style={{ fontSize: "13px", color: "#64748b", marginBottom: "4px" }}>
                        <strong>Teslim Tarihi:</strong> {dueDate.toLocaleDateString("tr-TR")}
                      </div>
                      {loan.personel && (
                        <div style={{ fontSize: "13px", color: "#64748b" }}>
                          <strong>Personel:</strong> {loan.personel}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                      <div style={{
                        padding: "8px 16px",
                        borderRadius: "12px",
                        fontSize: "13px",
                        fontWeight: 600,
                        backgroundColor: isLate ? "#fee2e2" : isWarning ? "#fef3c7" : "#d1fae5",
                        color: isLate ? "#dc2626" : isWarning ? "#d97706" : "#059669",
                        whiteSpace: "nowrap"
                      }}>
                        {remainingDays === 0 ? "Süresi Doldu" : `${remainingDays} gün kaldı`}
                      </div>
                      {showEditButton && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!book) {
                              alert("Kitap bilgisi bulunamadı");
                              return;
                            }
                            setReturnConfirmModal({ loan, book });
                          }}
                          style={{
                            padding: "8px 16px",
                            fontSize: "13px",
                            fontWeight: 600,
                            backgroundColor: "#10b981",
                            color: "white",
                            border: "none",
                            borderRadius: "8px",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                            transition: "all 0.2s",
                            boxShadow: "0 2px 4px rgba(16, 185, 129, 0.2)"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "#059669";
                            e.currentTarget.style.boxShadow = "0 4px 8px rgba(16, 185, 129, 0.3)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "#10b981";
                            e.currentTarget.style.boxShadow = "0 2px 4px rgba(16, 185, 129, 0.2)";
                          }}
                        >
                          Teslim Al
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* Okuma Geçmişi ve İstatistikler (Genişletilebilir Kart) */}
      {(studentHistory || (historyEntries && historyEntries.length > 0)) && (
        <div
          style={{
            border: `1px solid ${isHistoryExpanded ? "#3b82f6" : "#e2e8f0"}`,
            borderRadius: "14px",
            backgroundColor: isHistoryExpanded ? "#f0f4ff" : "#ffffff",
            boxShadow: isHistoryExpanded ? "0 12px 30px rgba(59,130,246,0.12)" : "0 1px 3px rgba(0,0,0,0.05)",
            transition: "all 0.25s ease",
            overflow: "hidden"
          }}
        >
          {/* Header - Always Visible */}
          <div
            onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
            style={{
              padding: "20px",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "16px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  backgroundColor: isHistoryExpanded ? "#dbeafe" : "#f1f5f9",
                  color: isHistoryExpanded ? "#2563eb" : "#64748b",
                  transition: "all 0.2s"
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                </svg>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: isHistoryExpanded ? "#1e293b" : "#334155" }}>
                  Okuma Geçmişi ve İstatistikler
                </h3>
                <div style={{ fontSize: "13px", color: isHistoryExpanded ? "#3b82f6" : "#64748b", marginTop: "2px" }}>
                  {historyEntries.length} kayıt bulundu
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              {!isHistoryExpanded && studentHistory && (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <div style={{ padding: "6px 14px", borderRadius: "99px", backgroundColor: "#f1f5f9", fontSize: "12px", fontWeight: 600, color: "#475569" }}>
                    Toplam: {totalBorrowed}
                  </div>
                  {activeLateCount > 0 && (
                    <div style={{ padding: "6px 14px", borderRadius: "99px", backgroundColor: "#fee2e2", fontSize: "12px", fontWeight: 600, color: "#ef4444" }}>
                      {activeLateCount} Gecikme
                    </div>
                  )}
                  {activeLoans > 0 && (
                    <div style={{ padding: "6px 14px", borderRadius: "99px", backgroundColor: "#dbeafe", fontSize: "12px", fontWeight: 600, color: "#3b82f6" }}>
                      {activeLoans} Aktif
                    </div>
                  )}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  backgroundColor: isHistoryExpanded ? "#ffffff" : "#f8fafc",
                  border: "1px solid",
                  borderColor: isHistoryExpanded ? "#bfdbfe" : "#e2e8f0",
                  color: isHistoryExpanded ? "#3b82f6" : "#94a3b8",
                  transform: isHistoryExpanded ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "all 0.3s ease"
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
            </div>
          </div>

          {/* Expanded Content */}
          {isHistoryExpanded && (
            <div style={{ borderTop: "1px solid #dbeafe", padding: "24px", animation: "slideDown 0.3s ease-out" }}>
              {/* İstatistik Kartları */}
              {historySummaryCards.length > 0 && (
                <div style={{ marginBottom: "32px" }}>
                  <h4 style={{ margin: "0 0 16px 0", fontSize: "14px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Performans Özeti
                  </h4>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                    {historySummaryCards.map((card) => (
                      <div
                        key={card.key}
                        style={{
                          padding: "16px",
                          backgroundColor: "#ffffff",
                          borderRadius: "12px",
                          border: "1px solid #e2e8f0",
                          borderLeft: `4px solid ${card.accent}`,
                          boxShadow: "0 2px 4px rgba(0,0,0,0.02)"
                        }}
                      >
                        <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, marginBottom: "6px" }}>
                          {card.label}
                        </div>
                        <div style={{ fontSize: "20px", fontWeight: 700, color: "#1e293b" }}>
                          {card.value}
                        </div>
                        {card.subLabel && (
                          <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
                            {card.subLabel}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Geçmiş Tablosu */}
              {historyEntries && historyEntries.length > 0 && (
                <div>
                  <h4 style={{ margin: "0 0 16px 0", fontSize: "14px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Ödünç Geçmişi Listesi
                  </h4>
                  <div style={{ overflowX: "auto", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                          <th style={{ padding: "14px 12px", textAlign: "left", fontSize: "12px", color: "#64748b", fontWeight: 700, whiteSpace: "nowrap" }}>KİTAP</th>
                          <th style={{ padding: "14px 12px", textAlign: "left", fontSize: "12px", color: "#64748b", fontWeight: 700, whiteSpace: "nowrap" }}>DURUM</th>
                          <th style={{ padding: "14px 12px", textAlign: "left", fontSize: "12px", color: "#64748b", fontWeight: 700, whiteSpace: "nowrap" }}>ALIŞ T.</th>
                          <th style={{ padding: "14px 12px", textAlign: "left", fontSize: "12px", color: "#64748b", fontWeight: 700, whiteSpace: "nowrap" }}>İADE T.</th>
                          <th style={{ padding: "14px 12px", textAlign: "left", fontSize: "12px", color: "#64748b", fontWeight: 700, whiteSpace: "nowrap" }}>G. PLANI</th>
                          <th style={{ padding: "14px 12px", textAlign: "left", fontSize: "12px", color: "#64748b", fontWeight: 700, whiteSpace: "nowrap" }}>SÜRE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyEntries.map((entry, idx) => {
                          const statusIsReturned = entry.status?.toUpperCase() === "RETURNED";
                          const statusLabel = statusIsReturned ? "İade Edildi" : "Aktif";
                          const statusColor = statusIsReturned ? "#10b981" : entry.wasLate ? "#ef4444" : "#3b82f6";
                          const statusBg = statusIsReturned ? "#d1fae5" : entry.wasLate ? "#fee2e2" : "#dbeafe";
                          const borrowDate = entry.borrowedAt ? new Date(entry.borrowedAt).toLocaleDateString("tr-TR") : "—";
                          const returnDate = entry.returnedAt ? new Date(entry.returnedAt).toLocaleDateString("tr-TR") : "—";

                          // G.PLANI = Kalan Gün (Due Date'e göre)
                          const calculateRemainingDays = () => {
                            if (!entry.dueDate) return "—";
                            if (statusIsReturned) return "—"; // İade edildiyse kalan gün yok

                            const dueDate = new Date(entry.dueDate);
                            const today = new Date();
                            dueDate.setHours(0, 0, 0, 0);
                            today.setHours(0, 0, 0, 0);

                            const diffMs = dueDate.getTime() - today.getTime();
                            const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

                            // Tüm değerleri göster (pozitif, 0, negatif)
                            return `${diffDays} gün`;
                          };
                          const plannedDuration = calculateRemainingDays();

                          // Calculate Duration
                          const calculateDurationHelper = (start?: string, end?: string) => {
                            if (!start || !end) return null;
                            const startDate = new Date(start);
                            const endDate = new Date(end);
                            if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
                            const diffMs = endDate.getTime() - startDate.getTime();
                            if (diffMs < 0) return 0;
                            return Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
                          };

                          const actualDurationValue =
                            statusIsReturned && typeof entry.durationDays === "number" && !Number.isNaN(entry.durationDays)
                              ? entry.durationDays
                              : statusIsReturned
                                ? calculateDurationHelper(entry.borrowedAt, entry.returnedAt)
                                : null;
                          const actualDurationLabel =
                            actualDurationValue !== null ? `${actualDurationValue} gün` : statusIsReturned ? "—" : "Devam ediyor";

                          return (
                            <tr key={`${entry.bookId}-${entry.borrowedAt}-${idx}`} style={{ borderBottom: idx === historyEntries.length - 1 ? "none" : "1px solid #f1f5f9", backgroundColor: idx % 2 === 0 ? "#ffffff" : "#fcfcfc" }}>
                              <td style={{ padding: "14px 12px" }}>
                                <div style={{ fontWeight: 600, color: "#1e293b", fontSize: "13px" }}>{entry.bookTitle}</div>
                                {entry.bookId && <div style={{ fontSize: "11px", color: "#94a3b8" }}>#{entry.bookId}</div>}
                              </td>
                              <td style={{ padding: "14px 12px" }}>
                                <span
                                  style={{
                                    display: "inline-block",
                                    padding: "4px 10px",
                                    borderRadius: "6px",
                                    fontSize: "11px",
                                    fontWeight: 700,
                                    backgroundColor: statusBg,
                                    color: statusColor,
                                  }}
                                >
                                  {statusLabel}
                                  {entry.wasLate && <span style={{ marginLeft: "4px" }}>⚠️</span>}
                                </span>
                              </td>
                              <td style={{ padding: "14px 12px", fontSize: "13px", color: "#64748b" }}>{borrowDate}</td>
                              <td style={{ padding: "14px 12px", fontSize: "13px", color: "#64748b" }}>{returnDate}</td>
                              <td style={{ padding: "14px 12px", fontSize: "13px", color: "#64748b" }}>{plannedDuration}</td>
                              <td style={{ padding: "14px 12px", fontSize: "13px", color: "#64748b", fontWeight: 500 }}>{actualDurationLabel}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {/* Return Confirmation Modal */}
      {returnConfirmModal && createPortal(
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 53000,
          }}
          onClick={() => setReturnConfirmModal(null)}
        >
          <div
            className="card"
            style={{
              maxWidth: "500px",
              width: "90%",
              padding: "24px",
              animation: "0.3s ease-out slideIn",
              backgroundColor: "white",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setReturnConfirmModal(null)}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "none",
                border: "none",
                fontSize: "24px",
                cursor: "pointer",
                color: "#9ca3af",
              }}
            >
              ×
            </button>

            <h3 style={{
              margin: "0 0 20px 0",
              fontSize: "20px",
              fontWeight: 700,
              color: "#1e293b",
              borderBottom: "1px solid #e2e8f0",
              paddingBottom: "12px",
            }}>
              Ödünç Detayı
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Book Info */}
              <div style={{ display: "flex", gap: "16px" }}>
                <div style={{
                  width: "80px",
                  height: "120px",
                  backgroundColor: "#f1f5f9",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#cbd5e1",
                  flexShrink: 0,
                }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: "13px",
                    color: "#64748b",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}>
                    KİTAP
                  </div>
                  <div style={{
                    fontSize: "16px",
                    fontWeight: 700,
                    color: "#1e293b",
                    marginBottom: "8px",
                  }}>
                    {returnConfirmModal.loan.title}
                  </div>
                  <div style={{ fontSize: "13px", color: "#64748b" }}>
                    {returnConfirmModal.loan.author}
                  </div>
                </div>
              </div>

              {/* Student & Due Date Info */}
              <div style={{
                padding: "16px",
                backgroundColor: "#f8fafc",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
              }}>
                <div style={{
                  marginBottom: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}>
                  <div style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    backgroundColor: "#e0f2fe",
                    color: "#0284c7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 600,
                  }}>
                    {student.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: "12px", color: "#64748b" }}>ÖĞRENCİ</div>
                    <div style={{ fontWeight: 600, color: "#334155" }}>
                      {`${student.name} ${student.surname}`.trim()}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: "12px", color: "#64748b" }}>TESLİM TARİHİ</div>
                    <div style={{
                      fontWeight: 600,
                      color: (() => {
                        const dueDate = new Date(returnConfirmModal.loan.dueDate);
                        dueDate.setHours(0, 0, 0, 0);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        return dueDate < today ? "#dc2626" : "#334155";
                      })(),
                    }}>
                      {new Date(returnConfirmModal.loan.dueDate).toLocaleDateString("tr-TR")}
                      {(() => {
                        const dueDate = new Date(returnConfirmModal.loan.dueDate);
                        dueDate.setHours(0, 0, 0, 0);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        if (dueDate < today) {
                          return (
                            <span style={{
                              marginLeft: "8px",
                              padding: "2px 6px",
                              backgroundColor: "#fee2e2",
                              color: "#ef4444",
                              borderRadius: "4px",
                              fontSize: "11px",
                            }}>
                              GECİKTİ
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Confirm Button */}
              <button
                onClick={async () => {
                  if (!onReturnBook) {
                    alert("Teslim alma işlevi tanımlanmamış");
                    return;
                  }

                  setReturningBook(true);
                  try {
                    const borrowerName = `${student.name} ${student.surname}`.trim();
                    await onReturnBook(returnConfirmModal.book.id, borrowerName);
                    setReturnConfirmModal(null);
                    if (onRefresh) {
                      await onRefresh();
                    }
                    setInfoModal({
                      title: "Başarılı",
                      message: `"${returnConfirmModal.loan.title}" kitabı başarıyla teslim alındı.`,
                      type: "success"
                    });
                  } catch (error) {
                    setInfoModal({
                      title: "Hata",
                      message: error instanceof Error ? error.message : "Teslim alma başarısız oldu",
                      type: "error"
                    });
                  } finally {
                    setReturningBook(false);
                  }
                }}
                disabled={returningBook}
                style={{
                  width: "100%",
                  padding: "12px",
                  backgroundColor: returningBook ? "#9ca3af" : "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: 600,
                  cursor: returningBook ? "not-allowed" : "pointer",
                  fontSize: "15px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => {
                  if (!returningBook) {
                    e.currentTarget.style.backgroundColor = "#2563eb";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!returningBook) {
                    e.currentTarget.style.backgroundColor = "#3b82f6";
                  }
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 11 12 14 22 4"></polyline>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                </svg>
                {returningBook ? "Teslim Alınıyor..." : "Teslim Al"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Info/Success/Error Modal */}
      {infoModal && createPortal(
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 54000,
          }}
          onClick={() => setInfoModal(null)}
        >
          <div
            className="card"
            style={{
              maxWidth: "400px",
              width: "90%",
              padding: "24px",
              animation: "0.3s ease-out slideIn",
              backgroundColor: "white",
              position: "relative",
              textAlign: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              backgroundColor: infoModal.type === "success" ? "#d1fae5" : infoModal.type === "error" ? "#fee2e2" : "#dbeafe",
              margin: "0 auto 20px auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              {infoModal.type === "success" && (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              )}
              {infoModal.type === "error" && (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              )}
              {infoModal.type === "info" && (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
              )}
            </div>

            <h3 style={{
              margin: "0 0 12px 0",
              fontSize: "20px",
              fontWeight: 700,
              color: "#1e293b",
            }}>
              {infoModal.title}
            </h3>

            <p style={{
              margin: "0 0 24px 0",
              fontSize: "15px",
              color: "#64748b",
              lineHeight: "1.5",
            }}>
              {infoModal.message}
            </p>

            <button
              onClick={() => setInfoModal(null)}
              style={{
                width: "100%",
                padding: "12px",
                backgroundColor: infoModal.type === "success" ? "#10b981" : infoModal.type === "error" ? "#ef4444" : "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "15px",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) => {
                if (infoModal.type === "success") {
                  e.currentTarget.style.backgroundColor = "#059669";
                } else if (infoModal.type === "error") {
                  e.currentTarget.style.backgroundColor = "#dc2626";
                } else {
                  e.currentTarget.style.backgroundColor = "#2563eb";
                }
              }}
              onMouseLeave={(e) => {
                if (infoModal.type === "success") {
                  e.currentTarget.style.backgroundColor = "#10b981";
                } else if (infoModal.type === "error") {
                  e.currentTarget.style.backgroundColor = "#ef4444";
                } else {
                  e.currentTarget.style.backgroundColor = "#3b82f6";
                }
              }}
            >
              Tamam
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Book Detail Modal - rendered with higher z-index than parent */}
      {selectedBook && (
        <BookDetailModal
          book={selectedBook}
          onClose={() => setSelectedBook(null)}
          loans={loans}
          books={books}
          onRefresh={onRefresh}
          personelName={personelName}
        />
      )}
    </div>
  );
};

export default StudentDetailCard;

