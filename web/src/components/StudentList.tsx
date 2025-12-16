import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { StudentStat, LoanInfo, Book, StudentHistoryResponse, StudentHistoryEntry } from "../api/types";
import { httpClient } from "../api/client";
import BookDetailModal from "./BookDetailModal";
import StudentDetailModal from "./StudentDetailModal";
import { formatStudentFullName } from "../utils/studentName";
import ConfirmCard from "./ConfirmCard";
import { searchIncludes } from "../utils/searchUtils";

const normalizeBorrowerName = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();
const buildStudentSelectionKey = (student: StudentStat, index: number) => {
  if (student.studentNumber) {
    return `num:${student.studentNumber}`;
  }
  const fullName = `${student.name || ""} ${student.surname || ""}`.trim();
  const normalized = fullName ? normalizeBorrowerName(fullName) : "";
  if (normalized) {
    return `name:${normalized}`;
  }
  return `idx:${index}`;
};
const getStudentIdentifier = (student: StudentStat) => {
  if (student.studentNumber !== undefined && student.studentNumber !== null) {
    return `number:${student.studentNumber}`;
  }
  const namePart = (student.name || "").trim().toLowerCase();
  const surnamePart = (student.surname || "").trim().toLowerCase();
  return `${namePart}:${surnamePart}`;
};

const getBackendBorrowed = (student?: StudentStat | null) => Math.max(student?.borrowed ?? 0, 0);
const getBackendReturned = (student?: StudentStat | null) => Math.max(student?.returned ?? 0, 0);
const getBackendLate = (student?: StudentStat | null) => Math.max(student?.late ?? 0, 0);
const getBackendActive = (student?: StudentStat | null) =>
  Math.max(getBackendBorrowed(student) - getBackendReturned(student), 0);

const resolveActiveLoans = (student: StudentStat) => getBackendActive(student);
const resolveLateCount = (student: StudentStat) => getBackendLate(student);

// Helper to count REAL active loans from loans array (like StudentDetailCard)
const countRealActiveLoans = (student: StudentStat, loans: LoanInfo[]): number => {
  const studentFullName = `${student.name} ${student.surname}`.trim();
  return loans.filter(l =>
    l.borrower === student.name ||
    l.borrower === studentFullName
  ).length;
};

// Helper to calculate ACTIVE late loans (currently overdue books)
const calculateActiveLateLoans = (student: StudentStat, loans: LoanInfo[], books: Book[]): number => {
  const studentFullName = `${student.name} ${student.surname}`.trim();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return loans.filter(loan => {
    // Check if this loan belongs to the student
    if (loan.borrower !== student.name && loan.borrower !== studentFullName) {
      return false;
    }

    // Check if book exists (not deleted)
    const bookExists = books.some(b => b.id === loan.bookId);
    if (!bookExists) return false;

    // Check if loan is overdue
    const dueDate = new Date(loan.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    return dueDate.getTime() < today.getTime();
  }).length;
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
const deriveLoanCounters = (
  student?: StudentStat | null,
  options?: { activeOverride?: number }
) => {
  const backendBorrowed = getBackendBorrowed(student);
  const backendReturned = getBackendReturned(student);
  const resolvedActiveRaw =
    typeof options?.activeOverride === "number" && !Number.isNaN(options.activeOverride)
      ? options.activeOverride
      : getBackendActive(student);
  const activeLoans = Math.max(resolvedActiveRaw, 0);
  const totalBorrowed = Math.max(backendBorrowed, backendReturned + activeLoans);
  const totalReturned = Math.max(backendReturned, totalBorrowed - activeLoans);

  return {
    totalBorrowed,
    totalReturned,
    activeLoans,
  };
};

type Props = {
  students: StudentStat[];
  loans?: LoanInfo[];
  books?: Book[]; // Silinmiş kitapları filtrelemek için
  resetSearch?: boolean;
  filterVariant?: "full" | "compact" | "search-only";
  onRefresh?: () => void;
  classes?: number[];
  branches?: string[];
  onAddStudent?: (data: { name: string; surname: string; class: number | null; branch: string | null; studentNumber: number }) => Promise<void>;
  personelName?: string;
  onAddNotification?: (type: "info" | "success" | "warning" | "error", title: string, message: string) => void;
  onShowInfo?: (title: string, message: string, type: "info" | "success" | "warning" | "error", icon?: string) => void;
};

type SortOption = "name-asc" | "name-desc" | "class-asc" | "class-desc" | "borrowed-asc" | "borrowed-desc" | "none";

const StudentList = ({ students, loans = [], books = [], resetSearch = false, filterVariant = "full", onRefresh, classes: externalClasses = [], branches: externalBranches = [], onAddStudent, personelName = "", onAddNotification, onShowInfo }: Props) => {
  const OTHER_OPTION = "__OTHER__";
  const [maxPenaltyPoints, setMaxPenaltyPoints] = useState(100);

  // Helper to get active loans - uses REAL data from loans array if available
  const getActiveLoansForStudent = (student: StudentStat): number => {
    if (loans && loans.length > 0) {
      // Use REAL loan data (like StudentDetailCard)
      return countRealActiveLoans(student, loans);
    }
    // Fallback to statistics calculation
    return getBackendActive(student);
  };


  // Sistem ayarlarını yükle
  useEffect(() => {
    const loadSystemSettings = async () => {
      try {
        const response = await httpClient.get<{ maxBorrowLimit: number; maxPenaltyPoints: number }>("/system-settings");
        console.log('[StudentList] Sistem ayarları yüklendi:', response);
        console.log('[StudentList] Max Penalty Points:', response.maxPenaltyPoints);
        setMaxPenaltyPoints(response.maxPenaltyPoints);
        console.log('[StudentList] maxPenaltyPoints state güncellendi:', response.maxPenaltyPoints);
      } catch (error) {
        console.error("[StudentList] Sistem ayarları yüklenemedi:", error);
      }
    };
    loadSystemSettings();
  }, []);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showFilters, setShowFilters] = useState(false); // Filtreleme bölümünü göster/gizle
  const [newStudent, setNewStudent] = useState({
    name: "",
    surname: "",
    class: "",
    classOther: "",
    branch: "",
    branchOther: "",
    studentNumber: ""
  });
  const [error, setError] = useState<string | null>(null);
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [bulkEditField, setBulkEditField] = useState<string | null>(null);
  const [bulkEditValues, setBulkEditValues] = useState<Map<string, string>>(new Map());
  // Tüm sınıfları ve şubeleri çıkar
  const classes = useMemo(() => {
    if (externalClasses.length > 0) return externalClasses;
    const cls = new Set(students.map(s => s.class).filter(Boolean));
    return Array.from(cls).sort((a, b) => (a || 0) - (b || 0));
  }, [students, externalClasses]);

  const branches = useMemo(() => {
    if (externalBranches.length > 0) return externalBranches;
    const br = new Set(students.map(s => s.branch).filter(Boolean));
    return Array.from(br).sort();
  }, [students, externalBranches]);

  const [selectedClass, setSelectedClass] = useState<string>("");
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [sortOption, setSortOption] = useState<SortOption>("none");
  const [quickFilter, setQuickFilter] = useState<"all" | "active" | "late" | "passive">("all");
  const [columnSort, setColumnSort] = useState<string | null>(null);
  const [columnSortDirection, setColumnSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [pageInputValue, setPageInputValue] = useState<string>("");
  const [selectedStudent, setSelectedStudent] = useState<StudentStat | null>(null);
  const [studentHistory, setStudentHistory] = useState<StudentHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [expandedHistoryBooks, setExpandedHistoryBooks] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!students.length) {
      return;
    }

    const snapshot = students.slice(0, 15).map(student => ({
      name: `${student.name ?? ""} ${student.surname ?? ""}`.trim() || "(ad yok)",
      borrowed: getBackendBorrowed(student),
      returned: getBackendReturned(student),
      active: getBackendActive(student),
    }));
    console.debug("[StudentList][Counters]", snapshot);
  }, [students]);

  useEffect(() => {
    if (!selectedStudent) {
      return;
    }

    console.debug("[StudentList][DetailCounters]", {
      name: `${selectedStudent.name ?? ""} ${selectedStudent.surname ?? ""}`.trim() || "(ad yok)",
      borrowed: getBackendBorrowed(selectedStudent),
      returned: getBackendReturned(selectedStudent),
      active: getBackendActive(selectedStudent),
      late: getBackendLate(selectedStudent),
    });
  }, [selectedStudent]);
  useEffect(() => {
    if (!selectedStudent) {
      setStudentHistory(null);
      setHistoryError(null);
      setHistoryLoading(false);
      return;
    }

    const borrowerName = `${selectedStudent.name} ${selectedStudent.surname}`.trim() || selectedStudent.name;
    const query: Record<string, string | number | undefined> = {
      studentNumber: selectedStudent.studentNumber,
      borrower: borrowerName || undefined,
    };

    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);

    httpClient
      .get<StudentHistoryResponse>("/statistics/student-history", query)
      .then((response) => {
        if (!cancelled) {
          setStudentHistory(response);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setHistoryError(error instanceof Error ? error.message : "Geçmiş istatistikler yüklenemedi");
          setStudentHistory(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedStudent]);
  useEffect(() => {
    if (!selectedStudent) {
      return;
    }

    const identifier = getStudentIdentifier(selectedStudent);
    const updatedStudent = students.find(student => getStudentIdentifier(student) === identifier);
    if (!updatedStudent) {
      return;
    }

    const statsChanged =
      updatedStudent.borrowed !== selectedStudent.borrowed ||
      updatedStudent.returned !== selectedStudent.returned ||
      updatedStudent.late !== selectedStudent.late ||
      (updatedStudent.penaltyPoints || 0) !== (selectedStudent.penaltyPoints || 0) ||
      !!updatedStudent.isBanned !== !!selectedStudent.isBanned;

    const identityChanged =
      updatedStudent.name !== selectedStudent.name ||
      updatedStudent.surname !== selectedStudent.surname ||
      updatedStudent.class !== selectedStudent.class ||
      updatedStudent.branch !== selectedStudent.branch ||
      updatedStudent.studentNumber !== selectedStudent.studentNumber;

    if (statsChanged || identityChanged) {
      setSelectedStudent(updatedStudent);
    }
  }, [students, selectedStudent]);
  const [editingStudent, setEditingStudent] = useState<StudentStat | null>(null);
  const [extendingLoan, setExtendingLoan] = useState<LoanInfo | null>(null);
  const [extendDays, setExtendDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [selectedBookForDetail, setSelectedBookForDetail] = useState<Book | null>(null);
  const [showStudentDeleteConfirm, setShowStudentDeleteConfirm] = useState(false);
  const [studentDeleteSelection, setStudentDeleteSelection] = useState<Set<string>>(new Set());
  const [studentsToDelete, setStudentsToDelete] = useState<{ students: StudentStat[]; loansByStudent: Map<string, LoanInfo[]> } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

  const handleAddStudent = async () => {
    const name = newStudent.name.trim();
    const surname = newStudent.surname.trim();
    const studentNumber = newStudent.studentNumber ? parseInt(newStudent.studentNumber, 10) : null;
    const classValueRaw = newStudent.class === OTHER_OPTION ? newStudent.classOther : newStudent.class;
    const branchValueRaw = newStudent.branch === OTHER_OPTION ? newStudent.branchOther : newStudent.branch;
    const classValue = classValueRaw ? parseInt(classValueRaw, 10) : null;
    const branchValue = branchValueRaw?.trim() || null;

    if (!name || !surname) {
      setError("Ad ve soyad zorunludur");
      return;
    }

    if (!studentNumber) {
      setError("Öğrenci numarası zorunludur");
      return;
    }

    if (!classValueRaw) {
      setError("Sınıf zorunludur");
      return;
    }

    if (classValueRaw && Number.isNaN(classValue)) {
      setError("Sınıf sayısal olmalıdır");
      return;
    }

    if (!branchValueRaw) {
      setError("Şube zorunludur");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (onAddStudent) {
        await onAddStudent({
          name,
          surname,
          class: classValue,
          branch: branchValue,
          studentNumber
        });
        // onAddStudent callback'i içinde onRefresh çağrılıyor, burada tekrar çağırmaya gerek yok
      } else {
        await httpClient.post("/admin/students", {
          name,
          surname,
          class: classValue,
          branch: branchValue,
          studentNumber,
          personelName: personelName || ""
        });
        // onAddStudent yoksa burada refresh yap
        if (onRefresh) {
          await onRefresh();
        }
      }

      // Başarılı olduğunda formu temizle ve kapat
      setShowAddForm(false);
      setNewStudent({ name: "", surname: "", class: "", classOther: "", branch: "", branchOther: "", studentNumber: "" });
      setError(null);
    } catch (err) {
      // Hata durumunda formu açık tut ve hatayı göster
      setError(err instanceof Error ? err.message : "Öğrenci eklenemedi");
      // Hata durumunda formu kapatma
    } finally {
      setLoading(false);
    }
  };
  const isSearchOnly = filterVariant === "search-only";
  const isCompact = filterVariant === "compact" || isSearchOnly;

  // Sekme değiştiğinde filtrelemeleri sıfırla
  useEffect(() => {
    if (resetSearch) {
      setSearchTerm("");
      setSelectedClass("");
      setSelectedBranch("");
      setSortOption("none");
      setQuickFilter("all");
    }
  }, [resetSearch]);

  // Filtrelenmiş ve sıralanmış öğrenciler
  const filteredAndSortedStudents = useMemo(() => {
    // Her zaman students'tan başla - state güncellemelerini garantile
    let filtered = [...students];

    // Ad araması - boş string kontrolü (tüm künye bilgileri dahil - VEYA bağlacı ile)
    if (searchTerm && searchTerm.trim()) {
      filtered = filtered.filter(student =>
        searchIncludes(student.name, searchTerm) ||
        searchIncludes(student.surname, searchTerm) ||
        searchIncludes(`${student.name} ${student.surname}`.trim(), searchTerm) ||
        searchIncludes(student.studentNumber, searchTerm) ||
        searchIncludes(student.class, searchTerm) ||
        searchIncludes(student.branch, searchTerm) ||
        (student.class && student.branch && searchIncludes(`${student.class}-${student.branch}`, searchTerm)) ||
        (student.class && student.branch && searchIncludes(`${student.class}${student.branch}`, searchTerm)) ||
        searchIncludes(student.borrowed, searchTerm) ||
        searchIncludes(student.returned, searchTerm) ||
        searchIncludes(student.late, searchTerm) ||
        (student.borrowed !== undefined && student.returned !== undefined &&
          searchIncludes((student.borrowed - student.returned).toString(), searchTerm))
      );
    }

    // Sınıf filtresi (yalnızca tam filtrede)
    if (!isCompact && selectedClass) {
      filtered = filtered.filter(student => student.class?.toString() === selectedClass);
    }

    // Şube filtresi (yalnızca tam filtrede)
    if (!isCompact && selectedBranch) {
      filtered = filtered.filter(student => student.branch === selectedBranch);
    }

    // Hızlı filtreler (compact)
    if (isCompact && !isSearchOnly && quickFilter !== "all") {
      filtered = filtered.filter(student => {
        const activeLoans = getActiveLoansForStudent(student);
        const lateCount = resolveLateCount(student);
        if (quickFilter === "active") {
          return activeLoans > 0;
        }
        if (quickFilter === "late") {
          return lateCount > 0;
        }

        return activeLoans === 0 && lateCount === 0;
      });
    }

    // Sıralama
    if (sortOption !== "none") {
      filtered = [...filtered].sort((a, b) => {
        switch (sortOption) {
          case "name-asc":
            const nameAscCompare = (a.name || "").localeCompare(b.name || "", "tr");
            return nameAscCompare !== 0 ? nameAscCompare : (a.surname || "").localeCompare(b.surname || "", "tr");
          case "name-desc":
            const nameDescCompare = (b.name || "").localeCompare(a.name || "", "tr");
            return nameDescCompare !== 0 ? nameDescCompare : (b.surname || "").localeCompare(a.surname || "", "tr");
          case "class-asc":
            return (a.class || 0) - (b.class || 0);
          case "class-desc":
            return (b.class || 0) - (a.class || 0);
          case "borrowed-asc":
            return a.borrowed - b.borrowed;
          case "borrowed-desc":
            return b.borrowed - a.borrowed;
          default:
            return 0;
        }
      });
    }

    // Sütun başlığına tıklama sıralaması (tüm modlarda çalışır)
    if (columnSort) {
      filtered = [...filtered].sort((a, b) => {
        let compare = 0;

        switch (columnSort) {
          case "name":
            compare = (a.name || "").localeCompare(b.name || "", "tr");
            if (compare === 0) {
              compare = (a.surname || "").localeCompare(b.surname || "", "tr");
            }
            break;
          case "surname":
            compare = (a.surname || "").localeCompare(b.surname || "", "tr");
            if (compare === 0) {
              compare = (a.name || "").localeCompare(b.name || "", "tr");
            }
            break;
          case "studentNumber":
            compare = (a.studentNumber || 0) - (b.studentNumber || 0);
            break;
          case "class":
            // Önce sınıfa göre sırala, eşitse şubeye göre
            const classCompare = (a.class || 0) - (b.class || 0);
            if (classCompare !== 0) {
              compare = classCompare;
            } else {
              compare = (a.branch || "").localeCompare(b.branch || "", "tr");
            }
            break;
          case "branch":
            compare = (a.branch || "").localeCompare(b.branch || "", "tr");
            break;
          case "late":
            // Sort by ACTIVE late loans (currently overdue books), not historical data
            const lateA = calculateActiveLateLoans(a, loans, books);
            const lateB = calculateActiveLateLoans(b, loans, books);
            compare = lateA - lateB;
            break;
          case "activeLoans":
            const activeA = getActiveLoansForStudent(a);
            const activeB = getActiveLoansForStudent(b);
            compare = activeA - activeB;
            break;
          case "status":
            // Durum sıralaması: Ceza (3) > Aktif (1) > Pasif (0)
            const getStatusValue = (student: StudentStat) => {
              const penaltyPoints = student.penaltyPoints || 0;
              const activeLoans = getBackendActive(student);

              if (penaltyPoints >= maxPenaltyPoints) return 3;
              if (activeLoans > 0) return 1;
              return 0;
            };
            compare = getStatusValue(a) - getStatusValue(b);
            break;
          default:
            compare = 0;
        }

        // Eğer eşitse, name'e göre ikincil sıralama yap
        if (compare === 0 && columnSort !== "name" && columnSort !== "surname") {
          compare = (a.name || "").localeCompare(b.name || "", "tr");
          if (compare === 0) {
            compare = (a.surname || "").localeCompare(b.surname || "", "tr");
          }
        }

        return columnSortDirection === "asc" ? compare : -compare;
      });
    } else if (sortOption === "none") {
      // Varsayılan sıralama: alfabetik (isme göre)
      filtered = [...filtered].sort((a, b) => {
        const nameCompare = (a.name || "").localeCompare(b.name || "", "tr");
        if (nameCompare !== 0) return nameCompare;
        const surnameCompare = (a.surname || "").localeCompare(b.surname || "", "tr");
        if (surnameCompare !== 0) return surnameCompare;
        return (a.studentNumber || 0) - (b.studentNumber || 0);
      });
    }

    return filtered;
  }, [students, searchTerm, selectedClass, selectedBranch, sortOption, quickFilter, isCompact, isSearchOnly, columnSort, columnSortDirection, loans, books]);

  // Sayfalama hesapları
  const totalPages = Math.max(1, Math.ceil(filteredAndSortedStudents.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const pagedStudents = filteredAndSortedStudents.slice(startIndex, startIndex + pageSize);

  // Filtreleme veya sıralama değiştiğinde ilk sayfaya dön
  useEffect(() => {
    if (page > totalPages && totalPages > 0) {
      setPage(1);
    }
  }, [page, totalPages, searchTerm, selectedClass, selectedBranch, sortOption, quickFilter, columnSort, columnSortDirection]);

  // Sayfa numaraları oluştur
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 7;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      if (currentPage <= 4) {
        for (let i = 2; i <= 5; i++) {
          pages.push(i);
        }
        pages.push("...");
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 3) {
        pages.push("...");
        for (let i = totalPages - 4; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        pages.push("...");
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push("...");
        pages.push(totalPages);
      }
    }

    return pages;
  };

  // Sayfa düğmeleri
  const renderPagination = () => {
    const pageNumbers = getPageNumbers();

    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
          <button
            onClick={() => setPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid #e5e7eb",
              background: currentPage === 1 ? "#f1f5f9" : "#fff",
              cursor: currentPage === 1 ? "not-allowed" : "pointer",
              color: currentPage === 1 ? "#94a3b8" : "#475569",
              fontWeight: 500,
              fontSize: "14px"
            }}
          >
            Önceki
          </button>

          {pageNumbers.map((pageNum, idx) => {
            if (pageNum === "...") {
              return (
                <span key={`ellipsis-${idx}`} style={{ padding: "0 8px", color: "#94a3b8", fontSize: "14px" }}>
                  ...
                </span>
              );
            }

            const pageNumber = pageNum as number;
            const isActive = pageNumber === currentPage;

            return (
              <span
                key={pageNumber}
                onClick={() => setPage(pageNumber)}
                style={{
                  padding: "0 8px",
                  color: isActive ? "#1d4ed8" : "#475569",
                  cursor: "pointer",
                  fontWeight: isActive ? 700 : 400,
                  fontSize: "14px",
                  textDecoration: isActive ? "underline" : "none",
                  textUnderlineOffset: "2px"
                }}
              >
                {pageNumber}
              </span>
            );
          })}

          <button
            onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid #e5e7eb",
              background: currentPage === totalPages ? "#f1f5f9" : "#fff",
              cursor: currentPage === totalPages ? "not-allowed" : "pointer",
              color: currentPage === totalPages ? "#94a3b8" : "#475569",
              fontWeight: 500,
              fontSize: "14px"
            }}
          >
            Sonraki
          </button>

          <input
            type="number"
            value={pageInputValue}
            onChange={(e) => setPageInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const pageNum = parseInt(pageInputValue, 10);
                if (pageNum >= 1 && pageNum <= totalPages) {
                  setPage(pageNum);
                  setPageInputValue("");
                } else {
                  alert(`Lütfen 1 ile ${totalPages} arasında bir sayı girin.`);
                  setPageInputValue("");
                }
              }
            }}
            placeholder={currentPage.toString()}
            min={1}
            max={totalPages}
            style={{
              width: "60px",
              padding: "6px 8px",
              borderRadius: "6px",
              border: "1px solid #e5e7eb",
              fontSize: "14px",
              textAlign: "center",
              marginLeft: "4px"
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "14px", color: "#64748b" }}>
            {filteredAndSortedStudents.length > 0 ? `${startIndex + 1}-${Math.min(startIndex + pageSize, filteredAndSortedStudents.length)} / ${filteredAndSortedStudents.length}` : "0"}
          </span>
        </div>
      </div>
    );
  };

  const historyEntries = studentHistory?.entries ?? [];
  const historyEntriesByBook = useMemo(() => {
    const map = new Map<string, StudentHistoryEntry[]>();
    historyEntries.forEach((entry) => {
      const existing = map.get(entry.bookId) ?? [];
      existing.push(entry);
      map.set(entry.bookId, existing);
    });
    map.forEach((entriesForBook) => {
      entriesForBook.sort(
        (a, b) =>
          new Date(b.borrowedAt).getTime() -
          new Date(a.borrowedAt).getTime()
      );
    });
    return map;
  }, [historyEntries]);
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
  const hasHistoryData = studentHistory
    ? (studentHistory.totalBorrowed ?? 0) > 0 || historyEntries.length > 0 || (studentHistory.books?.length ?? 0) > 0
    : false;
  const shouldRenderHistorySection = historyLoading || historyError || hasHistoryData;
  const toggleHistoryBookCard = (bookId: string) => {
    setExpandedHistoryBooks((prev) => {
      const next = new Set(prev);
      if (next.has(bookId)) {
        next.delete(bookId);
      } else {
        next.add(bookId);
      }
      return next;
    });
  };
  const renderHistoryRow = (entry: StudentHistoryEntry) => {
    const statusIsReturned = entry.status?.toUpperCase() === "RETURNED";
    const statusLabel = statusIsReturned ? "İade" : "Aktif";
    const statusColor = statusIsReturned ? "#10b981" : entry.wasLate ? "#ef4444" : "#3b82f6";
    const borrowDate = entry.borrowedAt ? new Date(entry.borrowedAt).toLocaleDateString("tr-TR") : "—";
    const returnDate = entry.returnedAt ? new Date(entry.returnedAt).toLocaleDateString("tr-TR") : "—";
    const plannedDuration = entry.loanDays ? `${entry.loanDays} gün` : "—";
    const actualDurationValue =
      statusIsReturned && typeof entry.durationDays === "number" && !Number.isNaN(entry.durationDays)
        ? entry.durationDays
        : statusIsReturned
          ? calculateDurationInDays(entry.borrowedAt, entry.returnedAt)
          : null;
    const actualDurationLabel =
      actualDurationValue !== null ? `${actualDurationValue} gün` : statusIsReturned ? "—" : "Devam ediyor";
    const lateLabel = entry.wasLate ? `${entry.lateDays} gün` : "Yok";

    return (
      <tr key={`${entry.bookId}-${entry.borrowedAt}-${entry.status}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
        <td style={{ padding: "10px 8px", fontSize: "13px", color: "#0f172a", fontWeight: 600 }}>
          <div>{entry.bookTitle}</div>
          <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 500 }}>#{entry.bookId}</div>
        </td>
        <td style={{ padding: "10px 8px" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "2px 10px",
              borderRadius: "999px",
              fontSize: "11px",
              fontWeight: 600,
              color: statusColor,
              border: `1px solid ${statusColor}`,
            }}
          >
            {statusLabel}
          </span>
        </td>
        <td style={{ padding: "10px 8px", fontSize: "13px", color: "#475569" }}>{borrowDate}</td>
        <td style={{ padding: "10px 8px", fontSize: "13px", color: "#475569" }}>{returnDate}</td>
        <td style={{ padding: "10px 8px", fontSize: "13px", color: "#475569" }}>{plannedDuration}</td>
        <td style={{ padding: "10px 8px", fontSize: "13px", color: "#475569" }}>{actualDurationLabel}</td>
        <td
          style={{
            padding: "10px 8px",
            fontSize: "13px",
            color: entry.wasLate ? "#ef4444" : "#475569",
            fontWeight: entry.wasLate ? 600 : 500,
          }}
        >
          {lateLabel}
        </td>
      </tr>
    );
  };

  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());

  // Sekme değiştiğinde seçim modunu sıfırla
  useEffect(() => {
    if (resetSearch) {
      setSelectionMode(false);
      setSelectedStudentIds(new Set());
      setSearchTerm("");
    }
  }, [resetSearch]);

  // SelectionMode değiştiğinde seçilenleri temizle
  useEffect(() => {
    if (!selectionMode) {
      setSelectedStudentIds(new Set());
    }
  }, [selectionMode]);

  // Bilgi penceresi dışına tıklandığında kapat
  useEffect(() => {
    if (showInfoModal) {
      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (!target.closest('[data-info-popover]') && !target.closest('[data-info-button]')) {
          setShowInfoModal(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showInfoModal]);

  return (
    <div className="card" style={{ position: "relative" }}>
      {/* Bilgi İkonu - Sağ Üst Köşe */}
      <div style={{ position: "absolute", top: "16px", right: "16px", zIndex: 100 }}>
        <button
          data-info-button
          onClick={() => setShowInfoModal(!showInfoModal)}
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            border: "2px solid",
            borderColor: showInfoModal ? "#3b82f6" : "#fbbf24",
            background: showInfoModal ? "#eff6ff" : "#fef9e7",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "20px",
            color: showInfoModal ? "#1d4ed8" : "#d97706",
            transition: "all 0.2s",
            fontWeight: 700,
            boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
            position: "relative",
            padding: 0,
          }}
          onMouseEnter={(e) => {
            if (!showInfoModal) {
              e.currentTarget.style.backgroundColor = "#fef3c7";
              e.currentTarget.style.borderColor = "#f59e0b";
            }
          }}
          onMouseLeave={(e) => {
            if (!showInfoModal) {
              e.currentTarget.style.backgroundColor = "#fef9e7";
              e.currentTarget.style.borderColor = "#fbbf24";
            }
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke={showInfoModal ? "#1d4ed8" : "#d97706"}
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
        {showInfoModal && (
          <div
            data-info-popover
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
            {/* Ok işareti (yukarı ok) */}
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

            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Ceza Puanı Açıklaması */}
              <div>
                <h3 style={{ marginTop: 0, marginBottom: "10px", fontSize: "16px", fontWeight: 600, color: "#1e293b", display: "flex", alignItems: "center", gap: "6px" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>
                  Ceza Puanı Sistemi
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px", color: "#475569", lineHeight: "1.5" }}>
                  <p style={{ margin: 0 }}>
                    <strong style={{ color: "#1e293b" }}>Otomatik Hesaplama:</strong> Geciken kitapların toplam gecikme gün sayısı kadar otomatik hesaplanır.
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong style={{ color: "#1e293b" }}>Maksimum Değer:</strong> Hesaplanan değer mevcut değerden büyükse güncellenir. Kitaplar teslim edilse bile maksimum değer korunur.
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong style={{ color: "#1e293b" }}>Manuel Güncelleme:</strong> Personeller "Güncelle" butonu ile manuel değiştirebilir.
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong style={{ color: "#ef4444" }}>Ceza Durumu:</strong> Ceza puanı {maxPenaltyPoints} veya üzeri olan öğrenciler kitap alamaz.
                  </p>
                </div>
              </div>

              {/* Durum Sütunu Açıklaması */}
              <div>
                <h3 style={{ marginTop: 0, marginBottom: "10px", fontSize: "16px", fontWeight: 600, color: "#1e293b", display: "flex", alignItems: "center", gap: "6px" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10"></line>
                    <line x1="12" y1="20" x2="12" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="14"></line>
                  </svg>
                  Durum Sütunu
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px", color: "#475569", lineHeight: "1.5" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <span style={{ fontSize: "16px" }}>🚫</span>
                    <div>
                      <strong style={{ color: "#ef4444" }}>Ceza:</strong> Ceza puanı {maxPenaltyPoints} veya geciken kitap varsa.
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <span style={{ fontSize: "16px" }}>✓</span>
                    <div>
                      <strong style={{ color: "#3b82f6" }}>Aktif:</strong> Aktif ödünç alınan kitap varsa.
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <span style={{ fontSize: "16px" }}>○</span>
                    <div>
                      <strong style={{ color: "#64748b" }}>Pasif:</strong> Aktif ödünç yoksa ve ceza durumunda değilse.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="toolbar" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <h2 style={{ margin: 0 }}>Öğrenci Listesi</h2>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", width: "100%" }}>
            <input
              placeholder="Öğrenci adı veya numara ile ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ flex: 1, minWidth: "200px", padding: "10px" }}
            />
            <button
              className="primary"
              onClick={() => setShowAddForm(!showAddForm)}
            >
              + Yeni Öğrenci
            </button>
            <button
              onClick={() => {
                setSelectionMode(!selectionMode);
                if (selectionMode) {
                  setSelectedStudentIds(new Set());
                }
              }}
              style={{
                padding: "10px 20px",
                borderRadius: "8px",
                border: selectionMode ? "2px solid #3b82f6" : "1px solid #e5e7eb",
                background: selectionMode ? "#eff6ff" : "#fff",
                color: selectionMode ? "#1d4ed8" : "#374151",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "14px",
              }}
            >
              {selectionMode ? "✕ Seçimi İptal" : "✓ Seç"}
            </button>
          </div>
          {/* Filtreleme Toggle Butonu */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            style={{
              padding: "10px 16px",
              borderRadius: "8px",
              border: showFilters ? "2px solid #8b5cf6" : "1px solid #e5e7eb",
              background: showFilters ? "#f5f3ff" : "#fff",
              color: showFilters ? "#6d28d9" : "#374151",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "14px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              alignSelf: "flex-start",
              transition: "all 0.2s",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transform: showFilters ? "rotate(0deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
              }}
            >
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
            </svg>
            {showFilters ? "Filtreleme Seçeneklerini Gizle" : "Filtreleme Seçeneklerini Göster"}
          </button>
        </div>

        {showAddForm && (
          <div style={{
            padding: "20px",
            backgroundColor: "#f8fafc",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            marginBottom: "20px",
          }}>
            <h3 style={{ marginTop: 0, marginBottom: "16px" }}>Yeni Öğrenci Ekle</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "12px" }}>
              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "14px" }}>
                  Ad <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  value={newStudent.name}
                  onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
                  placeholder="Ahmet"
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px" }}
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "14px" }}>
                  Soyad <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  value={newStudent.surname}
                  onChange={(e) => setNewStudent({ ...newStudent, surname: e.target.value })}
                  placeholder="Yılmaz"
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px" }}
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "14px" }}>
                  Öğrenci Numarası <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "180px" }}>
                  <input
                    type="number"
                    value={newStudent.studentNumber}
                    onChange={(e) => setNewStudent({ ...newStudent, studentNumber: e.target.value })}
                    placeholder="Örn: 1234"
                    min="1"
                    required
                    style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px" }}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "14px" }}>
                  Sınıf <span style={{ color: "#ef4444" }}>*</span>
                </label>
                {newStudent.class === OTHER_OPTION ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "180px" }}>
                    <input
                      type="number"
                      value={newStudent.classOther}
                      onChange={(e) => setNewStudent({ ...newStudent, classOther: e.target.value })}
                      placeholder="Örn: 5"
                      min="1"
                      style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px" }}
                    />
                  </div>
                ) : (
                  <select
                    value={newStudent.class}
                    onChange={(e) => {
                      const value = e.target.value;
                      setNewStudent({ ...newStudent, class: value, classOther: value === OTHER_OPTION ? "" : "" });
                    }}
                    required
                    style={{ width: "100%", maxWidth: "180px", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px" }}
                  >
                    <option value="">Sınıf Seçin</option>
                    {classes.map(cls => (
                      <option key={cls} value={cls}>{cls}. Sınıf</option>
                    ))}
                    <option value={OTHER_OPTION}>Diğer (manuel giriş)</option>
                  </select>
                )}
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "14px" }}>
                  Şube <span style={{ color: "#ef4444" }}>*</span>
                </label>
                {newStudent.branch === OTHER_OPTION ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "180px" }}>
                    <input
                      type="text"
                      value={newStudent.branchOther}
                      onChange={(e) => setNewStudent({ ...newStudent, branchOther: e.target.value })}
                      placeholder="Örn: A"
                      style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px" }}
                    />
                  </div>
                ) : (
                  <select
                    value={newStudent.branch}
                    onChange={(e) => {
                      const value = e.target.value;
                      setNewStudent({ ...newStudent, branch: value, branchOther: value === OTHER_OPTION ? "" : "" });
                    }}
                    required
                    style={{ width: "100%", maxWidth: "180px", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px" }}
                  >
                    <option value="">Şube Seçin</option>
                    {branches.map(br => (
                      <option key={br} value={br}>{br}</option>
                    ))}
                    <option value={OTHER_OPTION}>Diğer (manuel giriş)</option>
                  </select>
                )}
              </div>
            </div>
            {error && <p style={{ color: "#ef4444", margin: "16px 0 0 0" }}>{error}</p>}
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "16px" }}>
              <button onClick={() => {
                setShowAddForm(false);
                setNewStudent({ name: "", surname: "", class: "", classOther: "", branch: "", branchOther: "", studentNumber: "" });
                setError(null);
              }} style={{ padding: "10px 20px" }}>
                İptal
              </button>
              <button className="primary" onClick={handleAddStudent} disabled={loading} style={{ padding: "10px 20px" }}>
                {loading ? "Ekleniyor..." : "Ekle"}
              </button>
            </div>
          </div>
        )}

        {selectionMode && selectedStudentIds.size > 0 && (
          <div style={{ display: "flex", gap: "8px", alignItems: "center", padding: "12px", backgroundColor: "#f0f9ff", borderRadius: "8px", border: "1px solid #bae6fd" }}>
            <span style={{ fontWeight: 600, color: "#0369a1" }}>
              {selectedStudentIds.size} öğrenci seçildi
            </span>
            <button
              onClick={() => setShowBulkEditModal(true)}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                border: "1px solid #3b82f6",
                background: "#3b82f6",
                color: "white",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "14px",
              }}
            >
              Seçilenleri Düzenle
            </button>
            <button
              onClick={async () => {
                try {
                  const selectedStudents = Array.from(selectedStudentIds)
                    .map(studentName => students.find(s => `${s.name} ${s.surname}`.trim() === studentName))
                    .filter((student): student is StudentStat => Boolean(student));

                  if (selectedStudents.length === 0) {
                    alert("Silinecek öğrenciler bulunamadı");
                    return;
                  }

                  const latestLoans = await httpClient.get<LoanInfo[]>("/books/loans");
                  const loansByBorrower = new Map<string, LoanInfo[]>();
                  latestLoans.forEach(loan => {
                    const key = loan.borrower ? normalizeBorrowerName(loan.borrower) : "";
                    if (!key) return;
                    if (!loansByBorrower.has(key)) {
                      loansByBorrower.set(key, []);
                    }
                    loansByBorrower.get(key)!.push(loan);
                  });

                  setStudentsToDelete({ students: selectedStudents, loansByStudent: loansByBorrower });
                  const selectionKeys = selectedStudents.map((student, index) => buildStudentSelectionKey(student, index));
                  setStudentDeleteSelection(new Set(selectionKeys));
                  setShowStudentDeleteConfirm(true);
                } catch (err) {
                  alert(err instanceof Error ? err.message : "Öğrenciler silinirken bir hata oluştu");
                }
              }}
              disabled={loading}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                border: "1px solid #ef4444",
                background: loading ? "#94a3b8" : "#ef4444",
                color: "white",
                cursor: loading ? "not-allowed" : "pointer",
                fontWeight: 600,
                fontSize: "14px",
              }}
            >
              {loading ? "Siliniyor..." : "Seçilenleri Sil"}
            </button>
          </div>
        )}
      </div>

      {/* Filtreleme */}
      {isCompact && isSearchOnly ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px", width: "100%" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", width: "100%" }}>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "#64748b" }}>Ad veya Numara Ara</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Öğrenci adı veya numara ile ara..."
              style={{ padding: "10px", borderRadius: "8px", border: "1px solid #e5e7eb", width: "100%", flex: "1 1 100%", minWidth: 0 }}
            />
          </div>
        </div>
      ) : isCompact ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1, minWidth: "200px" }}>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "#64748b" }}>Ad veya Numara Ara</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Öğrenci adı veya numara ile ara..."
              style={{ padding: "10px", borderRadius: "8px", border: "1px solid #e5e7eb" }}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "8px" }}>
            {[
              { value: "all" as const, label: "Tümü" },
              { value: "active" as const, label: "Aktif Ödünç" },
              { value: "late" as const, label: "Gecikmesi Olan" },
              { value: "passive" as const, label: "Pasif" },
            ].map(option => (
              <button
                key={option.value}
                onClick={() => setQuickFilter(option.value)}
                style={{
                  padding: "10px",
                  borderRadius: "8px",
                  border: quickFilter === option.value ? "2px solid #2563eb" : "1px solid #e5e7eb",
                  background: quickFilter === option.value ? "#eff6ff" : "#fff",
                  cursor: "pointer",
                  fontWeight: 700,
                  color: quickFilter === option.value ? "#1d4ed8" : "#475569",
                  transition: "all 0.2s",
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          {(searchTerm || quickFilter !== "all") && (
            <button
              onClick={() => {
                setSearchTerm("");
                setQuickFilter("all");
              }}
              style={{
                alignSelf: "flex-start",
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
      ) : showFilters ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", alignItems: "end", padding: "12px", backgroundColor: "#f8fafc", borderRadius: "8px", marginBottom: "16px", border: "1px solid #e5e7eb" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "#64748b" }}>Sınıf</label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              style={{ padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb", width: "100%" }}
            >
              <option value="">Tümü</option>
              {classes.map(cls => (
                <option key={cls} value={cls}>{cls}. Sınıf</option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "#64748b" }}>Şube</label>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              style={{ padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb", width: "100%" }}
            >
              <option value="">Tümü</option>
              {branches.map(br => (
                <option key={br} value={br}>{br}</option>
              ))}
            </select>
          </div>



          <div>
            {(searchTerm || selectedClass || selectedBranch || sortOption !== "none") && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  setSelectedClass("");
                  setSelectedBranch("");
                  setSortOption("none");
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
                  width: "100%",
                  whiteSpace: "nowrap",
                }}
              >
                Filtreleri Temizle
              </button>
            )}
          </div>
        </div>
      ) : null}

      {filteredAndSortedStudents.length === 0 ? (
        <p style={{ padding: "20px", textAlign: "center", color: "#64748b" }}>
          {searchTerm || selectedClass || selectedBranch
            ? "Arama kriterlerinize uygun öğrenci bulunamadı."
            : "Henüz öğrenci bulunmuyor."}
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <div style={{ marginBottom: "12px", fontSize: "14px", color: "#64748b" }}>
            Toplam <strong>{filteredAndSortedStudents.length}</strong> öğrenci gösteriliyor
          </div>
          <table className="book-table" style={{ width: "100%", tableLayout: "auto" }}>
            <thead>
              <tr>
                <th
                  onClick={() => {
                    if (columnSort === "name") {
                      setColumnSortDirection(columnSortDirection === "asc" ? "desc" : "asc");
                    } else {
                      setColumnSort("name");
                      setColumnSortDirection("asc");
                    }
                  }}
                  style={{ cursor: "pointer", userSelect: "none", minWidth: "120px", width: "15%", fontWeight: 600, textTransform: "none" }}
                >
                  Ad {columnSort === "name" && (columnSortDirection === "asc" ? "↑" : "↓")}
                </th>
                <th
                  onClick={() => {
                    if (columnSort === "surname") {
                      setColumnSortDirection(columnSortDirection === "asc" ? "desc" : "asc");
                    } else {
                      setColumnSort("surname");
                      setColumnSortDirection("asc");
                    }
                  }}
                  style={{ cursor: "pointer", userSelect: "none", minWidth: "120px", width: "15%", fontWeight: 600, textTransform: "none" }}
                >
                  Soyad {columnSort === "surname" && (columnSortDirection === "asc" ? "↑" : "↓")}
                </th>
                <th
                  onClick={() => {
                    if (columnSort === "studentNumber") {
                      setColumnSortDirection(columnSortDirection === "asc" ? "desc" : "asc");
                    } else {
                      setColumnSort("studentNumber");
                      setColumnSortDirection("asc");
                    }
                  }}
                  style={{ cursor: "pointer", userSelect: "none", minWidth: "120px", width: "15%", textAlign: "center", fontWeight: 600, textTransform: "none" }}
                >
                  Numara {columnSort === "studentNumber" && (columnSortDirection === "asc" ? "↑" : "↓")}
                </th>
                <th
                  onClick={() => {
                    if (columnSort === "class") {
                      setColumnSortDirection(columnSortDirection === "asc" ? "desc" : "asc");
                    } else {
                      setColumnSort("class");
                      setColumnSortDirection("asc");
                    }
                  }}
                  style={{ cursor: "pointer", userSelect: "none", minWidth: "140px", width: "18%", textAlign: "center", fontWeight: 600, textTransform: "none" }}
                >
                  Sınıf/Şube {columnSort === "class" && (columnSortDirection === "asc" ? "↑" : "↓")}
                </th>
                <th
                  onClick={() => {
                    if (columnSort === "activeLoans") {
                      setColumnSortDirection(columnSortDirection === "asc" ? "desc" : "asc");
                    } else {
                      setColumnSort("activeLoans");
                      setColumnSortDirection("asc");
                    }
                  }}
                  style={{ cursor: "pointer", userSelect: "none", minWidth: "120px", width: "15%", textAlign: "center", fontWeight: 600, textTransform: "none" }}
                >
                  Aktif Ödünç {columnSort === "activeLoans" && (columnSortDirection === "asc" ? "↑" : "↓")}
                </th>
                <th
                  onClick={() => {
                    if (columnSort === "late") {
                      setColumnSortDirection(columnSortDirection === "asc" ? "desc" : "asc");
                    } else {
                      setColumnSort("late");
                      setColumnSortDirection("asc");
                    }
                  }}
                  style={{ cursor: "pointer", userSelect: "none", minWidth: "120px", width: "15%", textAlign: "center", fontWeight: 600, textTransform: "none" }}
                >
                  Geciken {columnSort === "late" && (columnSortDirection === "asc" ? "↑" : "↓")}
                </th>
                <th
                  onClick={() => {
                    if (columnSort === "status") {
                      setColumnSortDirection(columnSortDirection === "asc" ? "desc" : "asc");
                    } else {
                      setColumnSort("status");
                      setColumnSortDirection("asc");
                    }
                  }}
                  style={{ cursor: "pointer", userSelect: "none", minWidth: "140px", width: "17%", fontWeight: 600, textTransform: "none" }}
                >
                  Durum {columnSort === "status" && (columnSortDirection === "asc" ? "↑" : "↓")}
                </th>
                {selectionMode && (
                  <th style={{ width: "60px", textAlign: "center", textTransform: "none" }}>
                    <div
                      onClick={() => {
                        if (selectedStudentIds.size === pagedStudents.length && pagedStudents.length > 0) {
                          setSelectedStudentIds(new Set());
                        } else {
                          const allPageStudentKeys = new Set(pagedStudents.map(student => `${student.name} ${student.surname}`.trim()).filter(Boolean));
                          setSelectedStudentIds(allPageStudentKeys);
                        }
                      }}
                      style={{
                        width: "24px",
                        height: "24px",
                        borderRadius: "50%",
                        border: selectedStudentIds.size === pagedStudents.length && pagedStudents.length > 0 ? "2px solid #3b82f6" : "2px solid #cbd5e1",
                        background: selectedStudentIds.size === pagedStudents.length && pagedStudents.length > 0 ? "#3b82f6" : "white",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.2s",
                        margin: "0 auto",
                      }}
                    >
                      {selectedStudentIds.size === pagedStudents.length && pagedStudents.length > 0 && (
                        <span style={{ color: "white", fontSize: "14px", fontWeight: "bold" }}>✓</span>
                      )}
                    </div>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {pagedStudents.map((student, index) => {
                const backendBorrowed = getBackendBorrowed(student);
                const backendReturned = getBackendReturned(student);
                const activeLoans = getActiveLoansForStudent(student);

                // Gecikmiş kitap sayısı: Sadece aktif gecikenler (iade edilmişler değil)
                const lateCount = calculateActiveLateLoans(student, loans, books);

                const studentKey = `${student.name} ${student.surname}`.trim(); // Öğrenci için benzersiz anahtar
                const totalBorrowed = Math.max(backendBorrowed, activeLoans + backendReturned);
                const penaltyPoints = student.penaltyPoints || 0;
                const nameDisplay = (student.name || "").trim();
                const surnameDisplay = (student.surname || "").trim();
                const primaryNameCellValue =
                  nameDisplay || surnameDisplay || `Öğrenci No: ${student.studentNumber ?? "-"}`;
                return (
                  <tr
                    key={index}
                    onClick={() => {
                      if (!selectionMode) {
                        setSelectedStudent(student);
                      }
                    }}
                    style={{ cursor: selectionMode ? "default" : "pointer" }}
                    onMouseEnter={(e) => {
                      if (!selectionMode) {
                        e.currentTarget.style.backgroundColor = "#f0f9ff";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!selectionMode) {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    }}
                  >
                    <td><strong>{primaryNameCellValue}</strong></td>
                    <td><strong>{surnameDisplay || "—"}</strong></td>
                    <td style={{ textAlign: "center" }}>{student.studentNumber || "—"}</td>
                    <td style={{ textAlign: "center" }}>
                      {student.class && student.branch
                        ? `${student.class}-${student.branch}`
                        : student.class
                          ? `${student.class}. Sınıf`
                          : "—"}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{
                        color: activeLoans > 0 ? "#3b82f6" : "#10b981",
                        fontWeight: 600
                      }}>
                        {activeLoans}
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{
                        color: lateCount > 0 ? "#ef4444" : "#10b981",
                        fontWeight: 600
                      }}>
                        {lateCount}
                      </span>
                    </td>
                    <td>
                      {penaltyPoints >= maxPenaltyPoints ? (
                        <span style={{ color: "#ef4444", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="15" y1="9" x2="9" y2="15"></line>
                            <line x1="9" y1="9" x2="15" y2="15"></line>
                          </svg>
                          Ceza
                        </span>
                      ) : activeLoans > 0 ? (
                        <span style={{ color: "#3b82f6", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                          Aktif
                        </span>
                      ) : (
                        <span style={{ color: "#64748b", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                          </svg>
                          Pasif
                        </span>
                      )}
                    </td>
                    {selectionMode && (
                      <td onClick={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            const newSelected = new Set(selectedStudentIds);
                            if (selectedStudentIds.has(studentKey)) {
                              newSelected.delete(studentKey);
                            } else {
                              newSelected.add(studentKey);
                            }
                            setSelectedStudentIds(newSelected);
                          }}
                          style={{
                            width: "24px",
                            height: "24px",
                            borderRadius: "50%",
                            border: selectedStudentIds.has(studentKey) ? "2px solid #3b82f6" : "2px solid #cbd5e1",
                            background: selectedStudentIds.has(studentKey) ? "#3b82f6" : "white",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "all 0.2s",
                          }}
                        >
                          {selectedStudentIds.has(studentKey) && (
                            <span style={{ color: "white", fontSize: "14px", fontWeight: "bold" }}>✓</span>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredAndSortedStudents.length > 0 && renderPagination()}
        </div>
      )}

      {/* Bulk Edit Modal */}
      {showBulkEditModal && createPortal(
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
            zIndex: 10001,
          }}
          onClick={() => {
            setShowBulkEditModal(false);
            setBulkEditField(null);
            setBulkEditValues(new Map());
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: "900px",
              width: "90%",
              maxHeight: "90vh",
              overflow: "auto",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h2 style={{ margin: 0 }}>Çoklu Öğrenci Düzenleme</h2>
              <button
                onClick={() => {
                  setShowBulkEditModal(false);
                  setBulkEditField(null);
                  setBulkEditValues(new Map());
                }}
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

            {!bulkEditField ? (
              <div>
                <label style={{ display: "block", marginBottom: "8px", fontWeight: 600, fontSize: "14px" }}>
                  Düzenlenecek Alanı Seçin
                </label>
                <select
                  value=""
                  onChange={(e) => {
                    setBulkEditField(e.target.value);
                    const newValues = new Map<string, string>();
                    const selectedStudents = students.filter(s => selectedStudentIds.has(`${s.name} ${s.surname}`.trim()));
                    selectedStudents.forEach(student => {
                      const studentKey = `${student.name} ${student.surname}`.trim();
                      const currentValue = e.target.value === "name" ? `${student.name} ${student.surname}`.trim() :
                        e.target.value === "studentNumber" ? student.studentNumber?.toString() :
                          e.target.value === "class" ? student.class?.toString() :
                            e.target.value === "branch" ? student.branch :
                              "";
                      newValues.set(studentKey, currentValue || "");
                    });
                    setBulkEditValues(newValues);
                  }}
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db", marginBottom: "24px" }}
                >
                  <option value="">-- Seçiniz --</option>
                  <option value="name">Ad soyad</option>
                  <option value="studentNumber">Öğrenci Numarası</option>
                  <option value="class">Sınıf</option>
                  <option value="branch">Şube</option>
                </select>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <div>
                    <strong style={{ fontSize: "16px" }}>
                      {bulkEditField === "name" ? "Ad soyad" :
                        bulkEditField === "studentNumber" ? "Öğrenci Numarası" :
                          bulkEditField === "class" ? "Sınıf" :
                            "Şube"} Düzenleme
                    </strong>
                    <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "14px" }}>
                      {selectedStudentIds.size} öğrenci seçildi
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setBulkEditField(null);
                      setBulkEditValues(new Map());
                    }}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "6px",
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    ← Geri
                  </button>
                </div>

                <div style={{ maxHeight: "500px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "12px" }}>
                  {students.filter(s => selectedStudentIds.has(`${s.name} ${s.surname}`.trim())).map((student) => {
                    const studentKey = `${student.name} ${student.surname}`.trim();
                    const currentValue = bulkEditValues.get(studentKey) || "";
                    const currentDisplayValue = bulkEditField === "name" ? `${student.name} ${student.surname}`.trim() :
                      bulkEditField === "studentNumber" ? student.studentNumber?.toString() :
                        bulkEditField === "class" ? student.class?.toString() :
                          bulkEditField === "branch" ? student.branch :
                            "";

                    return (
                      <div
                        key={studentKey}
                        style={{
                          padding: "16px",
                          marginBottom: "12px",
                          backgroundColor: "#f8fafc",
                          borderRadius: "8px",
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        <div style={{ marginBottom: "12px" }}>
                          <div style={{ fontWeight: 600, marginBottom: "4px", fontSize: "15px" }}>{student.name} {student.surname}</div>
                          <div style={{ fontSize: "12px", color: "#64748b" }}>
                            {student.studentNumber ? `Numara: ${student.studentNumber}` : ""} {student.class && student.branch ? `• ${student.class}-${student.branch}` : ""}
                          </div>
                          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
                            Mevcut: {currentDisplayValue || "—"}
                          </div>
                        </div>
                        <div>
                          {bulkEditField === "class" ? (
                            <select
                              value={currentValue}
                              onChange={(e) => {
                                const newValues = new Map(bulkEditValues);
                                newValues.set(studentKey, e.target.value);
                                setBulkEditValues(newValues);
                              }}
                              style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
                            >
                              <option value="">Sınıf seçin</option>
                              {classes.map(cls => (
                                <option key={cls} value={cls}>{cls}. Sınıf</option>
                              ))}
                            </select>
                          ) : bulkEditField === "branch" ? (
                            <select
                              value={currentValue}
                              onChange={(e) => {
                                const newValues = new Map(bulkEditValues);
                                newValues.set(studentKey, e.target.value);
                                setBulkEditValues(newValues);
                              }}
                              style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
                            >
                              <option value="">Şube seçin</option>
                              {branches.map(br => (
                                <option key={br} value={br}>{br}</option>
                              ))}
                            </select>
                          ) : bulkEditField === "studentNumber" ? (
                            <input
                              type="number"
                              value={currentValue}
                              onChange={(e) => {
                                const newValues = new Map(bulkEditValues);
                                newValues.set(studentKey, e.target.value);
                                setBulkEditValues(newValues);
                              }}
                              placeholder="Yeni öğrenci numarası girin"
                              style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
                              min="1"
                            />
                          ) : (
                            <input
                              type="text"
                              value={currentValue}
                              onChange={(e) => {
                                const newValues = new Map(bulkEditValues);
                                newValues.set(studentKey, e.target.value);
                                setBulkEditValues(newValues);
                              }}
                              placeholder="Yeni ad soyad girin"
                              style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "24px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowBulkEditModal(false);
                      setBulkEditField(null);
                      setBulkEditValues(new Map());
                    }}
                    style={{
                      padding: "10px 20px",
                      borderRadius: "6px",
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    İptal
                  </button>
                  <button
                    onClick={async () => {
                      const selectedStudents = students.filter(s => selectedStudentIds.has(`${s.name} ${s.surname}`.trim()));
                      const emptyValues = selectedStudents.filter(student => {
                        const studentKey = `${student.name} ${student.surname}`.trim();
                        const value = bulkEditValues.get(studentKey);
                        return !value || !value.trim();
                      });

                      if (emptyValues.length > 0) {
                        alert("Lütfen tüm öğrenciler için değer girin.");
                        return;
                      }

                      if (!window.confirm(`${selectedStudentIds.size} öğrencinin ${bulkEditField === "name" ? "ad soyad" : bulkEditField === "studentNumber" ? "öğrenci numarası" : bulkEditField === "class" ? "sınıf" : "şube"} bilgisini güncellemek istediğinize emin misiniz?`)) {
                        return;
                      }

                      try {
                        const updates = selectedStudents.map(student => {
                          const studentKey = `${student.name} ${student.surname}`.trim();
                          return {
                            studentName: studentKey,
                            field: bulkEditField,
                            newValue: bulkEditValues.get(studentKey) || ""
                          };
                        });

                        const response = await httpClient.put<{ updatedCount: number; errors: string[] }>("/admin/students/bulk", {
                          updates,
                          personelName: personelName || ""
                        });

                        if (response.errors && response.errors.length > 0) {
                          alert(`Bazı öğrenciler güncellenemedi:\n${response.errors.join("\n")}\n\n${response.updatedCount} öğrenci başarıyla güncellendi.`);
                        } else {
                          alert(`${response.updatedCount} öğrenci başarıyla güncellendi.`);
                        }

                        setShowBulkEditModal(false);
                        setBulkEditField(null);
                        setBulkEditValues(new Map());
                        setSelectionMode(false);
                        setSelectedStudentIds(new Set());

                        if (onRefresh) {
                          await onRefresh();
                        }
                      } catch (err) {
                        alert(err instanceof Error ? err.message : "Düzenleme sırasında bir hata oluştu");
                      }
                    }}
                    style={{
                      padding: "10px 20px",
                      borderRadius: "6px",
                      border: "1px solid #3b82f6",
                      background: "#3b82f6",
                      color: "white",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    Kayıt ve Onay
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Öğrenci Düzenleme Modal */}
      {editingStudent && createPortal(
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
            zIndex: 10002,
          }}
          onClick={() => setEditingStudent(null)}
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
              <h2 style={{ margin: 0, color: "#1e293b" }}>Öğrenci Bilgilerini Düzenle</h2>
              <button
                onClick={() => setEditingStudent(null)}
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

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const name = formData.get("name") as string;
                const studentNumber = formData.get("studentNumber") as string;
                const classValue = formData.get("class") as string;
                const branch = formData.get("branch") as string;

                if (!name.trim() || !studentNumber || !classValue || !branch) {
                  alert("Lütfen tüm zorunlu alanları doldurun.");
                  return;
                }

                try {
                  setLoading(true);
                  const updates: Array<{ studentName: string; field: string; newValue: string }> = [];

                  // Eski öğrenci adını kullanarak güncellemeleri hazırla
                  const originalName = editingStudent.name;

                  // Ad değiştiyse önce ismi güncelle
                  if (name.trim() !== originalName) {
                    updates.push({
                      studentName: originalName,
                      field: "name",
                      newValue: name.trim()
                    });
                  }

                  // Diğer alanları kontrol et ve güncelle
                  if (studentNumber !== editingStudent.studentNumber?.toString()) {
                    updates.push({
                      studentName: originalName,
                      field: "studentNumber",
                      newValue: studentNumber
                    });
                  }

                  if (classValue !== editingStudent.class?.toString()) {
                    updates.push({
                      studentName: originalName,
                      field: "class",
                      newValue: classValue
                    });
                  }

                  if (branch !== editingStudent.branch) {
                    updates.push({
                      studentName: originalName,
                      field: "branch",
                      newValue: branch
                    });
                  }

                  if (updates.length === 0) {
                    alert("Hiçbir değişiklik yapılmadı.");
                    setLoading(false);
                    return;
                  }

                  const response = await httpClient.put<{ updatedCount: number; errors: string[] }>("/admin/students/bulk", {
                    updates,
                    personelName: personelName || ""
                  });

                  if (response.errors && response.errors.length > 0) {
                    alert(`Güncelleme sırasında hatalar oluştu:\n${response.errors.join("\n")}`);
                    return;
                  }

                  setEditingStudent(null);
                  if (onRefresh) {
                    await onRefresh();
                  }
                } catch (err) {
                  alert(err instanceof Error ? err.message : "Düzenleme sırasında bir hata oluştu");
                } finally {
                  setLoading(false);
                }
              }}
              style={{ display: "flex", flexDirection: "column", gap: "16px" }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "16px" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "14px" }}>
                    Ad soyad <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    defaultValue={editingStudent.name}
                    required
                    style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px" }}
                    placeholder="Ahmet Yılmaz"
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "14px" }}>
                    Öğrenci Numarası <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    type="number"
                    name="studentNumber"
                    defaultValue={editingStudent.studentNumber || ""}
                    required
                    min="1"
                    style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px" }}
                    placeholder="Örn: 1234"
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "14px" }}>
                    Sınıf <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <select
                    name="class"
                    defaultValue={editingStudent.class?.toString() || ""}
                    required
                    style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px" }}
                  >
                    <option value="">Sınıf Seçin</option>
                    {classes.map(cls => (
                      <option key={cls} value={cls}>{cls}. Sınıf</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "14px" }}>
                    Şube <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <select
                    name="branch"
                    defaultValue={editingStudent.branch || ""}
                    required
                    style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px" }}
                  >
                    <option value="">Şube Seçin</option>
                    {branches.map(br => (
                      <option key={br} value={br}>{br}</option>
                    ))}
                  </select>
                </div>
              </div>

              {error && <p style={{ color: "#ef4444", margin: 0 }}>{error}</p>}

              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  style={{ padding: "10px 20px", borderRadius: "6px", border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontWeight: 600 }}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="primary"
                  disabled={loading}
                  style={{ padding: "10px 20px", borderRadius: "6px", border: "1px solid #3b82f6", background: "#3b82f6", color: "white", cursor: "pointer", fontWeight: 600 }}
                >
                  {loading ? "Güncelleniyor..." : "Güncelle"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Öğrenci Detay Modal */}
      <StudentDetailModal
        isOpen={!!selectedStudent}
        onClose={() => setSelectedStudent(null)}
        student={selectedStudent}
        loans={loans}
        books={books}
        personelName={personelName}
        onRefresh={onRefresh}
        onEdit={(student) => {
          setEditingStudent(student);
          setSelectedStudent(null);
        }}
        onBookClick={(book) => {
          setSelectedStudent(null);
          // BookDetailModal will be handled by parent or we need to add state for it here if not present
        }}
        maxPenaltyPoints={maxPenaltyPoints}
        loading={loading}
        historyEntries={studentHistory?.entries ?? []}
        studentHistory={studentHistory}
      />

      {/* Süre Uzatma Modal */}
      {
        extendingLoan && createPortal(
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
              zIndex: 10002,
            }}
            onClick={() => setExtendingLoan(null)}
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
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  Süre Uzat
                </h2>
                <button
                  onClick={() => setExtendingLoan(null)}
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
                {/* Kitap Bilgileri */}
                <div style={{ padding: "16px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontWeight: 600, marginBottom: "8px", fontSize: "16px" }}>{extendingLoan.title}</div>
                  <div style={{ fontSize: "14px", color: "#64748b" }}>
                    {extendingLoan.author} • {extendingLoan.category}
                  </div>
                  <div style={{ fontSize: "13px", color: "#64748b", marginTop: "4px" }}>
                    Mevcut Teslim Tarihi: {new Date(extendingLoan.dueDate).toLocaleDateString("tr-TR")}
                  </div>
                </div>

                {/* Süre Seçimi */}
                <div style={{ padding: "20px", backgroundColor: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                  <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "18px", fontWeight: 600, color: "#1e293b" }}>Yeni Süre Seçin</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <label style={{ fontSize: "14px", fontWeight: 600, color: "#64748b" }}>Uzatma Süresi (Gün)</label>
                    <select
                      value={extendDays}
                      onChange={(e) => setExtendDays(parseInt(e.target.value))}
                      style={{
                        width: "100%",
                        padding: "10px",
                        borderRadius: "6px",
                        border: "1px solid #d1d5db",
                        fontSize: "14px"
                      }}
                    >
                      <option value={7}>7 Gün</option>
                      <option value={14}>14 Gün</option>
                      <option value={21}>21 Gün</option>
                      <option value={30}>30 Gün</option>
                    </select>
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                      Yeni teslim tarihi: {new Date(Date.now() + extendDays * 24 * 60 * 60 * 1000).toLocaleDateString("tr-TR")}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setExtendingLoan(null)}
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
                      if (!extendingLoan || !personelName) return;
                      try {
                        setLoading(true);
                        const book = books?.find(b => b.id === extendingLoan.bookId);
                        // Önce mevcut kitabı geri al, sonra yeni süreyle tekrar ödünç ver
                        await httpClient.post(`/books/${extendingLoan.bookId}/return`, {
                          borrower: extendingLoan.borrower,
                          personelName: personelName.trim(),
                        });

                        // Yeni süreyle tekrar ödünç ver
                        // Bildirimler App.tsx'te veri değişikliklerinden otomatik olarak gönderilecek
                        await httpClient.post(`/books/${extendingLoan.bookId}/borrow`, {
                          borrower: extendingLoan.borrower,
                          days: extendDays,
                          personelName: personelName.trim(),
                        });

                        setExtendingLoan(null);
                        if (onRefresh) {
                          await onRefresh();
                        }
                      } catch (err) {
                        alert(err instanceof Error ? err.message : "Süre uzatma başarısız oldu");
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading || !personelName}
                    style={{
                      padding: "10px 20px",
                      fontSize: "14px",
                      backgroundColor: loading || !personelName ? "#9ca3af" : "#3b82f6",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      cursor: loading || !personelName ? "not-allowed" : "pointer",
                      fontWeight: 600,
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
              </div>
            </div>
          </div>,
          document.body
        )
      }

      {/* Kitap Detay Modal */}
      {
        selectedBookForDetail && (
          <BookDetailModal
            book={selectedBookForDetail}
            students={students}
            loans={loans}
            books={books}
            personelName={personelName}
            onClose={() => setSelectedBookForDetail(null)}
            onRefresh={onRefresh}
          />
        )
      }

      {/* Öğrenci Silme Onay Kartı */}
      <ConfirmCard
        isOpen={showStudentDeleteConfirm}
        title="Öğrenci Silme Onayı"
        icon="⚠️"
        onConfirm={async () => {
          if (!studentsToDelete) return;

          const studentEntries = studentsToDelete.students.map((student, index) => {
            const displayName = `${student.name} ${student.surname || ""}`.trim() || `Öğrenci No: ${student.studentNumber ?? "-"}`;
            const normalizedKey = normalizeBorrowerName(`${student.name} ${student.surname || ""}`.trim());
            const fallbackKey = normalizedKey || normalizeBorrowerName(student.name || student.surname || "");
            const loansForStudent = fallbackKey ? studentsToDelete.loansByStudent.get(fallbackKey) || [] : [];
            return {
              student,
              index,
              displayName,
              loans: loansForStudent,
              key: buildStudentSelectionKey(student, index),
            };
          });

          const selectedEntries = studentEntries.filter(entry => studentDeleteSelection.has(entry.key));
          if (selectedEntries.length === 0) {
            alert("Lütfen silmek istediğiniz öğrencileri seçin.");
            return;
          }

          const studentNumbers = selectedEntries
            .map(entry => entry.student.studentNumber)
            .filter((num): num is number => typeof num === "number" && !Number.isNaN(num));

          if (studentNumbers.length === 0) {
            alert("Seçilen öğrencilerde geçerli öğrenci numarası bulunamadı");
            return;
          }

          const selectedLoanCount = selectedEntries.reduce((sum, entry) => sum + entry.loans.length, 0);
          const infoSummary = selectedEntries.length === 1
            ? `${selectedEntries[0].displayName} silindi${selectedLoanCount > 0 ? `, ${selectedLoanCount} ödünç kaydı da silindi` : ""}.`
            : `${selectedEntries.length} öğrenci silindi${selectedLoanCount > 0 ? `, ${selectedLoanCount} ödünç kaydı da silindi` : ""}.`;

          setSelectionMode(false);
          setSelectedStudentIds(new Set());
          setShowStudentDeleteConfirm(false);
          setStudentsToDelete(null);
          setStudentDeleteSelection(new Set());

          setDeleteLoading(true);
          try {
            await httpClient.delete("/admin/students", {
              studentNumbers: studentNumbers
            });

            if (onRefresh) {
              await onRefresh();
            }

            if (onShowInfo) {
              onShowInfo("Başarılı", infoSummary, "success", "✅");
            }
          } catch (err) {
            alert(err instanceof Error ? err.message : "Öğrenciler silinirken bir hata oluştu");
          } finally {
            setDeleteLoading(false);
          }
        }}
        onCancel={() => {
          setShowStudentDeleteConfirm(false);
          setStudentsToDelete(null);
          setStudentDeleteSelection(new Set());
        }}
        confirmText="Sil"
        cancelText="İptal"
        confirmButtonColor="#ef4444"
        loading={deleteLoading}
        disabled={studentDeleteSelection.size === 0}
      >
        {studentsToDelete && (() => {
          const studentEntries = studentsToDelete.students.map((student, index) => {
            const displayName = `${student.name} ${student.surname || ""}`.trim() || `Öğrenci No: ${student.studentNumber ?? "-"}`;
            const normalizedKey = normalizeBorrowerName(`${student.name} ${student.surname || ""}`.trim());
            const fallbackKey = normalizedKey || normalizeBorrowerName(student.name || student.surname || "");
            const loansForStudent = fallbackKey ? studentsToDelete.loansByStudent.get(fallbackKey) || [] : [];
            return {
              student,
              index,
              displayName,
              loans: loansForStudent,
              key: buildStudentSelectionKey(student, index)
            };
          });

          if (studentEntries.length === 0) {
            return (
              <div style={{ fontSize: "14px", color: "#475569", lineHeight: "1.6" }}>
                Seçilen öğrenci bulunamadı.
              </div>
            );
          }

          const selectedEntries = studentEntries.filter(entry => studentDeleteSelection.has(entry.key));
          const selectedLoanCount = selectedEntries.reduce((sum, entry) => sum + entry.loans.length, 0);
          const hasLoanEntries = studentEntries.some(entry => entry.loans.length > 0);

          return (
            <>
              <div style={{ fontSize: "14px", color: "#475569", marginBottom: "16px", lineHeight: "1.6" }}>
                {hasLoanEntries ? (
                  "Bazı öğrencilerin teslim edilmemiş kitapları bulunuyor. Lütfen silmek istediğiniz öğrencileri işaretleyin."
                ) : studentEntries.length === 1 ? (
                  <>
                    <strong>{studentEntries[0].displayName}</strong> öğrencisini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
                  </>
                ) : (
                  <>
                    <strong>{studentEntries.length} öğrenci</strong> silinecek. Bu işlem geri alınamaz.
                  </>
                )}
              </div>
              <div style={{ maxHeight: "360px", overflowY: "auto", marginBottom: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                {studentEntries.map((entry) => {
                  const isSelected = studentDeleteSelection.has(entry.key);
                  return (
                    <div
                      key={entry.key}
                      style={{
                        padding: "12px",
                        borderRadius: "8px",
                        border: "1px solid #fbbf24",
                        backgroundColor: "#fef3c7",
                        cursor: "pointer"
                      }}
                      onClick={() => {
                        const updated = new Set(studentDeleteSelection);
                        if (isSelected) {
                          updated.delete(entry.key);
                        } else {
                          updated.add(entry.key);
                        }
                        setStudentDeleteSelection(updated);
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: entry.loans.length > 0 ? "8px" : "0" }}>
                        <div
                          className={`selection-checkbox ${isSelected ? "selected" : ""}`}
                          style={{ cursor: "pointer", flexShrink: 0 }}
                        >
                          {isSelected && <span>✓</span>}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "14px", fontWeight: 600, color: "#92400e" }}>
                            {entry.displayName}
                          </div>
                          {entry.student.studentNumber && (
                            <div style={{ fontSize: "12px", color: "#475569" }}>Öğrenci No: {entry.student.studentNumber}</div>
                          )}
                        </div>
                      </div>
                      {entry.loans.length > 0 && (
                        <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "13px", color: "#78350f" }}>
                          {entry.loans.map((loan, loanIdx) => {
                            const dueDate = loan.dueDate ? new Date(loan.dueDate).toLocaleDateString("tr-TR") : "-";
                            return (
                              <li key={`loan-${loanIdx}`} style={{ marginBottom: "6px" }}>
                                <strong>{loan.title}</strong> (Teslim: {dueDate})
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
              {selectedLoanCount > 0 && (
                <div style={{ fontSize: "13px", color: "#64748b", padding: "12px", backgroundColor: "#f1f5f9", borderRadius: "8px" }}>
                  <strong>{selectedLoanCount} ödünç kaydı</strong> bu işlemle birlikte silinecek.
                </div>
              )}
            </>
          );
        })()}
      </ConfirmCard>

    </div >
  );
};

export default StudentList;
