import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { Book, LoanInfo, StudentStat } from "../api/types";
import { httpClient } from "../api/client";
import ConfirmCard from "./ConfirmCard";
import InfoCard from "./InfoCard";
import { searchIncludes } from "../utils/searchUtils";
import { formatStudentFullName } from "../utils/studentName";
import { normalizeStudentCounters } from "../utils/studentStats";

type Props = {
  books: Book[];
  loans: LoanInfo[];
  students: StudentStat[];
  onRefresh: () => void;
  personelName: string;
  onAddNotification?: (type: "info" | "success" | "warning" | "error", title: string, message: string) => void;
};

const LoanManagement = ({ books, loans, students, onRefresh, personelName, onAddNotification }: Props) => {
  const [selectedBooks, setSelectedBooks] = useState<Book[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string>("");
  const [bookSearchTerm, setBookSearchTerm] = useState("");
  const [studentSearchTerm, setStudentSearchTerm] = useState("");
  const [returnSearchTerm, setReturnSearchTerm] = useState("");
  const [returnCategoryFilter, setReturnCategoryFilter] = useState<string>("");
  const [returnStatusFilter, setReturnStatusFilter] = useState<string>("");
  const [returnSortBy, setReturnSortBy] = useState<"borrower" | "default">("default");
  const [returnSortOrder, setReturnSortOrder] = useState<"asc" | "desc">("asc");
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"borrow" | "return">("borrow");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingBorrow, setPendingBorrow] = useState<{ books: Book[]; student: string } | null>(null);
  const [showPenaltyModal, setShowPenaltyModal] = useState(false);
  const [penaltyStudent, setPenaltyStudent] = useState<StudentStat | null>(null);
  const [showBorrowInfo, setShowBorrowInfo] = useState(false);
  const [showReturnInfo, setShowReturnInfo] = useState(false);
  const [maxBorrowLimit, setMaxBorrowLimit] = useState(5);
  const [maxPenaltyPoints, setMaxPenaltyPoints] = useState(100);

  // Return Confirmation State
  const [selectedReturnLoan, setSelectedReturnLoan] = useState<{ bookId: string; borrowerName: string; bookTitle?: string } | null>(null);
  const [showReturnConfirmModal, setShowReturnConfirmModal] = useState(false);

  const availableBooks = books.filter((b) => b.quantity > 0 && (b.healthyCount ?? 0) > 0);
  const borrowedBooks = books.filter((b) => b.loans.length > 0);
  const hasUnavailableSelection = selectedBooks.some(
    (book) => book.quantity <= 0 || (book.healthyCount ?? 0) <= 0
  );
  const isBorrowButtonDisabled =
    loading || selectedBooks.length === 0 || !selectedStudent || hasUnavailableSelection;

  // Sekme değiştiğinde filtrelemeleri temizle
  const handleTabChange = (tab: "borrow" | "return") => {
    setActiveTab(tab);
    setShowBorrowInfo(false);
    setShowReturnInfo(false);
    if (tab === "borrow") {
      setReturnSearchTerm("");
      setReturnCategoryFilter("");
      setReturnStatusFilter("");
      setReturnSortBy("default");
      setReturnSortOrder("asc");
    } else {
      setBookSearchTerm("");
      setStudentSearchTerm("");
      setSelectedBooks([]);
      setSelectedStudent("");
    }
  };

  // Sistem ayarlarını yükle
  useEffect(() => {
    const loadSystemSettings = async () => {
      try {
        const response = await httpClient.get<{ maxBorrowLimit: number; maxPenaltyPoints: number }>("/system-settings");
        setMaxBorrowLimit(response.maxBorrowLimit);
        setMaxPenaltyPoints(response.maxPenaltyPoints);
      } catch (error) {
        console.error("Sistem ayarları yüklenemedi:", error);
        // Default değerler zaten set edilmiş
      }
    };
    loadSystemSettings();
  }, []);

  // Bilgi penceresi dışına tıklandığında kapat
  useEffect(() => {
    if (showBorrowInfo || showReturnInfo) {
      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (!target.closest('[data-info-popover-borrow]') && !target.closest('[data-info-button-borrow]') &&
          !target.closest('[data-info-popover-return]') && !target.closest('[data-info-button-return]')) {
          setShowBorrowInfo(false);
          setShowReturnInfo(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showBorrowInfo, showReturnInfo]);

  // Teslim alma için kategoriler
  const returnCategories = useMemo(() => {
    const cats = new Set(borrowedBooks.flatMap(book => book.loans.map(() => book.category)).filter(Boolean));
    return Array.from(cats).sort();
  }, [borrowedBooks]);

  // Filtrelenmiş kitaplar (tüm künye bilgileri dahil - VEYA bağlacı ile)
  const filteredBooks = useMemo(() => {
    if (!bookSearchTerm || !bookSearchTerm.trim()) return availableBooks;
    return availableBooks.filter(
      (book) =>
        searchIncludes(book.title, bookSearchTerm) ||
        searchIncludes(book.author, bookSearchTerm) ||
        searchIncludes(book.category, bookSearchTerm) ||
        searchIncludes(book.shelf, bookSearchTerm) ||
        searchIncludes(book.publisher, bookSearchTerm) ||
        searchIncludes(book.summary, bookSearchTerm) ||
        searchIncludes(book.bookNumber, bookSearchTerm) ||
        searchIncludes(book.year, bookSearchTerm) ||
        searchIncludes(book.pageCount, bookSearchTerm)
    );
  }, [availableBooks, bookSearchTerm]);

  // Filtrelenmiş öğrenciler (tüm künye bilgileri dahil - VEYA bağlacı ile)
  const filteredStudents = useMemo(() => {
    if (!studentSearchTerm || !studentSearchTerm.trim()) return students;
    return students.filter((student) =>
      searchIncludes(student.name, studentSearchTerm) ||
      searchIncludes(student.surname, studentSearchTerm) ||
      searchIncludes(`${student.name} ${student.surname}`.trim(), studentSearchTerm) ||
      searchIncludes(student.studentNumber, studentSearchTerm) ||
      searchIncludes(student.class, studentSearchTerm) ||
      searchIncludes(student.branch, studentSearchTerm) ||
      (student.class && student.branch && searchIncludes(`${student.class}-${student.branch}`, studentSearchTerm)) ||
      (student.class && student.branch && searchIncludes(`${student.class}${student.branch}`, studentSearchTerm))
    );
  }, [students, studentSearchTerm]);

  // Teslim alma için filtreleme - geliştirilmiş
  const filteredBorrowedBooks = useMemo(() => {
    // Her zaman borrowedBooks'tan başla - state güncellemelerini garantile
    let result = borrowedBooks.flatMap(book =>
      book.loans.map(loan => {
        const dueDate = new Date(loan.dueDate);
        const remainingDays = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        // Öğrenci bilgisini bul ve tam ad-soyadı al
        const student = students.find(s =>
          s.name === loan.borrower ||
          `${s.name} ${s.surname}`.trim() === loan.borrower ||
          s.surname === loan.borrower
        );
        const borrowerFullName = student ? `${student.name} ${student.surname}`.trim() : loan.borrower;
        return { book, loan, remainingDays, borrowerFullName };
      })
    );

    // Metin araması - boş string kontrolü (tüm künye bilgileri dahil - VEYA bağlacı ile)
    if (returnSearchTerm && returnSearchTerm.trim()) {
      result = result.filter(({ book, loan }) =>
        searchIncludes(book.title, returnSearchTerm) ||
        searchIncludes(book.author, returnSearchTerm) ||
        searchIncludes(book.category, returnSearchTerm) ||
        searchIncludes(book.shelf, returnSearchTerm) ||
        searchIncludes(book.publisher, returnSearchTerm) ||
        searchIncludes(book.summary, returnSearchTerm) ||
        searchIncludes(book.bookNumber, returnSearchTerm) ||
        searchIncludes(book.year, returnSearchTerm) ||
        searchIncludes(book.pageCount, returnSearchTerm) ||
        searchIncludes(loan.borrower, returnSearchTerm) ||
        searchIncludes(loan.personel, returnSearchTerm)
      );
    }

    // Kategori filtresi
    if (returnCategoryFilter) {
      result = result.filter(({ book }) => book.category === returnCategoryFilter);
    }

    // Durum filtresi - yeni butonlara göre
    if (returnStatusFilter) {
      result = result.filter(({ remainingDays }) => {
        if (returnStatusFilter === "gecikmis") {
          return remainingDays < 0;
        } else if (returnStatusFilter === "0-3") {
          return remainingDays >= 0 && remainingDays <= 3;
        } else if (returnStatusFilter === "4-7") {
          return remainingDays >= 4 && remainingDays <= 7;
        } else if (returnStatusFilter === "8-14") {
          return remainingDays >= 8 && remainingDays <= 14;
        } else if (returnStatusFilter === "15+") {
          return remainingDays >= 15;
        }
        return true;
      });
    }

    // Sıralama
    if (returnSortBy === "borrower") {
      result.sort((a, b) => {
        const nameA = a.borrowerFullName.toLowerCase();
        const nameB = b.borrowerFullName.toLowerCase();
        if (returnSortOrder === "asc") {
          return nameA.localeCompare(nameB, "tr");
        } else {
          return nameB.localeCompare(nameA, "tr");
        }
      });
    } else {
      // Varsayılan sıralama: En geç kalanlar en başta (negatif değerler en büyükten küçüğe, sonra pozitifler artan sırada)
      result.sort((a, b) => {
        // Negatif değerler (geçenler) önce, en büyük negatif en başta
        if (a.remainingDays < 0 && b.remainingDays < 0) {
          return a.remainingDays - b.remainingDays; // -10, -5, -1 gibi (en geç olan en başta)
        }
        if (a.remainingDays < 0) return -1; // Negatifler her zaman önce
        if (b.remainingDays < 0) return 1;
        // Pozitif değerler artan sırada (yaklaşanlar önce)
        return a.remainingDays - b.remainingDays;
      });
    }

    return result;
  }, [borrowedBooks, returnSearchTerm, returnCategoryFilter, returnStatusFilter, returnSortBy, returnSortOrder, students]);

  const handleBorrow = async () => {
    if (selectedBooks.length === 0 || !selectedStudent) {
      setError("En az bir kitap ve öğrenci seçimi zorunludur");
      return;
    }

    const selectedStudentData = students.find((s) =>
      `${s.name} ${s.surname}`.trim() === selectedStudent ||
      s.name === selectedStudent ||
      s.surname === selectedStudent ||
      (s.studentNumber && `${s.studentNumber}` === selectedStudent)
    );
    if (!selectedStudentData) {
      setError("Geçerli bir öğrenci seçin");
      return;
    }

    if (hasUnavailableSelection) {
      setError("Mevcut adedi 0 olan veya sağlam kopyası bulunmayan kitapları ödünç veremezsiniz.");
      return;
    }

    const studentFullName = formatStudentFullName(selectedStudentData);
    if (!studentFullName) {
      setError("Geçerli bir öğrenci seçin");
      return;
    }

    // Öğrencinin zaten aldığı kitapları filtrele
    const availableBooks = getAvailableBooks(selectedBooks, selectedStudent);

    if (availableBooks.length === 0) {
      setError("Seçilen kitapların hepsi öğrenci tarafından zaten ödünç alınmış!");
      return;
    }

    // Öğrencinin aktif ödünç sayısını loans array'inden hesapla ve silinmiş kitapları filtrele
    const studentValidLoans = loans.filter(l => {
      const borrower = l.borrower?.trim();
      return (
        (borrower === studentFullName || borrower === selectedStudentData.name) &&
        books.some(b => b.id === l.bookId)
      );
    });
    const activeLoans = studentValidLoans.length;
    const totalAfterBorrow = activeLoans + availableBooks.length;

    // Sistem ayarlarından kitap alma sınırını kontrol et
    if (totalAfterBorrow > maxBorrowLimit) {
      setPendingBorrow({ books: availableBooks, student: studentFullName });
      setShowConfirmModal(true);
      return;
    }

    // Sınır içindeyse direkt ödünç ver
    await executeBorrow(availableBooks, selectedStudentData);
  };

  // Öğrencinin zaten aldığı kitapları filtrele ve sadece sağlam kitapları döndür
  const getAvailableBooks = (booksToCheck: Book[], studentName: string): Book[] => {
    const isBorrowable = (book: Book) => book.quantity > 0 && (book.healthyCount ?? 0) > 0;
    if (!studentName) return booksToCheck.filter(isBorrowable);
    return booksToCheck.filter(book => {
      const alreadyBorrowed = loans.some(loan => loan.bookId === book.id && loan.borrower === studentName);
      return !alreadyBorrowed && isBorrowable(book);
    });
  };

  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const executeBorrow = async (booksToBorrow: Book[], studentData: StudentStat) => {
    setLoading(true);
    setFeedback(null); // Clear previous feedback
    try {
      // Öğrencinin zaten aldığı kitapları filtrele, sadece verilebilecek kitapları ödünç ver
      const studentFullName = formatStudentFullName(studentData);
      if (!studentFullName) {
        setFeedback({ type: "error", message: "Geçerli bir öğrenci seçin" });
        return;
      }
      const availableBooks = getAvailableBooks(booksToBorrow, studentFullName);

      if (availableBooks.length === 0) {
        setFeedback({ type: "error", message: "Seçilen kitapların hepsi öğrenci tarafından zaten ödünç alınmış!" });
        setLoading(false);
        return;
      }

      // Sadece verilebilecek kitapları ödünç ver
      // Bildirimler App.tsx'te veri değişikliklerinden otomatik olarak gönderilecek
      for (const book of availableBooks) {
        await httpClient.post(`/books/${book.id}/borrow`, {
          borrower: studentFullName,
          days,
          personelName,
        });
      }

      // Başarılı olduğunda seçimleri temizle (search terimlerini koru)
      setSelectedBooks([]);
      setSelectedStudent("");
      setDays(14);
      setShowConfirmModal(false);
      setPendingBorrow(null);
      await onRefresh();

      setFeedback({
        type: "success",
        message: `${availableBooks.length} kitap başarıyla ödünç verildi.`
      });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Ödünç verme başarısız oldu";
      setFeedback({ type: "error", message: errorMessage });

      // Eğer cezalı öğrenci hatası ise, öğrenci bilgisini al ve modal için hazırla
      if (errorMessage.includes("cezalı") || errorMessage.includes("Ceza Puanı") || errorMessage.includes("cezalı durumda")) {
        const student = students.find(s =>
          s.name === studentData.name && s.surname === studentData.surname
        );
        if (student) {
          setPenaltyStudent(student);
        } else {
          // Hata mesajından ceza puanını parse et
          const penaltyMatch = errorMessage.match(/Ceza Puanı:\s*(\d+)/);
          const penaltyPoints = penaltyMatch ? parseInt(penaltyMatch[1]) : 0;

          // Eğer students listesinde bulunamazsa, temel bilgilerle oluştur
          setPenaltyStudent({
            name: studentData.name,
            surname: studentData.surname,
            borrowed: studentData.borrowed || 0,
            returned: studentData.returned || 0,
            late: studentData.late || 0,
            class: studentData.class,
            branch: studentData.branch,
            studentNumber: studentData.studentNumber,
            penaltyPoints: penaltyPoints,
            isBanned: penaltyPoints >= maxPenaltyPoints
          });
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReturn = (bookId: string, borrowerName: string, bookTitle: string = "Kitap") => {
    setSelectedReturnLoan({ bookId, borrowerName, bookTitle });
    setShowReturnConfirmModal(true);
  };

  const processReturn = async () => {
    if (!selectedReturnLoan) return;

    // personelName kontrolü
    if (!personelName || personelName.trim() === "") {
      setFeedback({ type: "error", message: "Personel adı gereklidir. Lütfen giriş yapın veya Personel adınızı girin." });
      setShowReturnConfirmModal(false);
      return;
    }

    setLoading(true);
    setFeedback(null);
    try {
      // Bildirimler App.tsx'te veri değişikliklerinden otomatik olarak gönderilecek
      await httpClient.post(`/books/${selectedReturnLoan.bookId}/return`, {
        borrower: selectedReturnLoan.borrowerName,
        personelName: personelName.trim(),
      });

      await onRefresh();
      setFeedback({ type: "success", message: "Kitap başarıyla teslim alındı." });
      setShowReturnConfirmModal(false);
      setSelectedReturnLoan(null);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Teslim alma başarısız oldu";
      setFeedback({ type: "error", message: errorMessage });
      console.error("Teslim alma hatası:", err);
      // Hata olsa da modalı kapatalım mı? Kullanıcı tekrar denesin.
      setShowReturnConfirmModal(false);
    } finally {
      setLoading(false);
    }
  };

  const closeFeedbackModal = () => {
    setFeedback(null);
  };

  return (
    <div>
      <div className="card" style={{ position: "relative" }}>
        {/* Bilgi İkonları - Sağ Üst Köşe */}
        <div style={{ position: "absolute", top: "16px", right: "16px", zIndex: 100 }}>
          {activeTab === "borrow" ? (
            <div style={{ position: "relative" }}>
              <button
                data-info-button-borrow
                onClick={() => setShowBorrowInfo(true)}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  border: "2px solid",
                  borderColor: "#fbbf24",
                  background: "#fef9e7",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "20px",
                  color: "#d97706",
                  transition: "all 0.2s",
                  fontWeight: 700,
                  boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                  padding: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#fef3c7";
                  e.currentTarget.style.borderColor = "#f59e0b";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#fef9e7";
                  e.currentTarget.style.borderColor = "#fbbf24";
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
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
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              <button
                data-info-button-return
                onClick={() => setShowReturnInfo(true)}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  border: "2px solid",
                  borderColor: "#fbbf24",
                  background: "#fef9e7",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "20px",
                  color: "#d97706",
                  transition: "all 0.2s",
                  fontWeight: 700,
                  boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                  padding: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#fef3c7";
                  e.currentTarget.style.borderColor = "#f59e0b";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#fef9e7";
                  e.currentTarget.style.borderColor = "#fbbf24";
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
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
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: "8px", marginBottom: "20px", borderBottom: "2px solid #e5e7eb", paddingBottom: "12px" }}>
          <button
            onClick={() => handleTabChange("borrow")}
            className={activeTab === "borrow" ? "primary" : ""}
            style={{
              padding: "10px 20px",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              backgroundColor: activeTab === "borrow" ? "#2563eb" : "#f3f4f6",
              color: activeTab === "borrow" ? "white" : "#374151",
              fontWeight: activeTab === "borrow" ? 600 : 400,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "6px" }}>
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
              <path d="M9 9l3 3 3-3"></path>
            </svg>
            Ödünç Ver
          </button>
          <button
            onClick={() => handleTabChange("return")}
            className={activeTab === "return" ? "primary" : ""}
            style={{
              padding: "10px 20px",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              backgroundColor: activeTab === "return" ? "#2563eb" : "#f3f4f6",
              color: activeTab === "return" ? "white" : "#374151",
              fontWeight: activeTab === "return" ? 600 : 400,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "6px" }}>
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Teslim Al
          </button>
        </div>

        {error && (
          <div style={{ padding: "12px", backgroundColor: "#fee2e2", color: "#dc2626", borderRadius: "8px", marginBottom: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div>{error}</div>
            {penaltyStudent && (error.includes("cezalı") || error.includes("Ceza Puanı")) && (
              <button
                onClick={() => setShowPenaltyModal(true)}
                style={{
                  padding: "8px 16px",
                  fontSize: "14px",
                  backgroundColor: "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontWeight: 600,
                  alignSelf: "flex-start",
                }}
              >
                ✏️ Ceza Puanını Düzenlemek İçin Tıklayın
              </button>
            )}
          </div>
        )}

        {activeTab === "borrow" && (
          <div>
            <h3 style={{ marginTop: 0, marginBottom: "16px" }}>Kitap Ödünç Verme</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "14px" }}>
                  Kitap Ara ve Seç *
                </label>
                <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "8px" }}>
                  Not: Sağlam kopyası olmayan kitaplar aramada listelenmez.
                </div>
                <input
                  type="text"
                  value={bookSearchTerm}
                  onChange={(e) => setBookSearchTerm(e.target.value)}
                  placeholder="Kitap adı, yazar veya kategori ile ara..."
                  style={{ width: "100%", padding: "10px" }}
                />
                {bookSearchTerm && (
                  <div style={{
                    marginTop: "8px",
                    maxHeight: "300px",
                    overflowY: "auto",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    backgroundColor: "white",
                  }}>
                    {filteredBooks.length > 0 ? (
                      filteredBooks
                        .filter(book => !selectedBooks.some(selected => selected.id === book.id))
                        .map((book) => {
                          const healthyCount = book.healthyCount ?? 0;
                          const healthyColor = healthyCount > 1 ? "#059669" : healthyCount === 1 ? "#d97706" : "#dc2626";
                          // Öğrencinin bu kitabı zaten ödünç alıp almadığını kontrol et
                          const alreadyBorrowed = selectedStudent && loans.some(
                            loan => loan.bookId === book.id && loan.borrower === selectedStudent
                          );

                          return (
                            <div
                              key={book.id}
                              onClick={() => {
                                if (!selectedBooks.some(selected => selected.id === book.id)) {
                                  setSelectedBooks([...selectedBooks, book]);
                                  setBookSearchTerm(""); // Dropdown'ı kapat
                                }
                              }}
                              style={{
                                padding: "12px",
                                cursor: "pointer",
                                borderBottom: "1px solid #f3f4f6",
                                backgroundColor: alreadyBorrowed ? "#f3f4f6" : "white",
                                opacity: alreadyBorrowed ? 0.7 : 1,
                                transition: "background-color 0.2s",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = alreadyBorrowed ? "#e5e7eb" : "#f9fafb";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = alreadyBorrowed ? "#f3f4f6" : "white";
                              }}
                            >
                              <div style={{
                                fontWeight: 600,
                                marginBottom: "4px",
                                color: alreadyBorrowed ? "#6b7280" : "#1f2937"
                              }}>
                                {book.title}
                                {alreadyBorrowed && (
                                  <span style={{
                                    marginLeft: "8px",
                                    fontSize: "11px",
                                    color: "#dc2626",
                                    fontWeight: 600
                                  }}>
                                    ⚠️ Zaten ödünçte
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: "14px", color: alreadyBorrowed ? "#9ca3af" : "#6b7280", marginBottom: "4px" }}>
                                {book.author} • {book.category}
                              </div>
                              <div
                                style={{
                                  fontSize: "12px",
                                  color: "#475569",
                                  display: "flex",
                                  gap: "12px",
                                  flexWrap: "wrap",
                                }}
                              >
                                <span>Mevcut Adet: {book.quantity}</span>
                                <span style={{ color: healthyColor, fontWeight: 600 }}>
                                  Sağlam Mevcut: {healthyCount}
                                </span>
                              </div>
                            </div>
                          );
                        })
                    ) : (
                      <div style={{ padding: "20px", textAlign: "center", color: "#6b7280" }}>
                        Arama sonucu bulunamadı
                      </div>
                    )}
                  </div>
                )}
                {selectedBooks.length > 0 && (
                  <div style={{
                    marginTop: "8px",
                    padding: "12px",
                    backgroundColor: "#eff6ff",
                    borderRadius: "8px",
                    border: "1px solid #3b82f6",
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: "8px", fontSize: "14px" }}>
                      Seçilen Kitaplar ({selectedBooks.length}):
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {selectedBooks.map((book) => {
                        const healthyCount = book.healthyCount ?? 0;
                        const healthyColor = healthyCount > 1 ? "#059669" : healthyCount === 1 ? "#d97706" : "#dc2626";
                        const isOutOfStock = book.quantity <= 0;
                        const showAvailabilityWarning = isOutOfStock || healthyCount <= 0;
                        // Öğrencinin bu kitabı zaten ödünç alıp almadığını kontrol et
                        const alreadyBorrowed = selectedStudent && loans.some(
                          loan => loan.bookId === book.id && loan.borrower === selectedStudent
                        );
                        const cardBackground = alreadyBorrowed || showAvailabilityWarning ? "#f3f4f6" : "white";
                        const cardBorder = alreadyBorrowed || showAvailabilityWarning ? "1px solid #9ca3af" : "1px solid #dbeafe";

                        return (
                          <div
                            key={book.id}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                              padding: "8px",
                              backgroundColor: cardBackground,
                              borderRadius: "6px",
                              border: cardBorder,
                              opacity: alreadyBorrowed || showAvailabilityWarning ? 0.8 : 1,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ flex: 1 }}>
                                <div style={{
                                  fontWeight: 600,
                                  fontSize: "13px",
                                  color: alreadyBorrowed ? "#6b7280" : "#1f2937"
                                }}>
                                  {book.title}
                                </div>
                                <div style={{ fontSize: "12px", color: alreadyBorrowed ? "#9ca3af" : "#6b7280" }}>
                                  {book.author} • {book.category}
                                </div>
                                <div
                                  style={{
                                    fontSize: "12px",
                                    color: "#475569",
                                    display: "flex",
                                    gap: "12px",
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <span>Mevcut Adet: {book.quantity}</span>
                                  <span style={{ color: healthyColor, fontWeight: 600 }}>
                                    Sağlam Mevcut: {healthyCount}
                                  </span>
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  setSelectedBooks(selectedBooks.filter(b => b.id !== book.id));
                                }}
                                style={{
                                  padding: "4px 12px",
                                  fontSize: "12px",
                                  backgroundColor: "#ef4444",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontWeight: 600,
                                  marginLeft: "8px",
                                }}
                              >
                                Kaldır
                              </button>
                            </div>
                            {alreadyBorrowed && (
                              <div style={{
                                padding: "6px 10px",
                                backgroundColor: "#fee2e2",
                                borderRadius: "4px",
                                fontSize: "12px",
                                color: "#dc2626",
                                fontWeight: 600,
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                              }}>
                                <span>⚠️</span>
                                <span>Bu öğrenci zaten bu kitabı ödünç almış!</span>
                              </div>
                            )}
                            {showAvailabilityWarning && (
                              <div style={{
                                padding: "6px 10px",
                                backgroundColor: "#fef2f2",
                                borderRadius: "4px",
                                fontSize: "12px",
                                color: "#dc2626",
                                fontWeight: 600,
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                              }}>
                                <span>⚠️</span>
                                <span>
                                  {isOutOfStock
                                    ? "Mevcut adet 0 olduğu için ödünç verilemez."
                                    : "Sağlam kopya kalmadı, ödünç verilemez."}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => {
                        setSelectedBooks([]);
                      }}
                      style={{
                        marginTop: "8px",
                        padding: "6px 12px",
                        fontSize: "12px",
                        backgroundColor: "#ef4444",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontWeight: 600,
                        width: "100%",
                      }}
                    >
                      Tümünü Kaldır
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "14px" }}>
                  Öğrenci Ara ve Seç *
                </label>
                <input
                  type="text"
                  value={studentSearchTerm}
                  onChange={(e) => setStudentSearchTerm(e.target.value)}
                  placeholder="Öğrenci adı ile ara..."
                  style={{ width: "100%", padding: "10px" }}
                />
                {studentSearchTerm && (
                  <div style={{
                    marginTop: "8px",
                    maxHeight: "300px",
                    overflowY: "auto",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    backgroundColor: "white",
                  }}>
                    {filteredStudents.length > 0 ? (
                      filteredStudents.map((student) => {
                        const studentFullName = formatStudentFullName(student);
                        const studentValidLoans = loans.filter(
                          (l) =>
                            (l.borrower === studentFullName || l.borrower === student.name) &&
                            books.some((b) => b.id === l.bookId)
                        );
                        const normalizedCounters = normalizeStudentCounters(
                          student,
                          studentValidLoans.length,
                        );
                        return (
                          <div
                            key={studentFullName}
                            onClick={() => {
                              setSelectedStudent(studentFullName);
                              setStudentSearchTerm(""); // Dropdown'ı kapat
                            }}
                            style={{
                              padding: "12px",
                              cursor: "pointer",
                              borderBottom: "1px solid #f3f4f6",
                              backgroundColor: selectedStudent === studentFullName ? "#eff6ff" : "white",
                              transition: "background-color 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              if (selectedStudent !== studentFullName) {
                                e.currentTarget.style.backgroundColor = "#f9fafb";
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (selectedStudent !== studentFullName) {
                                e.currentTarget.style.backgroundColor = "white";
                              }
                            }}
                          >
                            <div style={{ fontWeight: 600, color: "#1f2937", marginBottom: "6px" }}>
                              {student.name} {student.surname}
                            </div>
                            <div style={{ fontSize: "12px", color: "#6b7280", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                              <span>
                                <strong>Ödünç:</strong> {normalizedCounters.borrowed}
                              </span>
                              <span>
                                <strong>İade:</strong> {normalizedCounters.returned}
                              </span>
                              <span>
                                <strong>Geciken:</strong>{" "}
                                <span style={{ color: student.late > 0 ? "#ef4444" : "#10b981", fontWeight: 600 }}>
                                  {student.late}
                                </span>
                              </span>
                              <span>
                                <strong>Aktif Ödünç:</strong> {(() => {
                                  return studentValidLoans.length;
                                })()}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div style={{ padding: "20px", textAlign: "center", color: "#6b7280" }}>
                        Arama sonucu bulunamadı
                      </div>
                    )}
                  </div>
                )}
                {selectedStudent && (
                  <div style={{
                    marginTop: "8px",
                    padding: "16px",
                    backgroundColor: "#eff6ff",
                    borderRadius: "8px",
                    border: "1px solid #3b82f6",
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: "12px", fontSize: "16px", color: "#1f2937" }}>
                      Seçilen Öğrenci: {selectedStudent}
                    </div>
                    {(() => {
                      const studentData = students.find((s) =>
                        s.name === selectedStudent ||
                        `${s.name} ${s.surname}`.trim() === selectedStudent ||
                        s.surname === selectedStudent
                      );
                      if (!studentData) return null;
                      const studentValidLoans = loans.filter(l =>
                        (l.borrower === selectedStudent || l.borrower === studentData.name) &&
                        books.some(b => b.id === l.bookId)
                      );
                      const activeLoansCount = studentValidLoans.length;
                      const normalizedCounters = normalizeStudentCounters(studentData, activeLoansCount);
                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
                          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                            <div style={{ fontSize: "14px" }}>
                              <strong>Toplam Ödünç:</strong> {normalizedCounters.borrowed}
                            </div>
                            <div style={{ fontSize: "14px" }}>
                              <strong>İade:</strong> {normalizedCounters.returned}
                            </div>
                            <div style={{ fontSize: "14px" }}>
                              <strong>Geciken Kitap:</strong>{" "}
                              <span style={{ color: studentData.late > 0 ? "#ef4444" : "#10b981", fontWeight: 600 }}>
                                {studentData.late}
                              </span>
                            </div>
                            <div style={{ fontSize: "14px" }}>
                              <strong>Aktif Ödünç:</strong>{" "}
                              {(() => {
                                return (
                                  <>
                                    <span style={{ color: activeLoansCount > 0 ? "#3b82f6" : "#10b981", fontWeight: 600 }}>
                                      {activeLoansCount}
                                    </span>
                                    <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "8px" }}>
                                      / {maxBorrowLimit} (Limit)
                                    </span>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                          {(() => {
                            const availableBooks = getAvailableBooks(selectedBooks, selectedStudent);
                            const totalAfterBorrow = activeLoansCount + availableBooks.length;
                            const remainingSlots = maxBorrowLimit - activeLoansCount;
                            const alreadyBorrowedCount = selectedBooks.length - availableBooks.length;

                            if (totalAfterBorrow > maxBorrowLimit) {
                              return (
                                <div style={{
                                  padding: "8px",
                                  backgroundColor: "#fee2e2",
                                  borderRadius: "6px",
                                  color: "#dc2626",
                                  fontSize: "13px",
                                  fontWeight: 600,
                                  marginBottom: "8px",
                                }}>
                                  ⚠️ Bu işlem sonrası öğrenci {totalAfterBorrow} kitap alacak (Limit: {maxBorrowLimit}). Onay gerekecek!
                                  {alreadyBorrowedCount > 0 && (
                                    <span style={{ display: "block", fontSize: "12px", marginTop: "4px" }}>
                                      ({alreadyBorrowedCount} kitap zaten ödünçte, verilemeyecek)
                                    </span>
                                  )}
                                </div>
                              );
                            } else if (remainingSlots > 0 && remainingSlots <= 2 && availableBooks.length > 0) {
                              return (
                                <div style={{
                                  padding: "8px",
                                  backgroundColor: "#fef3c7",
                                  borderRadius: "6px",
                                  color: "#92400e",
                                  fontSize: "13px",
                                  fontWeight: 600,
                                  marginBottom: "8px",
                                }}>
                                  ℹ️ Öğrencinin {remainingSlots} kitap daha alma hakkı var.
                                  {alreadyBorrowedCount > 0 && (
                                    <span style={{ display: "block", fontSize: "12px", marginTop: "4px" }}>
                                      ({alreadyBorrowedCount} kitap zaten ödünçte, verilemeyecek)
                                    </span>
                                  )}
                                </div>
                              );
                            } else if (alreadyBorrowedCount > 0) {
                              return (
                                <div style={{
                                  padding: "8px",
                                  backgroundColor: "#fee2e2",
                                  borderRadius: "6px",
                                  color: "#dc2626",
                                  fontSize: "13px",
                                  fontWeight: 600,
                                  marginBottom: "8px",
                                }}>
                                  ⚠️ Seçilen kitaplardan {alreadyBorrowedCount} tanesi öğrenci tarafından zaten ödünç alınmış. Bu kitaplar verilmeyecek.
                                </div>
                              );
                            }
                            return null;
                          })()}
                          {studentData.late > 0 && (
                            <div style={{
                              padding: "8px",
                              backgroundColor: "#fee2e2",
                              borderRadius: "6px",
                              color: "#dc2626",
                              fontSize: "13px",
                              fontWeight: 600,
                            }}>
                              ⚠️ Bu öğrencinin {studentData.late} geciken kitabı var!
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    <button
                      onClick={() => {
                        setSelectedStudent("");
                      }}
                      style={{
                        padding: "6px 16px",
                        fontSize: "13px",
                        backgroundColor: "#ef4444",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      Seçimi Kaldır
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "14px" }}>
                  Ödünç Süresi (Gün)
                </label>
                <select
                  value={days}
                  onChange={(e) => setDays(parseInt(e.target.value))}
                  style={{ width: "100%", padding: "10px" }}
                >
                  <option value={7}>7 Gün</option>
                  <option value={10}>10 Gün</option>
                  <option value={14}>14 Gün</option>
                  <option value={21}>21 Gün</option>
                  <option value={30}>30 Gün</option>
                </select>
              </div>

              {hasUnavailableSelection && (
                <div
                  style={{
                    padding: "10px",
                    backgroundColor: "#fee2e2",
                    borderRadius: "6px",
                    color: "#b91c1c",
                    fontSize: "13px",
                    fontWeight: 600,
                  }}
                >
                  ⚠️ Mevcut adedi 0 olan veya sağlam kopyası kalmayan kitaplar seçimde. Lütfen bu kitapları kaldırın.
                </div>
              )}

              <button
                className="primary"
                onClick={handleBorrow}
                disabled={isBorrowButtonDisabled}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  backgroundColor: isBorrowButtonDisabled ? "#94a3b8" : undefined,
                  cursor: isBorrowButtonDisabled ? "not-allowed" : "pointer",
                  opacity: isBorrowButtonDisabled ? 0.9 : 1,
                }}
              >
                {loading ? "İşleniyor..." : (() => {
                  const availableBooks = selectedStudent ? getAvailableBooks(selectedBooks, selectedStudent) : selectedBooks;
                  return (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                        <path d="M9 9l3 3 3-3"></path>
                      </svg>
                      Ödünç Ver ({availableBooks.length} kitap)
                    </>
                  );
                })()}
              </button>
            </div>
          </div>
        )}

        {activeTab === "return" && (
          <div>
            <h3 style={{ marginTop: 0, marginBottom: "16px" }}>Kitap Teslim Alma</h3>
            {borrowedBooks.length === 0 ? (
              <p>Şu an ödünçte kitap bulunmuyor.</p>
            ) : (
              <>
                <div style={{ marginBottom: "16px" }}>
                  <input
                    type="text"
                    value={returnSearchTerm}
                    onChange={(e) => setReturnSearchTerm(e.target.value)}
                    placeholder="Kitap adı, yazar veya öğrenci adı ile ara..."
                    style={{ width: "100%", padding: "10px", marginBottom: "12px" }}
                  />

                  {/* Teslim Tarihi Filtre Butonları */}
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "#64748b", marginBottom: "8px" }}>
                      Teslim Tarihi Filtreleri
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "8px" }}>
                      {(() => {
                        const allLoans = borrowedBooks.flatMap(book =>
                          book.loans.map(loan => {
                            const dueDate = new Date(loan.dueDate);
                            const remainingDays = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                            return remainingDays;
                          })
                        );
                        const gecikmisCount = allLoans.filter(d => d < 0).length;
                        const count0_3 = allLoans.filter(d => d >= 0 && d <= 3).length;
                        const count4_7 = allLoans.filter(d => d >= 4 && d <= 7).length;
                        const count8_14 = allLoans.filter(d => d >= 8 && d <= 14).length;
                        const count15plus = allLoans.filter(d => d >= 15).length;

                        return [
                          {
                            label: "Gecikmiş",
                            value: "gecikmis",
                            color: "#6b7280",
                            bgColor: "#f3f4f6",
                            textColor: "#374151",
                            count: gecikmisCount
                          },
                          {
                            label: "0-3 Gün",
                            value: "0-3",
                            color: "#ef4444",
                            bgColor: "#fef2f2",
                            textColor: "#991b1b",
                            count: count0_3
                          },
                          {
                            label: "4-7 Gün",
                            value: "4-7",
                            color: "#f59e0b",
                            bgColor: "#fffbeb",
                            textColor: "#92400e",
                            count: count4_7
                          },
                          {
                            label: "8-14 Gün",
                            value: "8-14",
                            color: "#3b82f6",
                            bgColor: "#eff6ff",
                            textColor: "#1e40af",
                            count: count8_14
                          },
                          {
                            label: "15+ Gün",
                            value: "15+",
                            color: "#10b981",
                            bgColor: "#f0fdf4",
                            textColor: "#065f46",
                            count: count15plus
                          },
                        ].map((filter) => (
                          <button
                            key={filter.value}
                            onClick={() => {
                              setReturnStatusFilter(returnStatusFilter === filter.value ? "" : filter.value);
                            }}
                            style={{
                              padding: "10px",
                              borderRadius: "8px",
                              border: returnStatusFilter === filter.value ? `2px solid ${filter.color}` : "1px solid #e5e7eb",
                              background: returnStatusFilter === filter.value ? filter.bgColor : "#fff",
                              cursor: "pointer",
                              fontWeight: 700,
                              color: returnStatusFilter === filter.value ? filter.textColor : "#374151",
                              fontSize: "13px",
                              transition: "all 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              if (returnStatusFilter !== filter.value) {
                                e.currentTarget.style.backgroundColor = filter.bgColor;
                                e.currentTarget.style.borderColor = filter.color;
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (returnStatusFilter !== filter.value) {
                                e.currentTarget.style.backgroundColor = "#fff";
                                e.currentTarget.style.borderColor = "#e5e7eb";
                              }
                            }}
                          >
                            <div>{filter.label}</div>
                            <div style={{ fontSize: "11px", opacity: 0.8, marginTop: "2px" }}>
                              ({filter.count})
                            </div>
                          </button>
                        ));
                      })()}
                    </div>
                  </div>

                  {/* Filtreleme */}
                  <div style={{ display: "flex", gap: "12px", flexWrap: "nowrap", overflowX: "auto" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: "0 0 160px", minWidth: "160px", maxWidth: "160px" }}>
                      <label style={{ fontSize: "12px", fontWeight: 600, color: "#64748b" }}>Kategori</label>
                      <div style={{ width: "100%", maxWidth: "100%", overflow: "hidden" }}>
                        <select
                          value={returnCategoryFilter}
                          onChange={(e) => setReturnCategoryFilter(e.target.value)}
                          style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb", backgroundColor: "#fff", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}
                          title={returnCategoryFilter || "Tümü"}
                        >
                          <option value="">Tümü</option>
                          {returnCategories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
                      {/* Sıralama Butonu */}
                      <button
                        onClick={() => {
                          if (returnSortBy === "borrower") {
                            setReturnSortOrder(returnSortOrder === "asc" ? "desc" : "asc");
                          } else {
                            setReturnSortBy("borrower");
                            setReturnSortOrder("asc");
                          }
                        }}
                        style={{
                          padding: "8px 16px",
                          backgroundColor: returnSortBy === "borrower" ? "#3b82f6" : "#f3f4f6",
                          color: returnSortBy === "borrower" ? "white" : "#374151",
                          border: returnSortBy === "borrower" ? "2px solid #2563eb" : "1px solid #e5e7eb",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "13px",
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                        title={returnSortBy === "borrower"
                          ? (returnSortOrder === "asc" ? "A-Z sıralama (Z-A'ya geçmek için tıklayın)" : "Z-A sıralama (A-Z'ye geçmek için tıklayın)")
                          : "Öğrenci adına göre sırala"}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          {returnSortBy === "borrower" && returnSortOrder === "asc" ? (
                            <path d="M3 6h18M7 12h10M11 18h2" />
                          ) : returnSortBy === "borrower" && returnSortOrder === "desc" ? (
                            <path d="M3 18h18M7 12h10M11 6h2" />
                          ) : (
                            <path d="M3 6h18M7 12h10M11 18h2" />
                          )}
                        </svg>
                        {returnSortBy === "borrower"
                          ? (returnSortOrder === "asc" ? "A-Z" : "Z-A")
                          : "Öğrenciye Göre Sırala"}
                      </button>
                      {(returnSearchTerm || returnCategoryFilter || returnStatusFilter) && (
                        <button
                          onClick={() => {
                            setReturnSearchTerm("");
                            setReturnCategoryFilter("");
                            setReturnStatusFilter("");
                          }}
                          style={{
                            padding: "8px 16px",
                            backgroundColor: "#ef4444",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "13px",
                            fontWeight: 600,
                          }}
                        >
                          Filtreleri Temizle
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {filteredBorrowedBooks.length === 0 ? (
                    <div style={{ padding: "20px", textAlign: "center", color: "#6b7280" }}>
                      {returnSearchTerm ? "Arama sonucu bulunamadı" : "Şu an ödünçte kitap bulunmuyor."}
                    </div>
                  ) : (
                    filteredBorrowedBooks.map(({ book, loan, remainingDays, borrowerFullName }, index) => {
                      const isLate = remainingDays < 0;
                      const isWarning = remainingDays >= 0 && remainingDays <= 3;
                      const dueDate = new Date(loan.dueDate);

                      return (
                        <div
                          key={`${book.id}-${loan.borrower}-${index}`}
                          style={{
                            padding: "16px",
                            backgroundColor: "#f8fafc",
                            borderRadius: "8px",
                            border: "1px solid #e2e8f0",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
                            <div style={{ fontWeight: 600, marginBottom: "4px" }}>{book.title}</div>
                            <div style={{
                              fontSize: "14px",
                              color: "#1e293b",
                              marginBottom: "4px",
                              fontWeight: 600,
                              padding: "6px 10px",
                              backgroundColor: "#eff6ff",
                              borderRadius: "6px",
                              display: "inline-block",
                              width: "fit-content"
                            }}>
                              Öğrenci: {borrowerFullName}
                            </div>
                            <div style={{ fontSize: "12px", color: "#64748b" }}>
                              Teslim Tarihi: {dueDate.toLocaleDateString("tr-TR", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })}
                            </div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
                            <span
                              style={{
                                padding: "4px 12px",
                                borderRadius: "12px",
                                fontSize: "12px",
                                fontWeight: 600,
                                backgroundColor: isLate ? "#fee2e2" : isWarning ? "#fef3c7" : "#d1fae5",
                                color: isLate ? "#dc2626" : isWarning ? "#d97706" : "#059669",
                              }}
                            >
                              {remainingDays < 0
                                ? `${Math.abs(remainingDays)} gün geçti`
                                : remainingDays === 0
                                  ? "Süresi Doldu"
                                  : `${remainingDays} gün kaldı`}
                            </span>
                            <button
                              onClick={() => handleReturn(book.id!, loan.borrower, book.title)}
                              disabled={loading}
                              style={{
                                padding: "8px 16px",
                                backgroundColor: isLate ? "#ef4444" : isWarning ? "#f59e0b" : "#3b82f6",
                                color: "white",
                                border: "none",
                                borderRadius: "6px",
                                cursor: loading ? "not-allowed" : "pointer",
                                opacity: loading ? 0.7 : 1,
                                fontWeight: 600,
                                fontSize: "13px",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                              </svg>
                              Teslim Al
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Onay Modalı - kitap limiti aşıldığında */}
      {showConfirmModal && pendingBorrow && (() => {
        const studentData = students.find((s) =>
          s.name === pendingBorrow.student ||
          `${s.name} ${s.surname}`.trim() === pendingBorrow.student ||
          s.surname === pendingBorrow.student
        );
        if (!studentData) return null;

        // Öğrencinin zaten aldığı kitapları filtrele
        const studentFullName = formatStudentFullName(studentData);
        if (!studentFullName) {
          setError("Geçerli bir öğrenci seçin");
          return;
        }
        const availableBooks = getAvailableBooks(pendingBorrow.books, studentFullName);
        // Aktif ödünç sayısını loans array'inden hesapla ve silinmiş kitapları filtrele
        const studentValidLoans = loans.filter(l =>
          l.borrower === pendingBorrow.student && books.some(b => b.id === l.bookId)
        );
        const activeLoans = studentValidLoans.length;
        const totalAfterBorrow = activeLoans + availableBooks.length;
        const excess = totalAfterBorrow - maxBorrowLimit;
        const alreadyBorrowedCount = pendingBorrow.books.length - availableBooks.length;

        return (
          <ConfirmCard
            isOpen={showConfirmModal}
            title="Kitap Limiti Uyarısı"
            icon="⚠️"
            onConfirm={async () => {
              if (studentData) {
                await executeBorrow(availableBooks, studentData);
              }
            }}
            onCancel={() => {
              setShowConfirmModal(false);
              setPendingBorrow(null);
            }}
            confirmText="Devam Et"
            cancelText="İptal"
            confirmButtonColor="#ef4444"
            loading={loading}
            disabled={availableBooks.length === 0}
          >
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "14px", color: "#475569", marginBottom: "12px", lineHeight: "1.6" }}>
                <strong>{pendingBorrow.student}</strong> öğrencisi şu anda <strong>{activeLoans}</strong> kitap ödünç almış durumda.
              </div>
              {alreadyBorrowedCount > 0 && (
                <div style={{
                  padding: "8px",
                  backgroundColor: "#fee2e2",
                  borderRadius: "6px",
                  color: "#dc2626",
                  fontSize: "13px",
                  fontWeight: 600,
                  marginBottom: "12px",
                }}>
                  ⚠️ Seçilen kitaplardan <strong>{alreadyBorrowedCount}</strong> tanesi öğrenci tarafından zaten ödünç alınmış. Bu kitaplar verilmeyecek.
                </div>
              )}
              <div style={{ fontSize: "14px", color: "#475569", marginBottom: "12px", lineHeight: "1.6" }}>
                Verilebilecek <strong>{availableBooks.length}</strong> kitap eklendiğinde toplam <strong>{totalAfterBorrow}</strong> kitap olacak.
              </div>
              <div
                style={{
                  padding: "12px",
                  backgroundColor: "#fef3c7",
                  borderRadius: "8px",
                  border: "1px solid #fbbf24",
                  marginBottom: "12px",
                }}
              >
                <div style={{ fontSize: "14px", color: "#92400e", fontWeight: 600, marginBottom: "4px" }}>
                  ⚠️ Limit Aşımı
                </div>
                <div style={{ fontSize: "13px", color: "#78350f" }}>
                  Bir öğrenci en fazla <strong>{maxBorrowLimit} kitap</strong> alabilir. Bu işlem sonrası öğrenci <strong>{excess} kitap fazla</strong> alacak.
                  {alreadyBorrowedCount > 0 && (
                    <span style={{ display: "block", marginTop: "4px", fontSize: "12px" }}>
                      Not: {alreadyBorrowedCount} kitap zaten ödünçte olduğu için verilmeyecek.
                    </span>
                  )}
                </div>
              </div>
              <div style={{ fontSize: "13px", color: "#64748b", marginTop: "12px" }}>
                <strong>Verilebilecek Kitaplar ({availableBooks.length}):</strong>
                <ul style={{ marginTop: "8px", paddingLeft: "20px", fontSize: "12px" }}>
                  {availableBooks.map((book) => (
                    <li key={book.id} style={{ marginBottom: "4px" }}>
                      {book.title} - {book.author}
                    </li>
                  ))}
                </ul>
                {alreadyBorrowedCount > 0 && (
                  <>
                    <strong style={{ color: "#dc2626", marginTop: "12px", display: "block" }}>
                      Zaten Ödünçte Olan Kitaplar ({alreadyBorrowedCount}):
                    </strong>
                    <ul style={{ marginTop: "8px", paddingLeft: "20px", fontSize: "12px", color: "#9ca3af" }}>
                      {pendingBorrow.books
                        .filter(book => !availableBooks.some(ab => ab.id === book.id))
                        .map((book) => (
                          <li key={book.id} style={{ marginBottom: "4px", textDecoration: "line-through" }}>
                            {book.title} - {book.author}
                          </li>
                        ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </ConfirmCard>
        );
      })()}

      {/* Ceza Puanı Düzenleme Modal */}
      {showPenaltyModal && penaltyStudent && createPortal(
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
            zIndex: 1000,
          }}
          onClick={() => {
            setShowPenaltyModal(false);
            setPenaltyStudent(null);
            setError(null);
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: "600px",
              width: "90%",
              maxHeight: "90vh",
              overflow: "auto",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h2 style={{ margin: 0, color: "#1e293b" }}>Ceza Puanı Düzenle</h2>
              <button
                onClick={() => {
                  setShowPenaltyModal(false);
                  setPenaltyStudent(null);
                  setError(null);
                }}
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

            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Öğrenci Bilgileri */}
              <div style={{ padding: "16px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontWeight: 600, marginBottom: "8px", fontSize: "16px" }}>{penaltyStudent.name}</div>
                <div style={{ fontSize: "14px", color: "#64748b" }}>
                  {penaltyStudent.class && penaltyStudent.branch
                    ? `${penaltyStudent.class}-${penaltyStudent.branch}`
                    : penaltyStudent.class
                      ? `${penaltyStudent.class}. Sınıf`
                      : ""}
                  {penaltyStudent.studentNumber && ` • No: ${penaltyStudent.studentNumber}`}
                </div>
              </div>

              {/* Ceza Puanı */}
              <div style={{ padding: "20px", backgroundColor: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "18px", fontWeight: 600, color: "#1e293b" }}>⚖️ Ceza Puanı</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <div style={{ flex: 1 }}>
                      <strong style={{ color: "#64748b", fontSize: "14px", display: "block", marginBottom: "4px" }}>Mevcut Ceza Puanı</strong>
                      <p style={{ margin: 0, fontSize: "24px", fontWeight: 700, color: (penaltyStudent.penaltyPoints || 0) >= maxPenaltyPoints ? "#ef4444" : (penaltyStudent.penaltyPoints || 0) > 0 ? "#f59e0b" : "#10b981" }}>
                        {penaltyStudent.penaltyPoints || 0}
                      </p>
                    </div>
                    {(penaltyStudent.penaltyPoints || 0) >= maxPenaltyPoints && (
                      <div style={{
                        padding: "12px 20px",
                        backgroundColor: "#fee2e2",
                        borderRadius: "8px",
                        border: "2px solid #ef4444",
                        color: "#dc2626",
                        fontWeight: 600
                      }}>
                        ⚠️ Ceza Durumunda - Kitap Alamaz
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input
                      type="number"
                      id="penalty-points-edit-input"
                      min="0"
                      defaultValue={penaltyStudent.penaltyPoints || 0}
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
                      onClick={async () => {
                        const input = document.getElementById("penalty-points-edit-input") as HTMLInputElement;
                        if (!input) return;
                        const newPenaltyPoints = parseInt(input.value) || 0;
                        if (newPenaltyPoints < 0) {
                          alert("Ceza puanı negatif olamaz.");
                          return;
                        }
                        try {
                          setLoading(true);
                          await httpClient.put(`/admin/students/${encodeURIComponent(penaltyStudent.name)}/penalty`, {
                            penaltyPoints: newPenaltyPoints
                          });
                          setPenaltyStudent({ ...penaltyStudent, penaltyPoints: newPenaltyPoints, isBanned: newPenaltyPoints >= maxPenaltyPoints });
                          setShowPenaltyModal(false);
                          setPenaltyStudent(null);
                          setError(null);
                          if (onRefresh) {
                            await onRefresh();
                          }
                          alert("Ceza puanı başarıyla güncellendi.");
                        } catch (err) {
                          alert(err instanceof Error ? err.message : "Ceza puanı güncellenirken bir hata oluştu");
                        } finally {
                          setLoading(false);
                        }
                      }}
                      disabled={loading}
                      style={{
                        padding: "10px 20px",
                        fontSize: "14px",
                        backgroundColor: loading ? "#9ca3af" : "#3b82f6",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        cursor: loading ? "not-allowed" : "pointer",
                        fontWeight: 600,
                      }}
                    >
                      {loading ? "Güncelleniyor..." : "Güncelle"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* Borrow Info Modal */}
      {showBorrowInfo && createPortal(
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
            zIndex: 10005,
          }}
          onClick={() => setShowBorrowInfo(false)}
        >
          <div
            className="card"
            style={{
              maxWidth: "500px",
              width: "90%",
              padding: "24px",
              animation: "slideIn 0.3s ease-out",
              backgroundColor: "#fffbeb", // Amber-50 (hafif sarımsı, bilgi/uyarı tonu)
              border: "1px solid #fcd34d",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 600, color: "#1e293b", display: "flex", alignItems: "center", gap: "8px" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                  <path d="M9 9l3 3 3-3"></path>
                </svg>
                Ödünç Ver İşlemi
              </h3>
              <button
                onClick={() => setShowBorrowInfo(false)}
                style={{ background: "none", border: "none", fontSize: "24px", cursor: "pointer", color: "#9ca3af" }}
              >
                &times;
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "14px", color: "#475569", lineHeight: "1.6" }}>
              <div style={{ padding: "12px", backgroundColor: "white", borderRadius: "8px", border: "1px solid #fde68a" }}>
                <strong style={{ color: "#d97706", display: "block", marginBottom: "4px" }}>Nasıl Yapılır?</strong>
                <ol style={{ margin: "0", paddingLeft: "20px" }}>
                  <li>Öğrenci seçin veya arama yapın.</li>
                  <li>Verilecek kitapları listeden seçin.</li>
                  <li>Ödünç süresini belirleyin (Standart: 14 gün).</li>
                  <li><strong>"Ödünç Ver"</strong> butonuna basarak işlemi tamamlayın.</li>
                </ol>
              </div>

              <p style={{ margin: 0 }}>
                <strong style={{ color: "#1e293b" }}>Uyarı:</strong> Ceza puanı {maxPenaltyPoints} ve üzeri olan öğrenciler kitap alamaz.
              </p>
              <p style={{ margin: 0 }}>
                <strong style={{ color: "#1e293b" }}>Stok Kontrolü:</strong> Sağlam kopyası olmayan veya stoğu tükenen kitaplar aramada çıkmaz.
              </p>
            </div>

            <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowBorrowInfo(false)}
                style={{
                  padding: "8px 24px",
                  backgroundColor: "#d97706",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Anlaşıldı
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Return Info Modal */}
      {showReturnInfo && createPortal(
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
            zIndex: 10005,
          }}
          onClick={() => setShowReturnInfo(false)}
        >
          <div
            className="card"
            style={{
              maxWidth: "500px",
              width: "90%",
              padding: "24px",
              animation: "slideIn 0.3s ease-out",
              backgroundColor: "#fffbeb",
              border: "1px solid #fcd34d",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 600, color: "#1e293b", display: "flex", alignItems: "center", gap: "8px" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Teslim Al İşlemi
              </h3>
              <button
                onClick={() => setShowReturnInfo(false)}
                style={{ background: "none", border: "none", fontSize: "24px", cursor: "pointer", color: "#9ca3af" }}
              >
                &times;
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "14px", color: "#475569", lineHeight: "1.6" }}>
              <div style={{ padding: "12px", backgroundColor: "white", borderRadius: "8px", border: "1px solid #fde68a" }}>
                <strong style={{ color: "#d97706", display: "block", marginBottom: "4px" }}>Nasıl Yapılır?</strong>
                <ol style={{ margin: "0", paddingLeft: "20px" }}>
                  <li>Listeden iade edilecek kitabı bulun (Arama yapabilirsiniz).</li>
                  <li><strong>"Teslim Al"</strong> butonuna tıklayın.</li>
                  <li>Onay penceresinde işlemi doğrulayın.</li>
                </ol>
              </div>

              <p style={{ margin: 0 }}>
                <strong style={{ color: "#1e293b" }}>Gecikme Cezası:</strong> Geciken kitaplar teslim alındığında sistem otomatik olarak ceza puanı hesaplar ve öğrenci siciline işler.
              </p>
              <p style={{ margin: 0 }}>
                <strong style={{ color: "#1e293b" }}>Otomatik Güncelleme:</strong> Teslim alınan kitabın stok adedi otomatik artırılır.
              </p>
            </div>

            <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowReturnInfo(false)}
                style={{
                  padding: "8px 24px",
                  backgroundColor: "#d97706",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Anlaşıldı
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Feedback Modal - STANDARDIZED */}
      <InfoCard
        isOpen={!!feedback}
        title={feedback?.type === "success" ? "İşlem Başarılı" : "Bir Hata Oluştu"}
        type={feedback?.type || "info"}
        onClose={closeFeedbackModal}
      >
        <p>{feedback?.message}</p>
      </InfoCard>

      {/* Return Confirmation Modal - MODULAR */}
      {showReturnConfirmModal && selectedReturnLoan && createPortal(
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
            zIndex: 10010,
          }}
          onClick={() => setShowReturnConfirmModal(false)}
        >
          <div
            className="card"
            style={{
              maxWidth: "450px",
              width: "90%",
              padding: "24px",
              animation: "slideIn 0.3s ease-out",
              backgroundColor: "white",
              borderRadius: "16px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <div style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                backgroundColor: "#eff6ff",
                color: "#3b82f6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px auto",
                boxShadow: "0 4px 6px -1px rgba(59, 130, 246, 0.1)"
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                </svg>
              </div>
              <h3 style={{ margin: "0 0 12px 0", fontSize: "20px", fontWeight: 700, color: "#1e293b" }}>
                Teslim Almayı Onayla
              </h3>
              <div style={{ backgroundColor: "#f8fafc", padding: "16px", borderRadius: "12px", border: "1px solid #e2e8f0", marginBottom: "8px" }}>
                <p style={{ margin: "0 0 8px 0", color: "#64748b", fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Kitap</p>
                <p style={{ margin: "0 0 16px 0", color: "#334155", fontWeight: 700, fontSize: "16px" }}>{selectedReturnLoan.bookTitle || "Kitap Bilgisi Yok"}</p>
                <p style={{ margin: "0 0 8px 0", color: "#64748b", fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, borderTop: "1px solid #e2e8f0", paddingTop: "12px" }}>Öğrenci</p>
                <p style={{ margin: "0", color: "#334155", fontWeight: 700, fontSize: "16px" }}>{selectedReturnLoan.borrowerName}</p>
              </div>
              <p style={{ margin: "16px 0 0 0", color: "#64748b", lineHeight: "1.5", fontSize: "14px" }}>
                Bu kitabı teslim almak ve stoklara geri eklemek istediğinize emin misiniz?
              </p>
            </div>

            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => setShowReturnConfirmModal(false)}
                style={{
                  flex: 1,
                  padding: "12px",
                  backgroundColor: "white",
                  color: "#64748b",
                  border: "1px solid #cbd5e1",
                  borderRadius: "10px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s",
                  fontSize: "15px"
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#f1f5f9"; e.currentTarget.style.borderColor = "#94a3b8"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "white"; e.currentTarget.style.borderColor = "#cbd5e1"; }}
              >
                Vazgeç
              </button>
              <button
                onClick={processReturn}
                style={{
                  flex: 1,
                  padding: "12px",
                  backgroundColor: "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: "10px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s",
                  fontSize: "15px",
                  boxShadow: "0 4px 6px -1px rgba(59, 130, 246, 0.2)"
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#2563eb"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#3b82f6"; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                Onayla ve Teslim Al
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default LoanManagement;
