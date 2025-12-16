import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Book, StudentStat, LoanInfo, BookHistoryResponse, BookHistoryEntry } from "../api/types";
import { httpClient } from "../api/client";
import { searchIncludes } from "../utils/searchUtils";
import { normalizeStudentCounters } from "../utils/studentStats";
import { evaluateBorrowLimit, BorrowLimitCheckResult, evaluateBorrowSelection } from "../utils/borrowLimit";
import { ConditionCounts, normalizeConditionCounts, tryAdjustConditionCounts } from "../utils/bookCondition";
import ConfirmCard from "./ConfirmCard";
import InfoCard from "./InfoCard";
import { formatStudentFullName } from "../utils/studentName";

// NOT: Dinamik ceza puanı hesaplama kaldırıldı
// Ceza puanı sadece backend'deki değer olarak gösterilir
// Teslim alındığında backend'de gecikme gün sayısı kadar ceza puanı eklenir ve kalıcı olur

type Props = {
    book: Book | null;
    students?: StudentStat[];
    loans?: LoanInfo[]; // Silinmiş kitapları filtrelemek için
    books?: Book[]; // Silinmiş kitapları filtrelemek için
    personelName?: string;
    onClose: () => void;
    onRefresh?: () => void;
    onEdit?: (book: Book) => void;
    isReadOnly?: boolean; // Öğrenci için sadece okuma modu
    onAddNotification?: (type: "info" | "success" | "warning" | "error", title: string, message: string) => void;
};

const BookDetailContent = ({ book, students = [], loans = [], books = [], personelName = "", onClose, onRefresh, onEdit, isReadOnly = false, onAddNotification }: Props) => {
    // Yardımcı tarih fonksiyonu - 00:00 bazlı
    const getDaysDiff = (dueDateStr: string | Date) => {
        const dueDate = new Date(dueDateStr);
        dueDate.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    };

    const normalizePersonName = (value: string) => {
        return (value || "")
            .toString()
            .trim()
            .toLocaleLowerCase("tr-TR")
            .replace(/\s+/g, " ");
    };

    const calculateDurationInDays = (start?: string, end?: string) => {
        if (!start || !end) {
            return null;
        }
        const startDate = new Date(start);
        const endDate = new Date(end);
        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
            return null;
        }
        const diffMs = endDate.getTime() - startDate.getTime();
        if (diffMs < 0) {
            return 0;
        }
        return Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
    };

    const buildBorrowerHistoryKey = (borrower?: string, studentNumber?: number | null) => {
        if (typeof studentNumber === "number") {
            return `num:${studentNumber}`;
        }
        const normalized = (borrower || "").trim().toLowerCase();
        if (normalized) {
            return `name:${normalized}`;
        }
        return "unknown";
    };

    // Geciken kitap sayısını dinamik hesapla
    const calculateDynamicLateCount = (studentName: string, loans: LoanInfo[], books: Book[]): number => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return loans.filter(loan => {
            // Bu öğrencinin ödüncü mü?
            if (loan.borrower !== studentName) return false;

            // Kitap silinmemiş mi? (books array'de var mı?)
            const bookExists = books.some(b => b.id === loan.bookId);
            if (!bookExists) return false;

            // Teslim tarihi geçmiş mi?
            const dueDate = new Date(loan.dueDate);
            dueDate.setHours(0, 0, 0, 0);

            return dueDate.getTime() < today.getTime();
        }).length;
    };

    const [showBorrowModal, setShowBorrowModal] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [showReturnModal, setShowReturnModal] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState<string>("");
    const [studentSearchTerm, setStudentSearchTerm] = useState("");
    const [days, setDays] = useState(14);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showInfoCard, setShowInfoCard] = useState(false);
    const [infoCardData, setInfoCardData] = useState<{ title: string; message: string; type: "info" | "success" | "warning" | "error"; icon?: string } | null>(null);
    const [confirmDialog, setConfirmDialog] = useState<{
        title: string;
        message: string;
        icon?: string;
        confirmText?: string;
        confirmButtonColor?: string;
        onConfirm: () => void | Promise<void>;
    } | null>(null);
    const [confirmDialogLoading, setConfirmDialogLoading] = useState(false);
    const [pendingBorrow, setPendingBorrow] = useState<{ books: Book[]; student: string } | null>(null);
    const [selectedLoan, setSelectedLoan] = useState<{ borrower: string; dueDate: string } | null>(null);
    const [currentBook, setCurrentBook] = useState<Book | null>(book);
    const [selectedStudentDetail, setSelectedStudentDetail] = useState<StudentStat | null>(null);
    const [isBookHistoryExpanded, setIsBookHistoryExpanded] = useState(false);
    const [showPenaltyModal, setShowPenaltyModal] = useState(false);
    const [penaltyStudent, setPenaltyStudent] = useState<StudentStat | null>(null);
    const [showActionModal, setShowActionModal] = useState(false);
    const [selectedLoanForAction, setSelectedLoanForAction] = useState<{ borrower: string; dueDate: string } | null>(null);
    const [extendDays, setExtendDays] = useState(7);
    const [actionModalError, setActionModalError] = useState<string | null>(null);
    const [conditionError, setConditionError] = useState<string | null>(null);
    const [conditionUpdating, setConditionUpdating] = useState(false);
    const [maxBorrowLimit, setMaxBorrowLimit] = useState(5);
    const [maxPenaltyPoints, setMaxPenaltyPoints] = useState(100);
    const [bookHistory, setBookHistory] = useState<BookHistoryResponse | null>(null);
    const [bookHistoryLoading, setBookHistoryLoading] = useState(false);
    const [bookHistoryError, setBookHistoryError] = useState<string | null>(null);

    const selectedStudentData = useMemo(() => {
        const normalizedSelection = selectedStudent.trim();
        if (!normalizedSelection) {
            return undefined;
        }

        const normalizedLower = normalizedSelection.toLowerCase();
        return students.find((s) => {
            const studentFullName = formatStudentFullName(s).toLowerCase();
            const studentNumber = s.studentNumber ? `${s.studentNumber}` : null;
            return (
                studentFullName === normalizedLower ||
                s.name?.toLowerCase() === normalizedLower ||
                (s.surname ? s.surname.toLowerCase() : "") === normalizedLower ||
                studentNumber === normalizedSelection
            );
        });
    }, [selectedStudent, students]);

    const selectedStudentFullName = useMemo(() => {
        if (selectedStudentData) {
            return formatStudentFullName(selectedStudentData);
        }
        return selectedStudent.trim();
    }, [selectedStudentData, selectedStudent]);

    const borrowPreview = useMemo(() => {
        if (!currentBook || !selectedStudentFullName) {
            return null;
        }

        const selection = evaluateBorrowSelection({
            booksToBorrow: [currentBook],
            loans,
            studentFullName: selectedStudentFullName,
            studentData: selectedStudentData,
        });

        const limitInfo = evaluateBorrowLimit({
            studentFullName: selectedStudentFullName,
            studentData: selectedStudentData,
            loans,
            books,
            booksToBorrowCount: selection.availableBooks.length,
            maxBorrowLimit,
        });

        const remainingSlots = Math.max(maxBorrowLimit - limitInfo.activeLoanCount, 0);

        return {
            selection,
            limitInfo,
            remainingSlots,
        };
    }, [currentBook, selectedStudentFullName, selectedStudentData, loans, books, maxBorrowLimit]);

    const bookHistoryEntries = bookHistory?.entries ?? [];

    const completedBookDurations = useMemo(() => {
        return bookHistoryEntries
            .filter((entry) => {
                const status = entry.status?.toUpperCase() ?? "";
                return status === "RETURNED" && (typeof entry.durationDays === "number" || (entry.borrowedAt && entry.returnedAt));
            })
            .map(
                (entry) =>
                    entry.durationDays ??
                    calculateDurationInDays(entry.borrowedAt, entry.returnedAt)
            )
            .filter(
                (value): value is number =>
                    typeof value === "number" && !Number.isNaN(value)
            );
    }, [bookHistoryEntries]);
    const averageBookReadingDays = useMemo(() => {
        if (!completedBookDurations.length) {
            return null;
        }
        const total = completedBookDurations.reduce((sum, day) => sum + day, 0);
        return Math.round(total / completedBookDurations.length);
    }, [completedBookDurations]);
    const totalBookLateDays = useMemo(
        () => bookHistoryEntries.reduce((sum, entry) => sum + (entry.lateDays ?? 0), 0),
        [bookHistoryEntries]
    );
    const lastBookActivityDate = useMemo<Date | null>(() => {
        if (!bookHistoryEntries.length) {
            return null;
        }
        let latest: Date | null = null;
        bookHistoryEntries.forEach((entry) => {
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
    }, [bookHistoryEntries]);
    const bookCompletionRate = useMemo(() => {
        if (!bookHistory) {
            return null;
        }
        const borrowed = bookHistory.totalBorrowed ?? 0;
        if (!borrowed) {
            return null;
        }
        const returned = bookHistory.totalReturned ?? 0;
        return Math.round((returned / borrowed) * 100);
    }, [bookHistory]);
    const hasBookHistoryData = bookHistory
        ? (bookHistory.totalBorrowed ?? 0) > 0 || bookHistoryEntries.length > 0
        : false;
    const shouldRenderBookHistorySection = bookHistoryLoading || bookHistoryError || hasBookHistoryData;

    const renderBookHistoryRow = (entry: BookHistoryEntry, idx: number, totalCount: number) => {
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

        // Duration calculation helper
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

        const borrowerLabel = entry.studentNumber ? `${entry.borrower} • #${entry.studentNumber}` : entry.borrower || "Bilinmiyor";

        return (
            <tr
                key={`${entry.borrower}-${entry.borrowedAt}-${entry.status}-${idx}`}
                style={{
                    borderBottom: idx === totalCount - 1 ? "none" : "1px solid #f1f5f9",
                    backgroundColor: idx % 2 === 0 ? "#ffffff" : "#fcfcfc"
                }}
            >
                <td style={{ padding: "14px 12px" }}>
                    <div style={{ fontWeight: 600, color: "#1e293b", fontSize: "13px" }}>{entry.borrower}</div>
                    {entry.studentNumber && <div style={{ fontSize: "11px", color: "#94a3b8" }}>#{entry.studentNumber}</div>}
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
    };
    const bookHistorySummaryCards = useMemo(() => {
        if (!bookHistory) {
            return [];
        }
        return [
            {
                key: "completion",
                label: "Tamamlama Oranı",
                value: bookCompletionRate !== null ? `%${bookCompletionRate}` : "—",
                subLabel: `${bookHistory.totalReturned ?? 0}/${bookHistory.totalBorrowed ?? 0} teslim`,
                accent: "#10b981",
            },
            {
                key: "avg",
                label: "Ortalama Okuma",
                value: averageBookReadingDays !== null ? `${averageBookReadingDays} gün` : "—",
                subLabel: completedBookDurations.length > 0 ? `${completedBookDurations.length} tamamlanan` : undefined,
                accent: "#6366f1",
            },
            {
                key: "late-count",
                label: "Gecikme Sayısı",
                value: `${bookHistory.lateReturns ?? 0}`,
                subLabel: "Toplam Gecikme",
                accent: "#ef4444",
            },
            {
                key: "last-activity",
                label: "Son Aktivite",
                value: lastBookActivityDate ? lastBookActivityDate.toLocaleDateString("tr-TR") : "—",
                subLabel: lastBookActivityDate
                    ? lastBookActivityDate.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
                    : undefined,
                accent: "#475569",
            },
        ];
    }, [
        bookHistory,
        bookCompletionRate,
        averageBookReadingDays,
        completedBookDurations.length,
        totalBookLateDays,
        lastBookActivityDate,
    ]);

    // İstatistikleri yeniden yüklemek için kullanılacak fonksiyon
    const refreshBookHistory = async () => {
        if (!book?.id) {
            setBookHistory(null);
            setBookHistoryError(null);
            setBookHistoryLoading(false);
            return;
        }

        setBookHistoryLoading(true);
        setBookHistoryError(null);

        try {
            const response = await httpClient.get<BookHistoryResponse>("/statistics/book-history", { bookId: book.id });
            setBookHistory(response);
        } catch (error) {
            setBookHistory(null);
            setBookHistoryError(error instanceof Error ? error.message : "Kitap geçmişi yüklenemedi");
        } finally {
            setBookHistoryLoading(false);
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
            }
        };
        loadSystemSettings();
    }, []);

    // book prop'u değiştiğinde currentBook'u güncelle
    useEffect(() => {
        setCurrentBook(book);
    }, [book]);

    // Kitap ID'si değiştiğinde istatistikleri yükle
    useEffect(() => {
        refreshBookHistory();
    }, [book?.id]);



    if (!book || !currentBook) return null;

    const filteredStudents = students.filter(s =>
        !studentSearchTerm ||
        searchIncludes(s.name, studentSearchTerm) ||
        searchIncludes(s.surname, studentSearchTerm) ||
        searchIncludes(`${s.name} ${s.surname}`.trim(), studentSearchTerm) ||
        searchIncludes(s.studentNumber, studentSearchTerm) ||
        searchIncludes(s.class, studentSearchTerm) ||
        searchIncludes(s.branch, studentSearchTerm)
    );

    // currentBook kullanarak render yap
    const displayBook = currentBook;
    const getConditionCounts = (book: Book): ConditionCounts => {
        const total = book.totalQuantity ?? Math.max(book.quantity ?? 0, 0);
        const defaults: ConditionCounts = {
            healthy: book.healthyCount ?? Math.max(total - (book.damagedCount ?? 0) - (book.lostCount ?? 0), 0),
            damaged: book.damagedCount ?? 0,
            lost: book.lostCount ?? 0,
        };
        return normalizeConditionCounts(total, defaults);
    };
    const conditionCounts = getConditionCounts(displayBook);
    const healthyCount = conditionCounts.healthy;
    const damagedCount = conditionCounts.damaged;
    const lostCount = conditionCounts.lost;
    const conditionTotal = healthyCount + damagedCount + lostCount;
    const isStockAvailable = (displayBook.quantity ?? 0) > 0;
    const isBorrowable = isStockAvailable && healthyCount > 0;
    const isBorrowActionDisabled = loading || !selectedStudent || !isBorrowable;

    // Öğrencinin zaten aldığı kitapları filtrele ve sadece sağlam kitapları döndür
    const getAvailableBooks = (booksToCheck: Book[], studentName: string): Book[] => {
        const isBorrowable = (book: Book) => book.quantity > 0 && (book.healthyCount ?? 0) > 0;
        if (!studentName) return booksToCheck.filter(isBorrowable);
        return booksToCheck.filter(book => {
            const alreadyBorrowed = loans.some(loan => loan.bookId === book.id && loan.borrower === studentName);
            return !alreadyBorrowed && isBorrowable(book);
        });
    };

    const openInfoCard = (title: string, message: string, type: "info" | "success" | "warning" | "error" = "info", icon?: string) => {
        setInfoCardData({ title, message, type, icon });
        setShowInfoCard(true);
    };

    const requestConfirm = (data: {
        title: string;
        message: string;
        icon?: string;
        confirmText?: string;
        confirmButtonColor?: string;
        onConfirm: () => void | Promise<void>;
    }) => {
        setConfirmDialog(data);
    };

    const executeBorrow = async (booksToBorrow: Book[], studentData: StudentStat) => {
        setLoading(true);
        setError(null);
        try {
            const studentFullName = formatStudentFullName(studentData);
            if (!studentFullName) {
                openInfoCard("Hata", "Öğrenci adı boş olamaz. Lütfen geçerli bir öğrenci seçin.", "error", "❌");
                return;
            }
            const selection = evaluateBorrowSelection({
                booksToBorrow,
                loans,
                studentFullName,
                studentData,
            });
            const availableBooks = selection.availableBooks;

            if (availableBooks.length === 0) {
                setError("Seçilen kitapların hepsi öğrenci tarafından zaten ödünç alınmış!");
                setLoading(false);
                return;
            }

            // Sadece verilebilecek kitapları ödünç ver
            // Bildirimler App.tsx'te veri değişikliklerinden otomatik olarak gönderilecek
            let updatedBook: Book | null = null;
            for (const book of availableBooks) {
                updatedBook = await httpClient.post<Book>(`/books/${book.id}/borrow`, {
                    borrower: studentFullName,
                    days,
                    personelName,
                });
            }

            if (updatedBook) {
                setCurrentBook(updatedBook);
            }
            // Başarılı olduğunda seçimleri temizle
            setShowBorrowModal(false);
            setShowConfirmModal(false);
            setPendingBorrow(null);
            setSelectedStudent("");
            setStudentSearchTerm("");
            setDays(14);
            if (onRefresh) await onRefresh();
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Ödünç verme başarısız oldu";
            setError(errorMessage);

            // Eğer cezalı öğrenci hatası ise, öğrenci bilgisini al ve modal için hazırla
            if (errorMessage.includes("cezalı") || errorMessage.includes("Ceza Puanı") || errorMessage.includes("cezalı durumda")) {
                const student = students.find(s =>
                    s.name === studentData.name && s.surname === studentData.surname
                );
                if (student) {
                    setPenaltyStudent(student);
                } else {
                    // Hata mesajından ceza puanını parse et: "Bu öğrenci cezalı durumda (Ceza Puanı: 50). Kitap ödünç alamaz."
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

    const handleBorrow = async () => {
        if (!selectedStudent || !currentBook) {
            setError("Lütfen bir öğrenci seçin");
            return;
        }

        const selectedStudentData = students.find((s) =>
            formatStudentFullName(s) === selectedStudent ||
            s.name === selectedStudent ||
            s.surname === selectedStudent ||
            (s.studentNumber && `${s.studentNumber}` === selectedStudent)
        );
        if (!selectedStudentData) {
            setError("Geçerli bir öğrenci seçin");
            return;
        }

        if (!isStockAvailable) {
            setError("Mevcut adet 0 olduğu için ödünç verilemez");
            return;
        }

        if (healthyCount <= 0) {
            setError("Sağlam kitap adedi mevcut değil");
            return;
        }

        const studentFullName = formatStudentFullName(selectedStudentData);
        if (!studentFullName) {
            setError("Geçerli bir öğrenci seçin");
            return;
        }

        // Öğrencinin zaten aldığı kitapları filtrele (isim eşleşmeleri için ortak util)
        const selection = evaluateBorrowSelection({
            booksToBorrow: [currentBook],
            loans,
            studentFullName,
            studentData: selectedStudentData,
        });
        const availableBooks = selection.availableBooks;

        if (availableBooks.length === 0) {
            setError("Bu kitap öğrenci tarafından zaten ödünç alınmış!");
            return;
        }

        const limitInfo = evaluateBorrowLimit({
            studentFullName,
            studentData: selectedStudentData,
            loans,
            books,
            booksToBorrowCount: availableBooks.length,
            maxBorrowLimit,
        });

        // Sistem ayarlarından kitap alma sınırını kontrol et
        if (limitInfo.exceedsLimit) {
            setPendingBorrow({ books: availableBooks, student: studentFullName });
            setShowBorrowModal(false);
            setShowConfirmModal(true);
            return;
        }

        // Sınır içindeyse direkt ödünç ver
        await executeBorrow(availableBooks, selectedStudentData);
    };

    const confirmBorrowAfterLimit = async () => {
        if (!pendingBorrow) return;
        const studentData = students.find((s) =>
            s.name === pendingBorrow.student ||
            `${s.name} ${s.surname}`.trim() === pendingBorrow.student ||
            s.surname === pendingBorrow.student
        );
        if (!studentData) return;
        setShowConfirmModal(false);
        await executeBorrow(pendingBorrow.books, studentData);
    };

    const handleConditionUpdate = async (type: "healthy" | "damaged" | "lost", delta: 1 | -1) => {
        if (!currentBook || isReadOnly) {
            return;
        }

        const totalQuantity = currentBook.totalQuantity ?? currentBook.quantity ?? 0;
        const result = tryAdjustConditionCounts(totalQuantity, conditionCounts, type, delta);
        if (!result.changed) {
            setConditionError("Bu işlem mevcut stok sınırları nedeniyle uygulanamadı.");
            return;
        }

        setConditionUpdating(true);
        setConditionError(null);
        try {
            const updatedBook = await httpClient.put<Book>(`/books/${currentBook.id}`, {
                title: currentBook.title,
                author: currentBook.author,
                category: currentBook.category,
                totalQuantity,
                healthyCount: result.counts.healthy,
                damagedCount: result.counts.damaged,
                lostCount: result.counts.lost,
                personelName: personelName || "Bilinmiyor",
            });
            setCurrentBook(updatedBook);
            if (onRefresh) {
                await onRefresh();
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Kitap durumu güncellenemedi";
            setConditionError(message);
            console.error("Kitap durumu güncelleme hatası:", err);
        } finally {
            setConditionUpdating(false);
        }
    };

    const handleReturn = async (borrower: string) => {
        if (!currentBook) return;

        // personelName kontrolü
        if (!personelName || personelName.trim() === "") {
            openInfoCard("Hata", "Personel adı gereklidir. Lütfen giriş yapın veya personel adınızı girin.", "error", "❌");
            return;
        }

        requestConfirm({
            title: "Teslim Alma Onayı",
            icon: "⚠️",
            confirmText: "Teslim Al",
            confirmButtonColor: "#10b981",
            message: `${borrower} adlı öğrencinin kitabını teslim almak istediğinize emin misiniz?\n\nKitap: ${currentBook.title}`,
            onConfirm: async () => {
                setLoading(true);
                setError(null);
                try {
                    const updatedBook = await httpClient.post<Book>(`/books/${currentBook.id}/return`, {
                        borrower,
                        personelName: personelName.trim(),
                    });
                    setCurrentBook(updatedBook);
                    openInfoCard("Başarılı", "Kitap teslim alındı.", "success", "✅");
                    setShowReturnModal(false);
                    setSelectedLoan(null);
                    if (onRefresh) await onRefresh();
                    // İstatistikleri yenile
                    await refreshBookHistory();
                } catch (err) {
                    const errorMessage = err instanceof Error ? err.message : "Teslim alma başarısız oldu";
                    openInfoCard("Hata", errorMessage, "error", "❌");
                    console.error("Teslim alma hatası:", err);
                } finally {
                    setLoading(false);
                }
            },
        });
    };

    const handleExtendLoan = async () => {
        if (!selectedLoanForAction || !currentBook) {
            return;
        }

        if (!personelName || personelName.trim() === "") {
            setActionModalError("Personel adı gereklidir. Lütfen giriş yapın veya personel adınızı girin.");
            return;
        }

        setLoading(true);
        setActionModalError(null);
        try {
            const borrower = selectedLoanForAction.borrower;
            const trimmedpersonel = personelName.trim();

            // Önce mevcut ödünç kaydını teslim al
            await httpClient.post<Book>(`/books/${currentBook.id}/return`, {
                borrower,
                personelName: trimmedpersonel,
            });

            // Kalan gün + uzatma gününü kullanarak yeniden ödünç ver
            // DÜZELTME: getDaysDiff kullanarak tutarlı hesaplama
            const remainingDays = Math.max(0, getDaysDiff(selectedLoanForAction.dueDate));
            const totalDays = Math.max(extendDays + remainingDays, extendDays);

            // Bildirimler App.tsx'te veri değişikliklerinden otomatik olarak gönderilecek
            const updatedBook = await httpClient.post<Book>(`/books/${currentBook.id}/borrow`, {
                borrower,
                days: totalDays,
                personelName: trimmedpersonel,
            });

            setCurrentBook(updatedBook);
            setShowActionModal(false);
            setSelectedLoanForAction(null);
            if (onRefresh) {
                await onRefresh();
            }
            // İstatistikleri yenile
            await refreshBookHistory();
        } catch (err) {
            setActionModalError(err instanceof Error ? err.message : "Süre uzatılamadı");
        } finally {
            setLoading(false);
        }
    };

    const handleReturnFromActionModal = async () => {
        if (!selectedLoanForAction) {
            return;
        }
        setShowActionModal(false);
        setSelectedLoanForAction(null);
        handleReturn(selectedLoanForAction.borrower);
    };

    return (
        <>
            <div
                className="card"
                style={{
                    maxWidth: "900px",
                    width: "90%",
                    maxHeight: "90vh",
                    overflowY: "auto",
                    position: "relative",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Genel Onay / Bilgi Kartları */}
                <ConfirmCard
                    isOpen={!!confirmDialog}
                    title={confirmDialog?.title || "Onay"}
                    icon={confirmDialog?.icon || "⚠️"}
                    onConfirm={async () => {
                        if (!confirmDialog) return;
                        setConfirmDialogLoading(true);
                        try {
                            await confirmDialog.onConfirm();
                        } finally {
                            setConfirmDialogLoading(false);
                            setConfirmDialog(null);
                        }
                    }}
                    onCancel={() => {
                        if (confirmDialogLoading) return;
                        setConfirmDialog(null);
                    }}
                    confirmText={confirmDialog?.confirmText || "Onayla"}
                    cancelText="İptal"
                    confirmButtonColor={confirmDialog?.confirmButtonColor || "#ef4444"}
                    loading={confirmDialogLoading}
                >
                    <div style={{ fontSize: "14px", color: "#475569", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>
                        {confirmDialog?.message || ""}
                    </div>
                </ConfirmCard>

                <InfoCard
                    isOpen={showInfoCard}
                    title={infoCardData?.title || "Bilgi"}
                    icon={infoCardData?.icon}
                    type={infoCardData?.type || "info"}
                    onClose={() => {
                        setShowInfoCard(false);
                        setInfoCardData(null);
                    }}
                >
                    <div style={{ fontSize: "14px", color: "#475569", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>
                        {infoCardData?.message || ""}
                    </div>
                </InfoCard>

                <div style={{ marginBottom: "24px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px", gap: "12px" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <h2 style={{ margin: 0, color: "#0f172a", fontWeight: 700, wordBreak: "break-word" }}>{displayBook.title}</h2>
                        </div>
                        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                            {onEdit && !isReadOnly && (
                                <button
                                    onClick={() => {
                                        onEdit(currentBook!);
                                        onClose();
                                    }}
                                    style={{
                                        padding: "8px 16px",
                                        fontSize: "14px",
                                        backgroundColor: "#3b82f6",
                                        color: "white",
                                        border: "none",
                                        borderRadius: "6px",
                                        cursor: "pointer",
                                        fontWeight: 600,
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "6px", verticalAlign: "middle" }}>
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                    </svg>
                                    Kitap Düzenle
                                </button>
                            )}
                            <button
                                onClick={onClose}
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
                                    flexShrink: 0,
                                }}
                            >
                                ×
                            </button>
                        </div>
                    </div>
                </div>

                <div style={{ display: "grid", gap: "20px" }}>
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
                                <span style={{ fontWeight: 600, fontSize: "14px", color: displayBook.author ? "#1e293b" : "#94a3b8", textAlign: "right" }}>
                                    {displayBook.author || "-"}
                                </span>
                            </div>

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                <span style={{ color: "#0f172a", fontSize: "14px", fontWeight: 600 }}>Kategori:</span>
                                <span style={{ fontWeight: 600, fontSize: "14px", color: displayBook.category ? "#4338ca" : "#64748b", textAlign: "right" }}>
                                    {displayBook.category ? (
                                        <span style={{
                                            backgroundColor: "#e0e7ff",
                                            color: "#4338ca",
                                            padding: "2px 8px",
                                            borderRadius: "8px",
                                            fontSize: "12px",
                                            fontWeight: 500,
                                        }}>
                                            {displayBook.category}
                                        </span>
                                    ) : "-"}
                                </span>
                            </div>

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                <span style={{ color: "#0f172a", fontSize: "14px", fontWeight: 600 }}>Ödünçte:</span>
                                <span style={{ fontWeight: 600, fontSize: "14px", color: displayBook.loans.length > 0 ? "#ef4444" : "#10b981", textAlign: "right" }}>
                                    {displayBook.loans.length} adet
                                </span>
                            </div>

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                <span style={{ color: "#0f172a", fontSize: "14px", fontWeight: 600 }}>Raf Numarası:</span>
                                <span style={{ fontWeight: 600, fontSize: "14px", color: displayBook.shelf ? "#3b82f6" : "#94a3b8", textAlign: "right" }}>
                                    {displayBook.shelf || "-"}
                                </span>
                            </div>

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                <span style={{ color: "#0f172a", fontSize: "14px", fontWeight: 600 }}>Yayınevi:</span>
                                <span style={{ fontWeight: 600, fontSize: "14px", color: displayBook.publisher ? "#0f172a" : "#64748b", textAlign: "right" }}>
                                    {displayBook.publisher || "-"}
                                </span>
                            </div>

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                <span style={{ color: "#0f172a", fontSize: "14px", fontWeight: 600 }}>Yayın Yılı:</span>
                                <span style={{ fontWeight: 600, fontSize: "14px", color: displayBook.year ? "#0f172a" : "#64748b", textAlign: "right" }}>
                                    {displayBook.year || "-"}
                                </span>
                            </div>

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                <span style={{ color: "#0f172a", fontSize: "14px", fontWeight: 600 }}>Sayfa Sayısı:</span>
                                <span style={{ fontWeight: 600, fontSize: "14px", color: displayBook.pageCount ? "#0f172a" : "#64748b", textAlign: "right" }}>
                                    {displayBook.pageCount ? `${displayBook.pageCount} sayfa` : "-"}
                                </span>
                            </div>

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                <span style={{ color: "#0f172a", fontSize: "14px", fontWeight: 600 }}>Kitap Numarası:</span>
                                <span style={{ fontWeight: 600, fontSize: "14px", color: displayBook.bookNumber ? "#0f172a" : "#64748b", textAlign: "right" }}>
                                    {displayBook.bookNumber ? `#${displayBook.bookNumber}` : "-"}
                                </span>
                            </div>

                            <div style={{ marginTop: "8px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
                                <strong style={{ color: "#0f172a", fontSize: "14px", fontWeight: 700, display: "block", marginBottom: "8px" }}>Özet:</strong>
                                <p style={{ margin: 0, fontSize: "14px", lineHeight: "1.6", color: displayBook.summary ? "#0f172a" : "#64748b" }}>
                                    {displayBook.summary || "-"}
                                </p>
                            </div>

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
                                    Toplam fiziksel stok: <strong>{conditionTotal}</strong> / {displayBook.totalQuantity}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Kitap İstatistikleri */}
                    <div style={{ padding: "16px", backgroundColor: "#ffffff", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "16px", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)" }}>
                        <h3 style={{ marginTop: 0, marginBottom: "12px", fontSize: "16px", fontWeight: 600, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="20" x2="18" y2="10"></line>
                                <line x1="12" y1="20" x2="12" y2="4"></line>
                                <line x1="6" y1="20" x2="6" y2="14"></line>
                            </svg>
                            Kitap İstatistikleri
                        </h3>
                        {(() => {
                            const currentQuantity = displayBook.quantity || 0;
                            const activeBorrowedCount = displayBook.loans.length || 0;

                            // Aktif ödünçlerden geciken sayısı
                            const activeLateCount = displayBook.loans.filter(l => {
                                const dueDate = new Date(l.dueDate);
                                dueDate.setHours(0, 0, 0, 0);
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                // Gecikenler: teslim tarihi bugünden önce
                                return dueDate.getTime() < today.getTime();
                            }).length;

                            // Toplam Adet = Mevcut Adet + Aktif ödünç (gecikenler dahil)
                            // Eğer backend'den totalQuantity geliyorsa onu kullan, yoksa hesapla
                            const totalQuantity = displayBook.totalQuantity > 0
                                ? displayBook.totalQuantity
                                : currentQuantity + activeBorrowedCount;

                            return (
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
                            );
                        })()}
                    </div>

                    {displayBook.loans.length > 0 && (
                        <div>
                            <strong style={{ color: "#64748b", fontSize: "14px", display: "block", marginBottom: "8px" }}>Aktif Ödünçler</strong>
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                {displayBook.loans.map((loan, index) => {
                                    // DÜZELTME: getDaysDiff kullanarak tutarlı hesaplama
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
                                                if (student) {
                                                    setSelectedStudentDetail(student);
                                                }
                                            }}
                                            style={{
                                                padding: "12px",
                                                backgroundColor: "#f8fafc",
                                                borderRadius: "8px",
                                                border: "1px solid #e2e8f0",
                                                cursor: student ? "pointer" : "default",
                                                transition: "all 0.2s",
                                            }}
                                            onMouseEnter={(e) => {
                                                if (student) {
                                                    e.currentTarget.style.backgroundColor = "#f0f9ff";
                                                    e.currentTarget.style.borderColor = "#3b82f6";
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                if (student) {
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
                                                                borderRadius: "999px",
                                                                fontSize: "11px",
                                                                fontWeight: 700,
                                                                backgroundColor: "#fee2e2",
                                                                color: "#991b1b",
                                                                border: "1px solid #fecaca",
                                                            }}>
                                                                Silinmiş öğrenci
                                                            </span>
                                                        )}
                                                    </div>
                                                    {student && (
                                                        <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "8px" }}>
                                                            <div style={{ fontSize: "13px", color: "#64748b" }}>
                                                                <strong>Sınıf/Şube:</strong> {student.class ? `${student.class}` : "—"}{student.branch ? `/${student.branch}` : ""}
                                                            </div>
                                                            {student.studentNumber && (
                                                                <div style={{ fontSize: "13px", color: "#64748b" }}>
                                                                    <strong>Numara:</strong> {student.studentNumber}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                    <div style={{ fontSize: "12px", color: "#64748b" }}>
                                                        Teslim: {new Date(loan.dueDate).toLocaleDateString("tr-TR")}
                                                    </div>
                                                </div>
                                                <div style={{ display: "flex", alignItems: "center", gap: "12px" }} onClick={(e) => e.stopPropagation()}>
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
                                                    {!isReadOnly && (
                                                        <button
                                                            onClick={() => handleReturn(loan.borrower)}
                                                            disabled={loading}
                                                            style={{
                                                                padding: "6px 16px",
                                                                fontSize: "12px",
                                                                backgroundColor: loading ? "#9ca3af" : "#10b981",
                                                                color: "white",
                                                                border: "none",
                                                                borderRadius: "6px",
                                                                cursor: loading ? "not-allowed" : "pointer",
                                                                fontWeight: 600,
                                                                whiteSpace: "nowrap",
                                                            }}
                                                        >
                                                            {loading ? "İşleniyor..." : (
                                                                <>
                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "6px", verticalAlign: "middle" }}>
                                                                        <polyline points="20 6 9 17 4 12"></polyline>
                                                                    </svg>
                                                                    Teslim Al
                                                                </>
                                                            )}
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

                    {shouldRenderBookHistorySection && (
                        <div
                            style={{
                                border: `1px solid ${isBookHistoryExpanded ? "#3b82f6" : "#e2e8f0"}`,
                                borderRadius: "14px",
                                backgroundColor: isBookHistoryExpanded ? "#f0f4ff" : "#ffffff",
                                boxShadow: isBookHistoryExpanded ? "0 12px 30px rgba(59,130,246,0.12)" : "0 1px 3px rgba(0,0,0,0.05)",
                                transition: "all 0.25s ease",
                                marginTop: "16px",
                                overflow: "hidden"
                            }}
                        >
                            <div
                                onClick={() => setIsBookHistoryExpanded(!isBookHistoryExpanded)}
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
                                            backgroundColor: isBookHistoryExpanded ? "#dbeafe" : "#f1f5f9",
                                            color: isBookHistoryExpanded ? "#2563eb" : "#64748b",
                                            transition: "all 0.2s"
                                        }}
                                    >
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                                            <path d="M9 9l3 3 3-3"></path>
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: isBookHistoryExpanded ? "#1e293b" : "#334155" }}>
                                            Kitap Geçmişi ve İstatistikler
                                        </h3>
                                        {bookHistoryEntries.length > 0 && (
                                            <div style={{ fontSize: "13px", color: isBookHistoryExpanded ? "#3b82f6" : "#64748b", marginTop: "2px" }}>
                                                {bookHistoryEntries.length} kayıt bulundu
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                                    {!isBookHistoryExpanded && bookHistory && (
                                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                            <div style={{ padding: "6px 14px", borderRadius: "99px", backgroundColor: "#f1f5f9", fontSize: "12px", fontWeight: 600, color: "#475569" }}>
                                                Toplam: {bookHistory.totalBorrowed ?? 0}
                                            </div>
                                            {(bookHistory.activeLoans ?? 0) > 0 && (
                                                <div style={{ padding: "6px 14px", borderRadius: "99px", backgroundColor: "#dbeafe", fontSize: "12px", fontWeight: 600, color: "#3b82f6" }}>
                                                    {bookHistory.activeLoans} Aktif
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
                                            backgroundColor: isBookHistoryExpanded ? "#ffffff" : "#f8fafc",
                                            border: "1px solid",
                                            borderColor: isBookHistoryExpanded ? "#bfdbfe" : "#e2e8f0",
                                            color: isBookHistoryExpanded ? "#3b82f6" : "#94a3b8",
                                            transform: isBookHistoryExpanded ? "rotate(180deg)" : "rotate(0deg)",
                                            transition: "all 0.3s ease"
                                        }}
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="6 9 12 15 18 9"></polyline>
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            {isBookHistoryExpanded && (
                                <div style={{ borderTop: "1px solid #dbeafe", padding: "24px", animation: "slideDown 0.3s ease-out" }}>
                                    {bookHistoryLoading ? (
                                        <p style={{ margin: 0, color: "#475569" }}>Geçmiş istatistikler yükleniyor...</p>
                                    ) : bookHistoryError ? (
                                        <p style={{ margin: 0, color: "#dc2626" }}>{bookHistoryError}</p>
                                    ) : bookHistory && hasBookHistoryData ? (
                                        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                            {/* Yeni Stil Kartlar - StudentDetailCard ile aynı */}
                                            {bookHistorySummaryCards.length > 0 && (
                                                <div style={{ marginBottom: "24px" }}>
                                                    <h4 style={{ margin: "0 0 16px 0", fontSize: "14px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                                        Performans Özeti
                                                    </h4>
                                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                                                        {bookHistorySummaryCards.map((card) => (
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
                                                                {card.subLabel && <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>{card.subLabel}</div>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {bookHistoryEntries.length > 0 ? (
                                                <div>
                                                    <h4 style={{ margin: "0 0 16px 0", fontSize: "14px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                                        Ödünç Geçmişi Listesi
                                                    </h4>
                                                    <div style={{ overflowX: "auto", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                                                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                                            <thead>
                                                                <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                                                                    {["ÖĞRENCİ", "DURUM", "ALIŞ T.", "İADE T.", "G. PLANI", "SÜRE"].map((header) => (
                                                                        <th key={header} style={{ padding: "14px 12px", textAlign: "left", fontSize: "12px", color: "#64748b", fontWeight: 700, whiteSpace: "nowrap" }}>
                                                                            {header}
                                                                        </th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {bookHistoryEntries.map((entry, idx) => renderBookHistoryRow(entry, idx, bookHistoryEntries.length))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p style={{ margin: 0, color: "#475569" }}>Bu kitap için geçmiş kaydı bulunamadı.</p>
                                            )}
                                        </div>
                                    ) : (
                                        <p style={{ margin: 0, color: "#475569" }}>Bu kitap için geçmiş kaydı bulunamadı.</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* İşlem Butonları - Sadece personel/admin için */}
                    {!isReadOnly && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "24px", paddingTop: "24px", borderTop: "1px solid #e2e8f0" }}>
                            <button
                                onClick={() => {
                                    if (!isBorrowable) return;
                                    setShowBorrowModal(true);
                                }}
                                disabled={!isBorrowable}
                                style={{
                                    flex: 1,
                                    padding: "12px 24px",
                                    backgroundColor: !isBorrowable ? "#94a3b8" : "#3b82f6",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "8px",
                                    cursor: !isBorrowable ? "not-allowed" : "pointer",
                                    fontWeight: 600,
                                    fontSize: "14px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: "6px",
                                    opacity: !isBorrowable ? 0.85 : 1,
                                }}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                                    <path d="M9 9l3 3 3-3"></path>
                                </svg>
                                Ödünç Ver
                            </button>
                            {!isBorrowable && (
                                <div style={{ fontSize: "12px", color: "#b91c1c", fontWeight: 600 }}>
                                    Mevcut adet 0 veya sağlam kopya bulunmadığı için ödünç verilemez.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Ödünç Verme Modal - Sadece personel/admin için */}
            {!isReadOnly && showBorrowModal && (
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
                        zIndex: 51000,
                    }}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setShowBorrowModal(false);
                            setError(null);
                            setSelectedStudent("");
                            setStudentSearchTerm("");
                        }
                    }}
                >
                    <div
                        className="card"
                        style={{
                            maxWidth: "500px",
                            width: "90%",
                            maxHeight: "90vh",
                            overflow: "auto",
                            backgroundColor: "white",
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 style={{ marginTop: 0 }}>Kitap Ödünç Ver</h3>
                        {error && (
                            <div style={{ padding: "12px", backgroundColor: "#fee2e2", color: "#dc2626", borderRadius: "8px", marginBottom: "16px" }}>
                                {error}
                            </div>
                        )}

                        <div style={{ marginBottom: "16px" }}>
                            <label style={{ display: "block", marginBottom: "8px", fontWeight: 600 }}>Öğrenci Seç</label>
                            <input
                                type="text"
                                placeholder="Öğrenci ara..."
                                value={studentSearchTerm}
                                onChange={(e) => setStudentSearchTerm(e.target.value)}
                                style={{
                                    width: "100%",
                                    padding: "10px",
                                    borderRadius: "6px",
                                    border: "1px solid #e5e7eb",
                                    marginBottom: "8px",
                                }}
                            />
                            {studentSearchTerm && !selectedStudent && (
                                <div style={{
                                    border: "1px solid #e5e7eb",
                                    borderRadius: "6px",
                                    maxHeight: "200px",
                                    overflowY: "auto",
                                    backgroundColor: "white",
                                }}>
                                    {filteredStudents.length > 0 ? (
                                        filteredStudents.map((student) => {
                                            const studentFullName = formatStudentFullName(student);

                                            // Öğrencinin aktif ödünçlerini hesapla
                                            const studentValidLoans = loans.filter(l =>
                                                (l.borrower === studentFullName || l.borrower === student.name) &&
                                                books.some(b => b.id === l.bookId)
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
                                                            <span style={{
                                                                color: (() => {
                                                                    const lateCount = calculateDynamicLateCount(studentFullName, loans, books);
                                                                    return lateCount > 0 ? "#ef4444" : "#10b981";
                                                                })(), fontWeight: 600
                                                            }}>
                                                                {calculateDynamicLateCount(studentFullName, loans, books)}
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
                                        const normalizedCounters = normalizeStudentCounters(
                                            studentData,
                                            studentValidLoans.length,
                                        );
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
                                                        <span style={{
                                                            color: (() => {
                                                                const lateCount = calculateDynamicLateCount(selectedStudent, loans, books);
                                                                return lateCount > 0 ? "#ef4444" : "#10b981";
                                                            })(), fontWeight: 600
                                                        }}>
                                                            {calculateDynamicLateCount(selectedStudent, loans, books)}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: "14px" }}>
                                                        <strong>Aktif Ödünç:</strong>{" "}
                                                        {(() => {
                                                            // Aktif ödünç sayısını loans array'inden hesapla ve silinmiş kitapları filtrele
                                                            const activeLoansCount = studentValidLoans.length;
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
                                                    const lateCount = calculateDynamicLateCount(selectedStudent, loans, books);
                                                    return lateCount > 0;
                                                })() && (
                                                        <div style={{
                                                            padding: "8px",
                                                            backgroundColor: "#fee2e2",
                                                            borderRadius: "6px",
                                                            color: "#dc2626",
                                                            fontSize: "13px",
                                                            fontWeight: 600,
                                                        }}>
                                                            ⚠️ Bu öğrencinin {calculateDynamicLateCount(selectedStudent, loans, books)} geciken kitabı var!
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
                        {selectedStudentFullName && (
                            <div style={{ marginBottom: "16px" }}>
                                {(() => {
                                    if (!borrowPreview) {
                                        return (
                                            <div
                                                style={{
                                                    padding: "12px",
                                                    borderRadius: "10px",
                                                    backgroundColor: "#f8fafc",
                                                    border: "1px solid #e2e8f0",
                                                    color: "#475569",
                                                    fontSize: "13px",
                                                    fontWeight: 500,
                                                }}
                                            >
                                                Öğrenci limiti bilgisi yüklenemedi. Lütfen tekrar deneyin.
                                            </div>
                                        );
                                    }

                                    const { selection, limitInfo, remainingSlots } = borrowPreview;
                                    const totalAfterBorrow = limitInfo.totalAfterBorrow;
                                    const alreadyBorrowedCount = selection.alreadyBorrowedBooks.length;
                                    const availableCount = selection.availableBooks.length;
                                    const limitExceeded = totalAfterBorrow > maxBorrowLimit && availableCount > 0;
                                    const limitWillBeFull = !limitExceeded && availableCount > 0 && totalAfterBorrow === maxBorrowLimit;
                                    const isNearLimit =
                                        !limitExceeded && !limitWillBeFull && availableCount > 0 && remainingSlots > 0 && remainingSlots <= 2;

                                    const backgroundColor = limitExceeded
                                        ? "#fee2e2"
                                        : limitWillBeFull
                                            ? "#fef3c7"
                                            : isNearLimit
                                                ? "#ecfeff"
                                                : "#f8fafc";
                                    const borderColor = limitExceeded
                                        ? "#fecaca"
                                        : limitWillBeFull
                                            ? "#fde68a"
                                            : isNearLimit
                                                ? "#bae6fd"
                                                : "#e2e8f0";
                                    const textColor = limitExceeded
                                        ? "#b91c1c"
                                        : limitWillBeFull
                                            ? "#92400e"
                                            : isNearLimit
                                                ? "#0369a1"
                                                : "#475569";

                                    return (
                                        <div
                                            style={{
                                                padding: "12px",
                                                borderRadius: "10px",
                                                border: `1px solid ${borderColor}`,
                                                backgroundColor,
                                                color: textColor,
                                                fontSize: "13px",
                                                lineHeight: 1.5,
                                            }}
                                        >
                                            <div style={{ fontWeight: 700, marginBottom: "6px" }}>Kitap Limiti Durumu</div>
                                            <div style={{ marginBottom: "4px" }}>
                                                Aktif Ödünç: <strong>{limitInfo.activeLoanCount}</strong> / {maxBorrowLimit}
                                            </div>
                                            {availableCount > 0 && (
                                                <div style={{ marginBottom: "4px" }}>
                                                    Bu kitap verildiğinde toplam <strong>{totalAfterBorrow}</strong> kitap olacak.
                                                </div>
                                            )}
                                            {alreadyBorrowedCount > 0 && (
                                                <div style={{ marginBottom: "4px", color: "#b45309", fontWeight: 600 }}>
                                                    ⚠️ Bu öğrenci kitabı zaten ödünç almış. Yeniden verilemez.
                                                </div>
                                            )}
                                            {limitExceeded && (
                                                <div style={{ fontWeight: 600 }}>
                                                    ⚠️ Bu işlem limiti <strong>{totalAfterBorrow - maxBorrowLimit} kitap</strong> aşacak. Personel onay kartı
                                                    açılacak.
                                                </div>
                                            )}
                                            {!limitExceeded && limitWillBeFull && (
                                                <div style={{ fontWeight: 600 }}>
                                                    ⚠️ Bu işlem sonrası öğrenci limiti dolduracak. Takip için not almanız önerilir.
                                                </div>
                                            )}
                                            {!limitExceeded && !limitWillBeFull && isNearLimit && (
                                                <div style={{ fontWeight: 600 }}>
                                                    ℹ️ Öğrencinin yalnızca <strong>{remainingSlots}</strong> boş slotu kaldı.
                                                </div>
                                            )}
                                            {!limitExceeded && !limitWillBeFull && !isNearLimit && availableCount > 0 && (
                                                <div style={{ fontWeight: 500, color: "#0369a1" }}>
                                                    Öğrenci limiti uygun. İşlem güvenle yapılabilir.
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        )}
                        <div style={{ marginBottom: "16px" }}>
                            <label style={{ display: "block", marginBottom: "8px", fontWeight: 600 }}>Süre (Gün)</label>
                            <input
                                type="number"
                                value={days}
                                onChange={(e) => setDays(parseInt(e.target.value) || 14)}
                                min="1"
                                max="30"
                                style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #e5e7eb" }}
                            />
                        </div>
                        <div style={{ display: "flex", gap: "12px" }}>
                            <button
                                onClick={handleBorrow}
                                disabled={isBorrowActionDisabled}
                                style={{
                                    flex: 1,
                                    padding: "12px",
                                    backgroundColor: isBorrowActionDisabled ? "#9ca3af" : "#3b82f6",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "6px",
                                    cursor: isBorrowActionDisabled ? "not-allowed" : "pointer",
                                    fontWeight: 600,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: "6px",
                                }}
                            >
                                {loading ? "İşleniyor..." : (
                                    <>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                                            <path d="M9 9l3 3 3-3"></path>
                                        </svg>
                                        Ödünç Ver
                                    </>
                                )}
                            </button>
                            <button
                                onClick={() => {
                                    setShowBorrowModal(false);
                                    setError(null);
                                    setSelectedStudent("");
                                    setStudentSearchTerm("");
                                }}
                                style={{
                                    flex: 1,
                                    padding: "12px",
                                    backgroundColor: "#ef4444",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "6px",
                                    cursor: "pointer",
                                    fontWeight: 600,
                                }}
                            >
                                İptal
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Onay Modalı - kitap limiti aşıldığında */}
            {showConfirmModal && pendingBorrow && createPortal(
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
                            setShowConfirmModal(false);
                            setPendingBorrow(null);
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
                                ⚠️ Kitap Limiti Uyarısı
                            </h2>
                            <button
                                onClick={() => {
                                    setShowConfirmModal(false);
                                    setPendingBorrow(null);
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

                        {(() => {
                            const studentData = students.find((s) =>
                                s.name === pendingBorrow.student ||
                                formatStudentFullName(s) === pendingBorrow.student ||
                                s.surname === pendingBorrow.student
                            );
                            if (!studentData) return null;

                            // Öğrencinin zaten aldığı kitapları filtrele
                            const studentFullName = formatStudentFullName(studentData);
                            const selection = evaluateBorrowSelection({
                                booksToBorrow: pendingBorrow.books,
                                loans,
                                studentFullName,
                                studentData,
                            });
                            const availableBooks = selection.availableBooks;
                            const limitInfo = evaluateBorrowLimit({
                                studentFullName,
                                studentData,
                                loans,
                                books,
                                booksToBorrowCount: availableBooks.length,
                                maxBorrowLimit,
                            });
                            const activeLoans = limitInfo.activeLoanCount;
                            const totalAfterBorrow = limitInfo.totalAfterBorrow;
                            const excess = totalAfterBorrow - maxBorrowLimit;
                            const alreadyBorrowedCount = selection.alreadyBorrowedBooks.length;

                            return (
                                <>
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

                                    <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                                        <button
                                            onClick={() => {
                                                setShowConfirmModal(false);
                                                setPendingBorrow(null);
                                            }}
                                            style={{
                                                padding: "10px 20px",
                                                fontSize: "14px",
                                                backgroundColor: "#f3f4f6",
                                                color: "#374151",
                                                border: "none",
                                                borderRadius: "6px",
                                                cursor: "pointer",
                                                fontWeight: 600,
                                            }}
                                        >
                                            İptal
                                        </button>
                                        <button
                                            onClick={async () => {
                                                if (studentData) {
                                                    await confirmBorrowAfterLimit();
                                                }
                                            }}
                                            disabled={loading || availableBooks.length === 0}
                                            style={{
                                                padding: "10px 20px",
                                                fontSize: "14px",
                                                backgroundColor: loading || availableBooks.length === 0 ? "#94a3b8" : "#ef4444",
                                                color: "white",
                                                border: "none",
                                                borderRadius: "6px",
                                                cursor: loading || availableBooks.length === 0 ? "not-allowed" : "pointer",
                                                fontWeight: 600,
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                gap: "6px",
                                            }}
                                        >
                                            {loading ? "İşleniyor..." : (
                                                <>
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                                                        <path d="M9 9l3 3 3-3"></path>
                                                    </svg>
                                                    Yine de Ödünç Ver ({availableBooks.length} kitap)
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>,
                document.body
            )}

            {/* Teslim Alma Modal - Sadece personel/admin için */}
            {!isReadOnly && showReturnModal && (
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
                        zIndex: 2000,
                    }}
                    onClick={() => {
                        setShowReturnModal(false);
                        setError(null);
                        setSelectedLoan(null);
                    }}
                >
                    <div
                        className="card"
                        style={{
                            maxWidth: "500px",
                            width: "90%",
                            backgroundColor: "white",
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 style={{ marginTop: 0 }}>Kitap Teslim Al</h3>
                        {error && (
                            <div style={{ padding: "12px", backgroundColor: "#fee2e2", color: "#dc2626", borderRadius: "8px", marginBottom: "16px" }}>
                                {error}
                            </div>
                        )}
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            {displayBook.loans.map((loan, index) => {
                                // DÜZELTME: getDaysDiff kullanarak tutarlı hesaplama
                                const diff = getDaysDiff(loan.dueDate);
                                const isLate = diff < 0;
                                const remainingDays = diff;
                                const isWarning = !isLate && remainingDays >= 0 && remainingDays <= 3;
                                const student = students.find(s =>
                                    s.name === loan.borrower ||
                                    `${s.name} ${s.surname}`.trim() === loan.borrower ||
                                    s.surname === loan.borrower
                                );

                                return (
                                    <div
                                        key={index}
                                        onClick={() => {
                                            if (student) {
                                                setSelectedStudentDetail(student);
                                            }
                                        }}
                                        style={{
                                            padding: "16px",
                                            backgroundColor: "#f8fafc",
                                            borderRadius: "8px",
                                            border: "1px solid #e2e8f0",
                                            cursor: student ? "pointer" : "default",
                                            transition: "all 0.2s",
                                        }}
                                        onMouseEnter={(e) => {
                                            if (student) {
                                                e.currentTarget.style.backgroundColor = "#f0f9ff";
                                                e.currentTarget.style.borderColor = "#3b82f6";
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (student) {
                                                e.currentTarget.style.backgroundColor = "#f8fafc";
                                                e.currentTarget.style.borderColor = "#e2e8f0";
                                            }
                                        }}
                                    >
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                                            <div>
                                                <div style={{ fontWeight: 700, marginBottom: "8px", fontSize: "16px", color: "#1e293b" }}>
                                                    {loan.borrower}
                                                </div>
                                                {student && (
                                                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "8px" }}>
                                                        <div style={{ fontSize: "13px", color: "#64748b" }}>
                                                            <strong>Sınıf/Şube:</strong> {student.class ? `${student.class}` : "—"}{student.branch ? `/${student.branch}` : ""}
                                                        </div>
                                                        {student.studentNumber && (
                                                            <div style={{ fontSize: "13px", color: "#64748b" }}>
                                                                <strong>Numara:</strong> {student.studentNumber}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                <div style={{ fontSize: "12px", color: "#64748b" }}>
                                                    Teslim: {new Date(loan.dueDate).toLocaleDateString("tr-TR")}
                                                </div>
                                            </div>
                                            <div style={{
                                                padding: "4px 12px",
                                                borderRadius: "12px",
                                                fontSize: "12px",
                                                fontWeight: 600,
                                                backgroundColor: isLate ? "#fee2e2" : isWarning ? "#fef3c7" : "#d1fae5",
                                                color: isLate ? "#dc2626" : isWarning ? "#d97706" : "#059669",
                                            }}>
                                                {remainingDays === 0 ? "Süresi Doldu" : `${remainingDays} gün kaldı`}
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", gap: "8px" }}>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleReturn(loan.borrower);
                                                }}
                                                disabled={loading}
                                                style={{
                                                    flex: 1,
                                                    padding: "10px",
                                                    backgroundColor: loading ? "#9ca3af" : "#10b981",
                                                    color: "white",
                                                    border: "none",
                                                    borderRadius: "6px",
                                                    cursor: loading ? "not-allowed" : "pointer",
                                                    fontWeight: 600,
                                                    fontSize: "14px",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    gap: "6px",
                                                }}
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="20 6 9 17 4 12"></polyline>
                                                </svg>
                                                {loading ? "İşleniyor..." : "Teslim Al"}
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedLoanForAction(loan);
                                                    setShowActionModal(true);
                                                }}
                                                disabled={loading}
                                                style={{
                                                    padding: "10px 16px",
                                                    backgroundColor: loading ? "#9ca3af" : "#6366f1",
                                                    color: "white",
                                                    border: "none",
                                                    borderRadius: "6px",
                                                    cursor: loading ? "not-allowed" : "pointer",
                                                    fontWeight: 600,
                                                    fontSize: "14px",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    gap: "4px",
                                                }}
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <circle cx="12" cy="12" r="1"></circle>
                                                    <circle cx="12" cy="5" r="1"></circle>
                                                    <circle cx="12" cy="19" r="1"></circle>
                                                    <circle cx="5" cy="12" r="1"></circle>
                                                    <circle cx="19" cy="12" r="1"></circle>
                                                </svg>
                                                İşlemler
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <button
                            onClick={() => {
                                setShowReturnModal(false);
                                setError(null);
                                setSelectedLoan(null);
                            }}
                            style={{
                                marginTop: "16px",
                                width: "100%",
                                padding: "12px",
                                backgroundColor: "#ef4444",
                                color: "white",
                                border: "none",
                                borderRadius: "6px",
                                cursor: "pointer",
                                fontWeight: 600,
                            }}
                        >
                            İptal
                        </button>
                    </div>
                </div>
            )}

            {/* Öğrenci Detay Modal */}
            {selectedStudentDetail && (
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
                        zIndex: 2001,
                    }}
                    onClick={() => setSelectedStudentDetail(null)}
                >
                    <div
                        className="card"
                        style={{
                            maxWidth: "700px",
                            width: "90%",
                            maxHeight: "90vh",
                            overflow: "auto",
                            position: "relative",
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                            <h2 style={{ margin: 0 }}>Öğrenci Detayları</h2>
                            <button
                                onClick={() => setSelectedStudentDetail(null)}
                                style={{
                                    background: "none",
                                    border: "none",
                                    fontSize: "24px",
                                    cursor: "pointer",
                                    color: "#64748b",
                                }}
                            >
                                ×
                            </button>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                            {/* Temel Bilgiler */}
                            <div style={{ padding: "16px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                                <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "18px" }}>Temel Bilgiler</h3>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
                                    <div>
                                        <strong style={{ color: "#64748b", fontSize: "13px", display: "block", marginBottom: "4px" }}>Ad</strong>
                                        <p style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>{selectedStudentDetail.name}</p>
                                    </div>
                                    <div>
                                        <strong style={{ color: "#64748b", fontSize: "13px", display: "block", marginBottom: "4px" }}>Soyad</strong>
                                        <p style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>{selectedStudentDetail.surname}</p>
                                    </div>
                                    {selectedStudentDetail.studentNumber && (
                                        <div>
                                            <strong style={{ color: "#64748b", fontSize: "13px", display: "block", marginBottom: "4px" }}>Öğrenci Numarası</strong>
                                            <p style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>{selectedStudentDetail.studentNumber}</p>
                                        </div>
                                    )}
                                    {selectedStudentDetail.class && (
                                        <div>
                                            <strong style={{ color: "#64748b", fontSize: "13px", display: "block", marginBottom: "4px" }}>Sınıf</strong>
                                            <p style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>{selectedStudentDetail.class}</p>
                                        </div>
                                    )}
                                    {selectedStudentDetail.branch && (
                                        <div>
                                            <strong style={{ color: "#64748b", fontSize: "13px", display: "block", marginBottom: "4px" }}>Şube</strong>
                                            <p style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>{selectedStudentDetail.branch}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* İstatistikler */}
                            <div style={{ padding: "20px", backgroundColor: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)" }}>
                                <h3 style={{ marginTop: 0, marginBottom: "20px", fontSize: "18px", fontWeight: 600, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="20" x2="18" y2="10"></line>
                                        <line x1="12" y1="20" x2="12" y2="4"></line>
                                        <line x1="6" y1="20" x2="6" y2="14"></line>
                                    </svg>
                                    Ödünç İstatistikleri
                                </h3>
                                {(() => {
                                    const lateCount = selectedStudentDetail.late ?? 0;
                                    // Aktif ödünç sayısını loans array'inden hesapla ve silinmiş kitapları filtrele
                                    const studentFullName = formatStudentFullName(selectedStudentDetail);
                                    const studentValidLoans = loans.length > 0 && books.length > 0
                                        ? loans.filter(l =>
                                            (l.borrower === studentFullName || l.borrower === selectedStudentDetail.name) &&
                                            books.some(b => b.id === l.bookId)
                                        )
                                        : [];
                                    const activeLoans = studentValidLoans.length > 0
                                        ? studentValidLoans.length
                                        : (selectedStudentDetail.borrowed ?? 0) - (selectedStudentDetail.returned ?? 0);

                                    return (
                                        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                                                <div style={{
                                                    textAlign: "center",
                                                    padding: "20px 16px",
                                                    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                                                    borderRadius: "12px",
                                                    boxShadow: "0 4px 6px rgba(102, 126, 234, 0.2)",
                                                    color: "white"
                                                }}>
                                                    <div style={{ marginBottom: "8px", display: "flex", justifyContent: "center" }}>
                                                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                                                            <line x1="8" y1="8" x2="16" y2="8"></line>
                                                            <line x1="8" y1="12" x2="16" y2="12"></line>
                                                            <line x1="8" y1="16" x2="16" y2="16"></line>
                                                        </svg>
                                                    </div>
                                                    <div style={{ fontSize: "32px", fontWeight: 700, marginBottom: "6px" }}>
                                                        {selectedStudentDetail.borrowed ?? 0}
                                                    </div>
                                                    <div style={{ fontSize: "13px", fontWeight: 500, opacity: 0.95 }}>Toplam Ödünç</div>
                                                </div>

                                                <div style={{
                                                    textAlign: "center",
                                                    padding: "20px 16px",
                                                    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                                                    borderRadius: "12px",
                                                    boxShadow: "0 4px 6px rgba(16, 185, 129, 0.2)",
                                                    color: "white"
                                                }}>
                                                    <div style={{ marginBottom: "8px", display: "flex", justifyContent: "center" }}>
                                                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                                            <polyline points="22 4 12 14.01 9 11.01"></polyline>
                                                        </svg>
                                                    </div>
                                                    <div style={{ fontSize: "32px", fontWeight: 700, marginBottom: "6px" }}>
                                                        {selectedStudentDetail.returned ?? 0}
                                                    </div>
                                                    <div style={{ fontSize: "13px", fontWeight: 500, opacity: 0.95 }}>İade</div>
                                                </div>
                                            </div>

                                            <div style={{ display: "grid", gridTemplateColumns: lateCount > 0 ? "repeat(2, 1fr)" : "1fr", gap: "16px" }}>
                                                <div style={{
                                                    textAlign: "center",
                                                    padding: "20px 16px",
                                                    background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                                                    borderRadius: "12px",
                                                    boxShadow: "0 4px 6px rgba(245, 158, 11, 0.2)",
                                                    color: "white"
                                                }}>
                                                    <div style={{ marginBottom: "8px", display: "flex", justifyContent: "center" }}>
                                                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                                                            <path d="M9 9l3 3 3-3"></path>
                                                        </svg>
                                                    </div>
                                                    <div style={{ fontSize: "32px", fontWeight: 700, marginBottom: "6px" }}>
                                                        {activeLoans}
                                                    </div>
                                                    <div style={{ fontSize: "13px", fontWeight: 500, opacity: 0.95 }}>Aktif Ödünç</div>
                                                </div>

                                                {lateCount > 0 && (
                                                    <div style={{
                                                        textAlign: "center",
                                                        padding: "20px 16px",
                                                        background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                                                        borderRadius: "12px",
                                                        boxShadow: "0 4px 6px rgba(239, 68, 68, 0.2)",
                                                        color: "white"
                                                    }}>
                                                        <div style={{ marginBottom: "8px", display: "flex", justifyContent: "center" }}>
                                                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                                                                <line x1="12" y1="9" x2="12" y2="13"></line>
                                                                <line x1="12" y1="17" x2="12.01" y2="17"></line>
                                                            </svg>
                                                        </div>
                                                        <div style={{ fontSize: "32px", fontWeight: 700, marginBottom: "6px" }}>
                                                            {lateCount}
                                                        </div>
                                                        <div style={{ fontSize: "13px", fontWeight: 500, opacity: 0.95 }}>Geciken</div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Geçmiş Ödünçler */}
                            {currentBook && (() => {
                                const studentFullNameForFilter = formatStudentFullName(selectedStudentDetail);
                                return currentBook.loans.filter(l =>
                                    l.borrower === studentFullNameForFilter || l.borrower === selectedStudentDetail.name
                                ).length > 0;
                            })() && (
                                    <div>
                                        <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "18px" }}>Bu Kitaptan Ödünçler</h3>
                                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                            {currentBook.loans
                                                .filter(l => {
                                                    const studentFullNameForFilter = formatStudentFullName(selectedStudentDetail);
                                                    return l.borrower === studentFullNameForFilter || l.borrower === selectedStudentDetail.name;
                                                })
                                                .map((loan, idx) => {
                                                    // DÜZELTME: getDaysDiff kullanarak tutarlı hesaplama
                                                    const diff = getDaysDiff(loan.dueDate);
                                                    const isLate = diff < 0;
                                                    const remainingDays = diff;
                                                    const isWarning = !isLate && remainingDays >= 0 && remainingDays <= 3;
                                                    return (
                                                        <div
                                                            key={idx}
                                                            style={{
                                                                padding: "12px",
                                                                backgroundColor: "#f8fafc",
                                                                borderRadius: "8px",
                                                                border: "1px solid #e2e8f0",
                                                            }}
                                                        >
                                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                                <div>
                                                                    <div style={{ fontWeight: 600, marginBottom: "4px" }}>{currentBook.title}</div>
                                                                    <div style={{ fontSize: "12px", color: "#64748b" }}>
                                                                        Teslim Tarihi: {new Date(loan.dueDate).toLocaleDateString("tr-TR")}
                                                                    </div>
                                                                    {loan.personel && (
                                                                        <div style={{ fontSize: "12px", color: "#64748b" }}>
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
                    </div>
                </div>
            )}

            {/* Ceza Puanı Düzenleme Modal - Sadece personel/admin için */}
            {!isReadOnly && showPenaltyModal && penaltyStudent && (
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
                            {(() => {
                                const penaltyPoints = penaltyStudent.penaltyPoints || 0;
                                return (
                                    <div style={{ padding: "20px", backgroundColor: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                                        <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "18px", fontWeight: 600, color: "#1e293b" }}>⚖️ Ceza Puanı</h3>
                                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                                                <div style={{ flex: 1 }}>
                                                    <strong style={{ color: "#64748b", fontSize: "14px", display: "block", marginBottom: "4px" }}>Ceza Puanı</strong>
                                                    <p style={{ margin: 0, fontSize: "24px", fontWeight: 700, color: penaltyPoints >= maxPenaltyPoints ? "#ef4444" : penaltyPoints > 0 ? "#f59e0b" : "#10b981" }}>
                                                        {penaltyPoints}
                                                    </p>
                                                    <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#64748b" }}>
                                                        (Geciken kitap teslim edildiğinde ceza puanı otomatik eklenir ve düşmez. Sadece personel input ile düşürülebilir)
                                                    </p>
                                                </div>
                                                {penaltyPoints >= maxPenaltyPoints && (
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
                                                    id="penalty-points-book-modal-input"
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
                                                        const input = document.getElementById("penalty-points-book-modal-input") as HTMLInputElement;
                                                        if (!input) return;
                                                        const newPenaltyPoints = parseInt(input.value) || 0;
                                                        if (newPenaltyPoints < 0) {
                                                            openInfoCard("Hata", "Ceza puanı negatif olamaz.", "error", "❌");
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
                                                            openInfoCard("Başarılı", "Ceza puanı başarıyla güncellendi.", "success", "✅");
                                                        } catch (err) {
                                                            openInfoCard("Hata", err instanceof Error ? err.message : "Ceza puanı güncellenirken bir hata oluştu", "error", "❌");
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
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* İşlemler Modal */}
            {showActionModal && selectedLoanForAction && createPortal(
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
                            setShowActionModal(false);
                            setSelectedLoanForAction(null);
                            setActionModalError(null);
                        }
                    }}
                >
                    <div
                        className="card"
                        style={{
                            maxWidth: "500px",
                            width: "90%",
                            maxHeight: "90vh",
                            overflow: "auto",
                            position: "relative",
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                            <h2 style={{ margin: 0, color: "#1e293b", display: "flex", alignItems: "center", gap: "8px" }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="1"></circle>
                                    <circle cx="12" cy="5" r="1"></circle>
                                    <circle cx="12" cy="19" r="1"></circle>
                                    <circle cx="5" cy="12" r="1"></circle>
                                    <circle cx="19" cy="12" r="1"></circle>
                                </svg>
                                İşlemler
                            </h2>
                            <button
                                onClick={() => {
                                    setShowActionModal(false);
                                    setSelectedLoanForAction(null);
                                    setActionModalError(null);
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

                        {/* Kitap Bilgileri */}
                        <div style={{ marginBottom: "24px", padding: "16px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                            <div style={{ fontWeight: 600, marginBottom: "8px", fontSize: "16px", color: "#1e293b" }}>{currentBook.title}</div>
                            <div style={{ fontSize: "14px", color: "#64748b", marginBottom: "4px" }}>
                                Öğrenci: <strong style={{ color: "#334155" }}>{selectedLoanForAction.borrower}</strong>
                            </div>
                            <div style={{ fontSize: "14px", color: "#64748b" }}>
                                Teslim Tarihi: <strong style={{ color: "#334155" }}>{new Date(selectedLoanForAction.dueDate).toLocaleDateString("tr-TR")}</strong>
                            </div>
                        </div>

                        {/* Hata Mesajı */}
                        {actionModalError && (
                            <div style={{ marginBottom: "16px", padding: "12px", backgroundColor: "#fee2e2", color: "#dc2626", borderRadius: "8px", border: "1px solid #fecaca" }}>
                                {actionModalError}
                            </div>
                        )}

                        {/* İşlem Butonları */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            {/* Süre Uzatma Bölümü */}
                            <div style={{ padding: "16px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                                <label style={{ display: "block", marginBottom: "12px", fontWeight: 600, fontSize: "14px", color: "#1e293b" }}>
                                    Süre Uzatma (Gün)
                                </label>
                                <select
                                    value={extendDays}
                                    onChange={(e) => setExtendDays(parseInt(e.target.value))}
                                    style={{
                                        width: "100%",
                                        padding: "10px",
                                        borderRadius: "6px",
                                        border: "1px solid #d1d5db",
                                        fontSize: "14px",
                                        marginBottom: "12px",
                                        backgroundColor: "#fff"
                                    }}
                                >
                                    <option value={7}>7 Gün</option>
                                    <option value={14}>14 Gün</option>
                                    <option value={21}>21 Gün</option>
                                    <option value={30}>30 Gün</option>
                                </select>
                                <button
                                    onClick={handleExtendLoan}
                                    disabled={loading}
                                    style={{
                                        width: "100%",
                                        padding: "12px",
                                        backgroundColor: loading ? "#9ca3af" : "#3b82f6",
                                        color: "white",
                                        border: "none",
                                        borderRadius: "6px",
                                        cursor: loading ? "not-allowed" : "pointer",
                                        fontWeight: 600,
                                        fontSize: "14px",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        gap: "6px",
                                    }}
                                >
                                    {loading ? (
                                        "İşleniyor..."
                                    ) : (
                                        <>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <circle cx="12" cy="12" r="10"></circle>
                                                <polyline points="12 6 12 12 16 14"></polyline>
                                            </svg>
                                            Süre Uzat
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* Teslim Al Butonu */}
                            <button
                                onClick={handleReturnFromActionModal}
                                disabled={loading}
                                style={{
                                    width: "100%",
                                    padding: "12px",
                                    backgroundColor: loading ? "#9ca3af" : "#10b981",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "6px",
                                    cursor: loading ? "not-allowed" : "pointer",
                                    fontWeight: 600,
                                    fontSize: "14px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: "6px",
                                }}
                            >
                                {loading ? (
                                    "İşleniyor..."
                                ) : (
                                    <>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12"></polyline>
                                        </svg>
                                        Teslim Al
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Generic Confirm Dialog */}
            {confirmDialog && (
                <ConfirmCard
                    isOpen={!!confirmDialog}
                    title={confirmDialog.title}
                    icon={confirmDialog.icon}
                    confirmText={confirmDialog.confirmText}
                    confirmButtonColor={confirmDialog.confirmButtonColor}
                    onConfirm={async () => {
                        setConfirmDialogLoading(true);
                        try {
                            await confirmDialog.onConfirm();
                        } finally {
                            setConfirmDialogLoading(false);
                            setConfirmDialog(null);
                        }
                    }}
                    onCancel={() => setConfirmDialog(null)}
                    loading={confirmDialogLoading}
                >
                    <div style={{ lineHeight: "1.5", color: "#4b5563" }}>
                        {confirmDialog.message.split('\n').map((line, i) => (
                            <p key={i} style={{ margin: "0 0 8px 0" }}>{line}</p>
                        ))}
                    </div>
                </ConfirmCard>
            )}

            {/* Generic Info Card */}
            {infoCardData && (
                <InfoCard
                    isOpen={showInfoCard}
                    title={infoCardData.title}
                    type={infoCardData.type}
                    icon={infoCardData.icon}
                    onClose={() => {
                        setShowInfoCard(false);
                        setInfoCardData(null);
                    }}
                >
                    <p style={{ lineHeight: "1.5", color: "#4b5563" }}>{infoCardData.message}</p>
                </InfoCard>
            )}

        </>
    );
};

export default BookDetailContent;
