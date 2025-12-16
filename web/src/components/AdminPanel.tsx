import { useState, useEffect, useMemo } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { httpClient } from "../api/client";
import { LoanInfo } from "../api/types";
import ConfirmCard from "./ConfirmCard";
import InfoCard from "./InfoCard";
import PersonelExcelUploadModal from "./PersonelExcelUploadModal";
import Toast from "./Toast";
import { useToast } from "../hooks/useToast";
import "./AdminPanel.css";

interface DatabaseInfo {
  bookCount: number;
  userCount: number;
  loanCount: number;
  studentCount: number;
  personelCount: number;
  adminCount: number;
  databasePath: string;
}

interface AutoBackupStatus {
  enabled: boolean;
  intervalDays: number;
  lastBackupDate?: string;
}

interface UserInfo {
  username?: string;
  name?: string;
  surname?: string;
  role: string;
  class?: number;
  branch?: string;
  studentNumber?: number;
  penaltyPoints?: number;
  position?: string;
}

interface BookEntity {
  id: string;
  title: string;
  author: string;
  category: string;
  quantity: number;
  totalQuantity: number;
  lastpersonel?: string;
  loans: LoanEntity[];
}

interface LoanEntity {
  id: number;
  bookId: string;
  borrower: string;
  dueDate: string;
  personel: string;
  bookTitle?: string;
  bookAuthor?: string;
  book?: BookEntity; // Backward compatibility
}

// İkonlar
const HomeIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
    <polyline points="9 22 9 12 15 12 15 22"></polyline>
  </svg>
);

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

const LoanListIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
    <line x1="8" y1="8" x2="16" y2="8"></line>
    <line x1="8" y1="12" x2="16" y2="12"></line>
    <line x1="8" y1="16" x2="16" y2="16"></line>
  </svg>
);

const DatabaseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
  </svg>
);

const ImportIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"></path>
    <polyline points="7 12 12 17 17 12"></polyline>
    <line x1="12" y1="17" x2="12" y2="3"></line>
  </svg>
);

const EditIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
  </svg>
);

const TrashIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
  </svg>
);

const normalizeBackupPath = (path: string) => path.replace(/\\/g, "/");
const getBackupDirectory = (path: string) => {
  const normalized = normalizeBackupPath(path);
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash >= 0 ? normalized.slice(0, lastSlash) : normalized;
};
const getBackupFileName = (path: string) => {
  const normalized = normalizeBackupPath(path);
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
};

const getStoredBackupDirectory = () => {
  if (typeof window === "undefined") {
    return "";
  }
  return localStorage.getItem("kutuphane_backup_directory") || "";
};

// Yedek dosya adını parse edip tarih ve sıra bilgisi ile formatlar
const formatBackupDisplay = (backupPath: string, allBackups: string[]) => {
  const fileName = getBackupFileName(backupPath);

  // Dosya adından tarih bilgisini çıkar
  // Format: kutuphane_backup_yyyyMMdd_HHmmss.db veya before_restore_yyyyMMdd_HHmmss.db
  const match = fileName.match(/(\d{8})_(\d{6})/);

  if (!match) {
    return fileName; // Parse edilemezse olduğu gibi göster
  }

  const dateStr = match[1]; // yyyyMMdd
  const timeStr = match[2]; // HHmmss

  // Tarihi formatla
  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(4, 6);
  const day = dateStr.substring(6, 8);
  const hour = timeStr.substring(0, 2);
  const minute = timeStr.substring(2, 4);

  const date = `${day}.${month}.${year}`;
  const time = `${hour}:${minute}`;

  // Aynı gün içinde kaçıncı yedek olduğunu bul
  const sameDayBackups = allBackups.filter(b => {
    const otherFileName = getBackupFileName(b);
    const otherMatch = otherFileName.match(/(\d{8})_(\d{6})/);
    return otherMatch && otherMatch[1] === dateStr;
  }).sort(); // Alfabetik sırala (zaman damgası sayesinde kronolojik olur)

  const sequence = sameDayBackups.indexOf(backupPath) + 1;
  const total = sameDayBackups.length;

  // Yedek tipi (normal veya restore öncesi)
  const isBeforeRestore = fileName.includes("before_restore");
  const typeLabel = isBeforeRestore ? "Restore Öncesi" : "Yedek";

  // Eğer aynı gün birden fazla yedek varsa sıra numarası ekle
  if (total > 1) {
    return `${typeLabel} - ${date} (${sequence}/${total}) - ${time}`;
  } else {
    return `${typeLabel} - ${date} - ${time}`;
  }
};

const BackupIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2"></path>
    <polyline points="7 8 12 13 17 8"></polyline>
    <line x1="12" y1="13" x2="12" y2="2"></line>
  </svg>
);

const AdminPanel = () => {
  const { toasts, showToast, removeToast } = useToast();

  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'students' | 'books' | 'loans' | 'database'>('overview');
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [students, setStudents] = useState<UserInfo[]>([]);
  const [books, setBooks] = useState<BookEntity[]>([]);
  const [loans, setLoans] = useState<LoanEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [backups, setBackups] = useState<string[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserInfo | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<UserInfo | null>(null);
  const [selectedBook, setSelectedBook] = useState<BookEntity | null>(null);
  const [selectedLoan, setSelectedLoan] = useState<LoanEntity | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editStudentMode, setEditStudentMode] = useState(false);
  const [editBookMode, setEditBookMode] = useState(false);
  const [editLoanMode, setEditLoanMode] = useState(false);
  const [newRole, setNewRole] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [editpersonelData, setEditpersonelData] = useState({
    name: "",
    surname: "",
    position: "",
    password: ""
  });
  const [editStudentData, setEditStudentData] = useState({
    name: "",
    surname: "",
    class: "",
    branch: "",
    studentNumber: ""
  });
  const [editBookData, setEditBookData] = useState({
    title: "",
    author: "",
    category: "",
    quantity: ""
  });
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [showAddpersonel, setShowAddpersonel] = useState(false);
  const [showAddBook, setShowAddBook] = useState(false);
  const [showPersonelUploadModal, setShowPersonelUploadModal] = useState(false);
  const [personelUploadSummary, setPersonelUploadSummary] = useState<{ added: number; skipped: number; total: number } | null>(null);
  const [showPersonelImportCard, setShowPersonelImportCard] = useState(false);
  const [preferredBackupDirectory, setPreferredBackupDirectory] = useState<string>(() => getStoredBackupDirectory());
  const [backupDirectoryInput, setBackupDirectoryInput] = useState<string>(() => getStoredBackupDirectory());
  const [selectedBackupDirectory, setSelectedBackupDirectory] = useState<string>("all");

  // Otomatik yedekleme state'leri
  const [autoBackupStatus, setAutoBackupStatus] = useState<AutoBackupStatus | null>(null);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState<boolean>(true);
  const [autoBackupDays, setAutoBackupDays] = useState<number>(30);

  // Yedek temizleme için gün seçimi
  const [cleanupDays, setCleanupDays] = useState<number>(90);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    icon?: string;
    confirmText?: string;
    confirmButtonColor?: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  // Recovery code state
  const [showRecoveryCodeModal, setShowRecoveryCodeModal] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [recoveryCodeLoading, setRecoveryCodeLoading] = useState(false);

  // Form states
  const [newStudent, setNewStudent] = useState({
    name: "",
    surname: "",
    class: "",
    branch: "",
    studentNumber: ""
  });
  const [newpersonel, setNewpersonel] = useState({
    username: "",
    password: "",
    name: "",
    surname: "",
    position: ""
  });
  const [newBook, setNewBook] = useState({
    title: "",
    author: "",
    category: "",
    quantity: ""
  });
  const backupDirectoryGroups = useMemo(() => {
    if (backups.length === 0) {
      return [];
    }
    const grouped = new Map<string, string[]>();
    backups.forEach(path => {
      const directory = getBackupDirectory(path);
      if (!grouped.has(directory)) {
        grouped.set(directory, []);
      }
      grouped.get(directory)!.push(path);
    });
    return Array.from(grouped.entries()).map(([directory, files]) => ({
      directory,
      files
    }));
  }, [backups]);

  const filteredBackups = useMemo(() => {
    if (selectedBackupDirectory === "all") {
      return backups;
    }
    return backups.filter(path => getBackupDirectory(path) === selectedBackupDirectory);
  }, [backups, selectedBackupDirectory]);
  useEffect(() => {
    if (activeTab !== "users") {
      setShowPersonelImportCard(false);
    }
  }, [activeTab]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        setShowPersonelImportCard(false);
      }
    };
    const handleBeforeUnload = () => {
      setShowPersonelImportCard(false);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);
  const [editLoanData, setEditLoanData] = useState({
    borrower: "",
    dueDate: "",
    personel: ""
  });

  // Seçim modu state'leri
  const [selectionMode, setSelectionMode] = useState<'books' | 'students' | 'users' | 'loans' | null>(null);
  const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(new Set());
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<number>>(new Set());
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [selectedLoanIds, setSelectedLoanIds] = useState<Set<number>>(new Set());

  // Onay kartı state'leri
  const [showBookDeleteConfirm, setShowBookDeleteConfirm] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<{ book: BookEntity; loans: LoanEntity[] } | null>(null);
  const [showStudentDeleteConfirm, setShowStudentDeleteConfirm] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<{ students: UserInfo[]; loansByStudent: Map<string, LoanInfo[]> } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Bilgilendirme kartı state'leri
  const [showInfoCard, setShowInfoCard] = useState(false);
  const [infoCardData, setInfoCardData] = useState<{ title: string; message: string; type: "info" | "success" | "warning" | "error"; icon?: string } | null>(null);

  // Toplu silme detay state'leri
  const [showBulkDeleteDetail, setShowBulkDeleteDetail] = useState(false);
  const [bulkDeleteData, setBulkDeleteData] = useState<{
    type: "books" | "students";
    items: Array<{ id: string | number; name: string; loans: LoanInfo[] }>;
    selectedItems: Set<string | number>;
  } | null>(null);
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [bulkEditContext, setBulkEditContext] = useState<{
    type: "users" | "students" | "books" | "loans";
    items: Array<UserInfo | BookEntity | LoanEntity>;
  } | null>(null);
  const [bulkEditForm, setBulkEditForm] = useState<Record<string, any>>({});
  const [bulkEditError, setBulkEditError] = useState<string | null>(null);
  const [bulkEditLoading, setBulkEditLoading] = useState(false);

  // InfoCard helper fonksiyonu
  const showInfo = (title: string, message: string, type: "info" | "success" | "warning" | "error" = "info", icon?: string) => {
    setInfoCardData({ title, message, type, icon });
    setShowInfoCard(true);
  };

  const bulkLabelStyle: CSSProperties = {
    display: "block",
    fontSize: "13px",
    fontWeight: 600,
    marginBottom: "4px",
    color: "#475569",
  };

  const bulkInputStyle: CSSProperties = {
    width: "100%",
    padding: "10px",
    borderRadius: "8px",
    border: "1px solid #cbd5f5",
    fontSize: "14px",
    backgroundColor: "#fff",
  };

  const bulkEditTitles = {
    users: "Personel",
    students: "Öğrenci",
    books: "Kitap",
    loans: "Ödünç",
  } as const;

  const handleBulkEditInputChange = (key: string, field: string, value: any) => {
    setBulkEditForm((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        [field]: value,
      },
    }));
  };

  const closeBulkEditModal = () => {
    setShowBulkEditModal(false);
    setBulkEditContext(null);
    setBulkEditForm({});
    setBulkEditError(null);
  };

  const handleBulkEditSubmit = async () => {
    if (!bulkEditContext) return;
    setBulkEditError(null);
    setBulkEditLoading(true);
    try {
      if (bulkEditContext.type === "users") {
        const items = bulkEditContext.items as UserInfo[];
        for (const user of items) {
          if (!user.username) continue;
          const form = bulkEditForm[user.username];
          if (!form || !form.name?.trim() || !form.surname?.trim()) {
            setBulkEditError("Ad ve soyad alanları boş bırakılamaz.");
            setBulkEditLoading(false);
            return;
          }
          await httpClient.put(`/admin/personel/${user.username}`, {
            name: form.name.trim(),
            surname: form.surname.trim(),
            position: form.position?.trim() || null,
            password: form.password ? form.password : null,
          });
        }
        showInfo("Başarılı", `${items.length} personel güncellendi.`, "success", "✅");
        await loadUsers();
        await loadDatabaseInfo();
        setSelectedUserIds(new Set());
      } else if (bulkEditContext.type === "students") {
        const items = bulkEditContext.items as UserInfo[];
        for (const student of items) {
          if (student.studentNumber === undefined) continue;
          const key = String(student.studentNumber);
          const form = bulkEditForm[key];
          if (!form || !form.name?.trim() || !form.surname?.trim()) {
            setBulkEditError("Öğrenci adı ve soyadı boş bırakılamaz.");
            setBulkEditLoading(false);
            return;
          }
          const classValue = form.class ? parseInt(form.class, 10) : null;
          if (form.class && Number.isNaN(classValue)) {
            setBulkEditError("Sınıf değeri sayısal olmalıdır.");
            setBulkEditLoading(false);
            return;
          }
          await httpClient.put(`/admin/students/${student.studentNumber}`, {
            name: form.name.trim(),
            surname: form.surname.trim(),
            class: classValue,
            branch: form.branch?.trim() || null,
          });
        }
        showInfo("Başarılı", `${items.length} öğrenci güncellendi.`, "success", "✅");
        await loadStudents();
        await loadDatabaseInfo();
        setSelectedStudentIds(new Set());
      } else if (bulkEditContext.type === "books") {
        const items = bulkEditContext.items as BookEntity[];
        for (const book of items) {
          const form = bulkEditForm[book.id];
          if (!form || !form.title?.trim() || !form.author?.trim()) {
            setBulkEditError("Kitap adı ve yazar bilgisi boş olamaz.");
            setBulkEditLoading(false);
            return;
          }
          const quantity = form.quantity ? parseInt(form.quantity, 10) : book.totalQuantity;
          if (Number.isNaN(quantity) || quantity < 0) {
            setBulkEditError("Geçerli bir adet değeri girin.");
            setBulkEditLoading(false);
            return;
          }
          await httpClient.put(`/books/${book.id}`, {
            title: form.title.trim(),
            author: form.author.trim(),
            category: form.category?.trim() || "Genel",
            totalQuantity: quantity,
          });
        }
        showInfo("Başarılı", `${items.length} kitap güncellendi.`, "success", "✅");
        await loadBooks();
        await loadDatabaseInfo();
        setSelectedBookIds(new Set());
      } else if (bulkEditContext.type === "loans") {
        const items = bulkEditContext.items as LoanEntity[];
        for (const loan of items) {
          const key = String(loan.id);
          const form = bulkEditForm[key];
          if (!form || !form.borrower?.trim() || !form.dueDate) {
            setBulkEditError("Öğrenci adı ve teslim tarihi zorunludur.");
            setBulkEditLoading(false);
            return;
          }
          const dueDate = new Date(form.dueDate);
          if (Number.isNaN(dueDate.getTime())) {
            setBulkEditError("Geçerli bir teslim tarihi girin.");
            setBulkEditLoading(false);
            return;
          }
          const days = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          const borrowDays = Number.isFinite(days) && days > 0 ? days : 7;
          await httpClient.post(`/books/${loan.bookId}/return`, {
            borrower: loan.borrower,
            personelName: form.personel?.trim() || "Admin",
          });
          await httpClient.post(`/books/${loan.bookId}/borrow`, {
            borrower: form.borrower.trim(),
            days: borrowDays,
            personelName: form.personel?.trim() || "Admin",
          });
        }
        showInfo("Başarılı", `${items.length} ödünç kaydı güncellendi.`, "success", "✅");
        await loadLoans();
        await loadBooks();
        await loadDatabaseInfo();
        setSelectedLoanIds(new Set());
      }

      closeBulkEditModal();
    } catch (error: any) {
      const message = error instanceof Error ? error.message : error?.response?.data?.message;
      setBulkEditError(message || "Toplu düzenleme sırasında bir hata oluştu.");
    } finally {
      setBulkEditLoading(false);
    }
  };

  const renderBulkEditItem = (item: UserInfo | BookEntity | LoanEntity, index: number) => {
    if (!bulkEditContext) return null;
    if (bulkEditContext.type === "users") {
      const user = item as UserInfo;
      const key = user.username || `user-${index}`;
      const form = bulkEditForm[key] || {};
      return (
        <div key={key} style={{ padding: "16px", border: "1px solid #e2e8f0", borderRadius: "12px", backgroundColor: "#f8fafc" }}>
          <div style={{ marginBottom: "12px", fontWeight: 600, color: "#0f172a" }}>
            {user.username} • {user.name} {user.surname}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
            <div>
              <label style={bulkLabelStyle}>Ad</label>
              <input type="text" value={form.name || ""} onChange={(e) => handleBulkEditInputChange(key, "name", e.target.value)} style={bulkInputStyle} />
            </div>
            <div>
              <label style={bulkLabelStyle}>Soyad</label>
              <input type="text" value={form.surname || ""} onChange={(e) => handleBulkEditInputChange(key, "surname", e.target.value)} style={bulkInputStyle} />
            </div>
            <div>
              <label style={bulkLabelStyle}>Pozisyon</label>
              <input type="text" value={form.position || ""} onChange={(e) => handleBulkEditInputChange(key, "position", e.target.value)} style={bulkInputStyle} />
            </div>
            <div>
              <label style={bulkLabelStyle}>Yeni Şifre</label>
              <input type="text" value={form.password || ""} onChange={(e) => handleBulkEditInputChange(key, "password", e.target.value)} placeholder="Boş bırakılırsa değişmez" style={bulkInputStyle} />
            </div>
          </div>
        </div>
      );
    }

    if (bulkEditContext.type === "students") {
      const student = item as UserInfo;
      const key = student.studentNumber !== undefined ? String(student.studentNumber) : `student-${index}`;
      const form = bulkEditForm[key] || {};
      return (
        <div key={key} style={{ padding: "16px", border: "1px solid #e2e8f0", borderRadius: "12px", backgroundColor: "#f8fafc" }}>
          <div style={{ marginBottom: "12px", fontWeight: 600, color: "#0f172a" }}>
            {student.studentNumber ? `No: ${student.studentNumber}` : "Öğrenci"} • {student.name} {student.surname}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
            <div>
              <label style={bulkLabelStyle}>Ad</label>
              <input type="text" value={form.name || ""} onChange={(e) => handleBulkEditInputChange(key, "name", e.target.value)} style={bulkInputStyle} />
            </div>
            <div>
              <label style={bulkLabelStyle}>Soyad</label>
              <input type="text" value={form.surname || ""} onChange={(e) => handleBulkEditInputChange(key, "surname", e.target.value)} style={bulkInputStyle} />
            </div>
            <div>
              <label style={bulkLabelStyle}>Sınıf</label>
              <input type="number" value={form.class || ""} onChange={(e) => handleBulkEditInputChange(key, "class", e.target.value)} style={bulkInputStyle} />
            </div>
            <div>
              <label style={bulkLabelStyle}>Şube</label>
              <input type="text" value={form.branch || ""} onChange={(e) => handleBulkEditInputChange(key, "branch", e.target.value)} style={bulkInputStyle} />
            </div>
          </div>
        </div>
      );
    }

    if (bulkEditContext.type === "books") {
      const book = item as BookEntity;
      const key = book.id;
      const form = bulkEditForm[key] || {};
      return (
        <div key={key} style={{ padding: "16px", border: "1px solid #e2e8f0", borderRadius: "12px", backgroundColor: "#f8fafc" }}>
          <div style={{ marginBottom: "12px", fontWeight: 600, color: "#0f172a" }}>
            {book.title} • {book.author}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
            <div>
              <label style={bulkLabelStyle}>Başlık</label>
              <input type="text" value={form.title || ""} onChange={(e) => handleBulkEditInputChange(key, "title", e.target.value)} style={bulkInputStyle} />
            </div>
            <div>
              <label style={bulkLabelStyle}>Yazar</label>
              <input type="text" value={form.author || ""} onChange={(e) => handleBulkEditInputChange(key, "author", e.target.value)} style={bulkInputStyle} />
            </div>
            <div>
              <label style={bulkLabelStyle}>Kategori</label>
              <input type="text" value={form.category || ""} onChange={(e) => handleBulkEditInputChange(key, "category", e.target.value)} style={bulkInputStyle} />
            </div>
            <div>
              <label style={bulkLabelStyle}>Toplam Adet</label>
              <input type="number" value={form.quantity || ""} min={0} onChange={(e) => handleBulkEditInputChange(key, "quantity", e.target.value)} style={bulkInputStyle} />
            </div>
          </div>
        </div>
      );
    }

    if (bulkEditContext.type === "loans") {
      const loan = item as LoanEntity;
      const key = String(loan.id);
      const form = bulkEditForm[key] || {};
      const bookName = loan.bookTitle || loan.book?.title || loan.bookId;
      return (
        <div key={key} style={{ padding: "16px", border: "1px solid #e2e8f0", borderRadius: "12px", backgroundColor: "#f8fafc" }}>
          <div style={{ marginBottom: "12px", fontWeight: 600, color: "#0f172a" }}>
            {bookName} • {loan.borrower}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
            <div>
              <label style={bulkLabelStyle}>Öğrenci</label>
              <input type="text" value={form.borrower || ""} onChange={(e) => handleBulkEditInputChange(key, "borrower", e.target.value)} style={bulkInputStyle} />
            </div>
            <div>
              <label style={bulkLabelStyle}>Teslim Tarihi</label>
              <input type="date" value={form.dueDate || ""} onChange={(e) => handleBulkEditInputChange(key, "dueDate", e.target.value)} style={bulkInputStyle} />
            </div>
            <div>
              <label style={bulkLabelStyle}>Personel</label>
              <input type="text" value={form.personel || ""} onChange={(e) => handleBulkEditInputChange(key, "personel", e.target.value)} placeholder="Opsiyonel" style={bulkInputStyle} />
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  useEffect(() => {
    if (activeTab === 'overview') {
      loadDatabaseInfo();
    } else if (activeTab === 'users') {
      loadUsers();
    } else if (activeTab === 'students') {
      loadStudents();
    } else if (activeTab === 'books') {
      loadBooks();
    } else if (activeTab === 'loans') {
      loadLoans();
    } else if (activeTab === 'database') {
      loadBackups();
    }
    // Sekme değiştiğinde seçim modunu sıfırla
    setSelectionMode(null);
    setSelectedBookIds(new Set());
    setSelectedStudentIds(new Set());
    setSelectedUserIds(new Set());
    setSelectedLoanIds(new Set());
  }, [activeTab]);

  const loadDatabaseInfo = async () => {
    try {
      const response = await httpClient.get<DatabaseInfo>("/admin/database/info");
      setDbInfo(response);
    } catch (error) {
      console.error("Veritabanı bilgisi yüklenemedi:", error);
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      // Sadece personelleri ve adminleri al (öğrenciler ayrı sekmede)
      const [personelResponse, usersResponse] = await Promise.all([
        httpClient.get<UserInfo[]>("/admin/personel"),
        httpClient.get<any[]>("/admin/data/users")
      ]);

      // Personelleri formatla
      const personel = personelResponse.map(u => ({
        ...u,
        role: "personel"
      }));

      // Admin kullanıcılarını da ekle
      const admins = usersResponse
        .filter(u => u.role === "ADMIN" || u.role === "Admin")
        .map(u => ({
          username: u.username,
          name: u.name || "",
          surname: u.surname || "",
          role: u.role,
          class: undefined,
          branch: undefined,
          studentNumber: undefined,
          position: undefined
        }));

      setUsers([...personel, ...admins]);
    } catch (error) {
      console.error("Kullanıcılar yüklenemedi:", error);
      console.error("Hata detayı:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadStudents = async () => {
    setLoading(true);
    try {
      const studentsResponse = await httpClient.get<UserInfo[]>("/admin/students");

      // Öğrencileri formatla
      const formattedStudents = studentsResponse.map(u => ({
        ...u,
        role: "Student",
        username: undefined // Öğrencilerde username yok
      }));

      setStudents(formattedStudents);
    } catch (error) {
      console.error("Öğrenciler yüklenemedi:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadBooks = async () => {
    setLoading(true);
    try {
      const response = await httpClient.get<BookEntity[]>("/admin/data/books");
      setBooks(response);
    } catch (error) {
      console.error("Kitaplar yüklenemedi:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadLoans = async () => {
    setLoading(true);
    try {
      const response = await httpClient.get<LoanEntity[]>("/admin/data/loans");
      setLoans(response);
    } catch (error) {
      console.error("Ödünç kayıtları yüklenemedi:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadBackups = async () => {
    try {
      const response = await httpClient.get<string[]>("/admin/database/backups");
      setBackups(response);

      // Otomatik yedekleme durumunu yükle
      try {
        const autoBackupResponse = await httpClient.get<AutoBackupStatus>("/admin/database/auto-backup/status");
        setAutoBackupStatus(autoBackupResponse);
        setAutoBackupEnabled(autoBackupResponse.enabled);
        setAutoBackupDays(autoBackupResponse.intervalDays);
      } catch (error) {
        console.error("Otomatik yedekleme durumu yüklenemedi:", error);
      }
    } catch (error) {
      console.error("Yedekler yüklenemedi:", error);
    }
  };

  const handleCreateBackup = async () => {
    try {
      const response = await httpClient.post("/admin/database/backup");
      const message = (response as any)?.message;
      showToast(message || "Yedek başarıyla oluşturuldu", "success");
      loadBackups();
      loadDatabaseInfo();
    } catch (error: any) {
      const message = error instanceof Error ? error.message : error?.response?.data?.message;
      showToast(message || "Yedek oluşturulamadı", "error");
    }
  };

  const handleRestore = async (backupPath: string) => {
    setConfirmDialog({
      title: "Yedek Geri Yükleme Onayı",
      message: "Bu yedeği geri yüklemek istediğinize emin misiniz?\n\n⚠️ Mevcut tüm veriler silinecek ve yedeğe dönülecek!\n\nBu işlem geri alınamaz.",
      icon: "⚠️",
      confirmText: "Geri Yükle",
      confirmButtonColor: "#ef4444",
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const response = await httpClient.post("/admin/database/restore", { backupPath });
          const message = (response as any)?.message;
          // showToast(message || "Yedek başarıyla geri yüklendi", "success");

          // Geri yükleme sonrası bilgilendirme penceresi
          setConfirmDialog({
            title: "Geri Yükleme Başarılı",
            message: "Veriler başarıyla geri yüklendi.\n\n⚠️ ÖNEMLİ: Değişikliklerin tam olarak yansıması için uygulamayı yeniden başlatmanız gerekmektedir.\n\nMasaüstü Uygulaması: Uygulamayı tamamen kapatıp tekrar açın.\nWeb: Backend servisini yeniden başlatın.",
            icon: "✅",
            confirmText: "Tamam",
            confirmButtonColor: "#22c55e",
            onConfirm: () => {
              setConfirmDialog(null);
              window.location.reload();
            }
          });

        } catch (error: any) {
          const message = error instanceof Error ? error.message : error?.response?.data?.message;
          showToast(message || "Yedek geri yüklenemedi", "error");
        }
      }
    });
  };

  const handleCleanOldBackups = async () => {
    setConfirmDialog({
      title: "Eski Yedekleri Temizle",
      message: `${cleanupDays} günden eski tüm yedekler kalıcı olarak silinecek.\n\nBu işlem geri alınamaz. Emin misiniz?`,
      icon: "🗑️",
      confirmText: "Temizle",
      confirmButtonColor: "#f59e0b",
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const response = await httpClient.post("/admin/database/cleanup", { daysToKeep: cleanupDays });
          const message = (response as any)?.message;
          showToast(message || "Eski yedekler temizlendi", "success");
          loadBackups();
        } catch (error: any) {
          const message = error instanceof Error ? error.message : error?.response?.data?.message;
          showToast(message || "Yedekler temizlenemedi", "error");
        }
      }
    });
  };

  const handleConfigureAutoBackup = async () => {
    try {
      const response = await httpClient.post("/admin/database/auto-backup/configure", {
        enabled: autoBackupEnabled,
        intervalDays: autoBackupDays
      });
      const message = (response as any)?.message;
      showToast(message || "Otomatik yedekleme ayarları güncellendi", "success");
      loadBackups(); // Durumu yeniden yükle
    } catch (error: any) {
      const message = error instanceof Error ? error.message : error?.response?.data?.message;
      showToast(message || "Ayarlar güncellenemedi", "error");
    }
  };

  const handleDeleteBackup = async (backupPath: string) => {
    const fileName = getBackupFileName(backupPath);

    setConfirmDialog({
      title: "Yedek Dosyasını Sil",
      message: `"${fileName}" yedek dosyasını kalıcı olarak silmek istediğinize emin misiniz?\n\nBu işlem geri alınamaz.`,
      icon: "🗑️",
      confirmText: "Sil",
      confirmButtonColor: "#ef4444",
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          await httpClient.delete(`/admin/database/backups/${encodeURIComponent(fileName)}`);
          showToast("Yedek başarıyla silindi", "success");
          loadBackups();
        } catch (error: any) {
          const message = error instanceof Error ? error.message : error?.response?.data?.message;
          showToast(message || "Yedek silinemedi", "error");
        }
      }
    });
  };

  const handleShowRecoveryCode = async () => {
    setRecoveryCodeLoading(true);
    try {
      const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
      const response: any = await httpClient.post('/auth/recovery-code/generate', { username: currentUser.username });
      setRecoveryCode(response.recoveryCode);
      setShowRecoveryCodeModal(true);
      showToast('Kurtarma kodu oluşturuldu', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Kurtarma kodu oluşturulamadı', 'error');
    } finally {
      setRecoveryCodeLoading(false);
    }
  };

  const handlePrintRecoveryCode = () => {
    const printWindow = window.open('', '', 'height=400,width=600');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Kütüphane Kurtarma Kodu</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 40px; text-align: center; }
              h1 { color: #2563eb; margin-bottom: 20px; }
              .code { font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #1e293b; margin: 30px 0; }
              .warning { color: #ef4444; font-size: 14px; margin-top: 20px; }
            </style>
          </head>
          <body>
            <h1>🔐 Kütüphane Yönetim Sistemi</h1>
            <h2>Kurtarma Kodu</h2>
            <div class="code">${recoveryCode}</div>
            <p>Bu kodu güvenli bir yerde saklayın.</p>
            <p class="warning">⚠️ Bu kod sadece bir kere kullanılabilir ve 30 gün geçerlidir.</p>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const handleChangeRole = async (username: string, role: string) => {
    try {
      await httpClient.post(`/admin/management/users/${username}/role`, { role });
      showInfo("Başarılı", "Rol başarıyla değiştirildi", "success", "✅");
      loadUsers();
      setEditMode(false);
      setSelectedUser(null);
    } catch (error: any) {
      const message = error instanceof Error ? error.message : error?.response?.data?.message;
      showInfo("Hata", message || "Rol değiştirilemedi", "error", "❌");
    }
  };

  const handleChangePassword = async (username: string, password: string) => {
    try {
      await httpClient.post(`/admin/management/users/${username}/password`, { newPassword: password });
      showInfo("Başarılı", "Şifre başarıyla değiştirildi", "success", "✅");
      setEditMode(false);
      setSelectedUser(null);
      setNewPassword("");
    } catch (error: any) {
      const message = error instanceof Error ? error.message : error?.response?.data?.message;
      showInfo("Hata", message || "Şifre değiştirilemedi", "error", "❌");
    }
  };

  const handleUpdatepersonel = async () => {
    if (!selectedUser || !selectedUser.username) {
      return;
    }
    if (!editpersonelData.name || !editpersonelData.surname) {
      alert("Ad ve soyad zorunludur");
      return;
    }
    try {
      await httpClient.put(`/admin/personel/${selectedUser.username}`, {
        name: editpersonelData.name,
        surname: editpersonelData.surname,
        position: editpersonelData.position || null,
        password: editpersonelData.password || null
      });
      setInfoCardData({
        title: "Başarılı",
        message: "Personel başarıyla güncellendi",
        type: "success",
        icon: "✅"
      });
      setShowInfoCard(true);
      setEditMode(false);
      setSelectedUser(null);
      setEditpersonelData({ name: "", surname: "", position: "", password: "" });
      loadUsers();
    } catch (error: any) {
      const message = error instanceof Error ? error.message : error?.response?.data?.message;
      setInfoCardData({
        title: "Hata",
        message: message || "Personel güncellenemedi",
        type: "error",
        icon: "❌"
      });
      setShowInfoCard(true);
    }
  };

  const handleAddStudent = async () => {
    if (!newStudent.name || !newStudent.surname || !newStudent.studentNumber) {
      showInfo("Hata", "Ad, soyad ve öğrenci numarası zorunludur", "error", "❌");
      return;
    }
    const studentNumber = parseInt(newStudent.studentNumber);
    if (isNaN(studentNumber)) {
      showInfo("Hata", "Geçerli bir öğrenci numarası giriniz", "error", "❌");
      return;
    }
    try {
      await httpClient.post("/admin/students", {
        name: newStudent.name,
        surname: newStudent.surname,
        class: newStudent.class ? parseInt(newStudent.class) : null,
        branch: newStudent.branch || null,
        studentNumber: studentNumber
      });
      showInfo("Başarılı", "Öğrenci başarıyla eklendi", "success", "✅");
      setShowAddStudent(false);
      setNewStudent({ name: "", surname: "", class: "", branch: "", studentNumber: "" });
      if (activeTab === 'students') {
        loadStudents();
      }
      loadDatabaseInfo();
    } catch (error: any) {
      const message = error instanceof Error ? error.message : error?.response?.data?.message;
      showInfo("Hata", message || "Öğrenci eklenemedi", "error", "❌");
    }
  };

  const handleAddpersonel = async () => {
    if (!newpersonel.username || !newpersonel.name || !newpersonel.surname) {
      showInfo("Hata", "Kullanıcı adı, ad ve soyad zorunludur", "error", "❌");
      return;
    }
    try {
      await httpClient.post("/admin/personel", {
        username: newpersonel.username,
        password: newpersonel.password || "1234",
        name: newpersonel.name,
        surname: newpersonel.surname,
        position: newpersonel.position || null
      });
      showInfo("Başarılı", "Personel başarıyla eklendi", "success", "✅");
      setShowAddpersonel(false);
      setNewpersonel({ username: "", password: "", name: "", surname: "", position: "" });
      loadUsers();
      loadDatabaseInfo();
    } catch (error: any) {
      const message = error instanceof Error ? error.message : error?.response?.data?.message;
      showInfo("Hata", message || "Personel eklenemedi", "error", "❌");
    }
  };

  const handleAddBook = async () => {
    if (!newBook.title || !newBook.author || !newBook.quantity) {
      showInfo("Hata", "Başlık, yazar ve miktar zorunludur", "error", "❌");
      return;
    }
    try {
      await httpClient.post("/books", {
        title: newBook.title,
        author: newBook.author,
        category: newBook.category || "Genel",
        quantity: parseInt(newBook.quantity)
      });
      showInfo("Başarılı", "Kitap başarıyla eklendi", "success", "✅");
      setShowAddBook(false);
      setNewBook({ title: "", author: "", category: "", quantity: "" });
      loadBooks();
      loadDatabaseInfo();
    } catch (error: any) {
      const message = error instanceof Error ? error.message : error?.response?.data?.message;
      showInfo("Hata", message || "Kitap eklenemedi", "error", "❌");
    }
  };

  const handleUpdateStudent = async () => {
    if (!selectedStudent || !selectedStudent.studentNumber) {
      return;
    }
    if (!editStudentData.name || !editStudentData.surname) {
      showInfo("Hata", "Ad ve soyad zorunludur", "error", "❌");
      return;
    }
    try {
      await httpClient.put(`/admin/students/${selectedStudent.studentNumber}`, {
        name: editStudentData.name,
        surname: editStudentData.surname,
        class: editStudentData.class ? parseInt(editStudentData.class) : null,
        branch: editStudentData.branch || null
      });
      setInfoCardData({
        title: "Başarılı",
        message: "Öğrenci başarıyla güncellendi",
        type: "success",
        icon: "✅"
      });
      setShowInfoCard(true);
      setEditStudentMode(false);
      setSelectedStudent(null);
      setEditStudentData({ name: "", surname: "", class: "", branch: "", studentNumber: "" });
      loadStudents();
      loadDatabaseInfo();
    } catch (error: any) {
      const message = error instanceof Error ? error.message : error?.response?.data?.message;
      setInfoCardData({
        title: "Hata",
        message: message || "Öğrenci güncellenemedi",
        type: "error",
        icon: "❌"
      });
      setShowInfoCard(true);
    }
  };

  const handleUpdateBook = async () => {
    if (!selectedBook) {
      return;
    }
    if (!editBookData.title || !editBookData.author || !editBookData.quantity) {
      showInfo("Hata", "Başlık, yazar ve miktar zorunludur", "error", "❌");
      return;
    }
    try {
      await httpClient.put(`/books/${selectedBook.id}`, {
        title: editBookData.title,
        author: editBookData.author,
        category: editBookData.category,
        totalQuantity: parseInt(editBookData.quantity)
      });
      setInfoCardData({
        title: "Başarılı",
        message: "Kitap başarıyla güncellendi",
        type: "success",
        icon: "✅"
      });
      setShowInfoCard(true);
      setEditBookMode(false);
      setSelectedBook(null);
      setEditBookData({ title: "", author: "", category: "", quantity: "" });
      loadBooks();
      loadDatabaseInfo();
    } catch (error: any) {
      const message = error instanceof Error ? error.message : error?.response?.data?.message;
      setInfoCardData({
        title: "Hata",
        message: message || "Kitap güncellenemedi",
        type: "error",
        icon: "❌"
      });
      setShowInfoCard(true);
    }
  };

  const buildBookDeletePrompt = (book: BookEntity, loansForBook: LoanEntity[]) => {
    if (loansForBook.length === 0) {
      return `${book.title} kitabını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`;
    }
    const lines = loansForBook.map(loan => {
      const dueDate = loan.dueDate ? new Date(loan.dueDate).toLocaleDateString("tr-TR") : "-";
      return `• ${loan.borrower} (Teslim: ${dueDate})`;
    });
    return [
      `${book.title} kitabı şu öğrencilerde ödünç görünüyor:`,
      ...lines,
      "",
      `${loansForBook.length} ödünç kaydı bu işlemle birlikte silinecek. Onaylıyor musunuz?`
    ].join("\n");
  };

  const deleteBookWithLoanCheck = async (
    bookId: string,
    options: { silentSuccess?: boolean; onConfirm?: () => void } = {}
  ) => {
    try {
      const latestBook = await httpClient.get<BookEntity>(`/books/${bookId}`);
      const loansForBook = Array.isArray(latestBook.loans) ? latestBook.loans : [];

      if (loansForBook.length > 0) {
        // Ödünç varsa onay kartını göster
        setBookToDelete({ book: latestBook, loans: loansForBook });
        setShowBookDeleteConfirm(true);
        // onConfirm callback'i kaydet
        if (options.onConfirm) {
          (window as any).__bookDeleteOnConfirm = options.onConfirm;
        }
        return false; // Henüz silinmedi
      }

      // Ödünç yoksa direkt sil
      await httpClient.delete(`/books/${bookId}?personelName=Admin`);
      if (!options.silentSuccess) {
        showInfo("Başarılı", `${latestBook.title} kitabı silindi`, "success", "✅");
      }
      return true;
    } catch (error: any) {
      const message = error instanceof Error ? error.message : error?.response?.data?.message;
      showInfo("Hata", message || "Kitap silme işlemi başarısız oldu", "error", "❌");
      return false;
    }
  };

  const confirmBookDelete = async () => {
    if (!bookToDelete) return;

    setDeleteLoading(true);
    try {
      await httpClient.delete(`/books/${bookToDelete.book.id}?personelName=Admin`);
      showInfo(
        "Başarılı",
        bookToDelete.loans.length > 0
          ? `${bookToDelete.book.title} ve ${bookToDelete.loans.length} ödünç kaydı silindi`
          : `${bookToDelete.book.title} kitabı silindi`,
        "success",
        "✅"
      );
      const bookId = bookToDelete.book.id;
      setShowBookDeleteConfirm(false);
      setBookToDelete(null);
      loadBooks();
      loadDatabaseInfo();
      // Callback'i çağır
      if ((window as any).__bookDeleteOnConfirm) {
        (window as any).__bookDeleteOnConfirm();
        delete (window as any).__bookDeleteOnConfirm;
      }
    } catch (error: any) {
      const message = error instanceof Error ? error.message : error?.response?.data?.message;
      showInfo("Hata", message || "Kitap silme işlemi başarısız oldu", "error", "❌");
    } finally {
      setDeleteLoading(false);
    }
  };

  const cancelBookDelete = () => {
    setShowBookDeleteConfirm(false);
    setBookToDelete(null);
    if ((window as any).__bookDeleteOnConfirm) {
      delete (window as any).__bookDeleteOnConfirm;
    }
  };

  const normalizeStudentName = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();

  const formatStudentDisplayName = (student: UserInfo) => {
    const base = `${student.name || ""} ${student.surname || ""}`.trim();
    if (base) {
      return base;
    }
    if (student.studentNumber) {
      return `Öğrenci No: ${student.studentNumber}`;
    }
    return "Bilinmeyen Öğrenci";
  };

  const buildStudentLoanPrompt = (studentName: string, loansForStudent: LoanInfo[]) => {
    const lines = loansForStudent.map(loan => {
      const dueDate = loan.dueDate ? new Date(loan.dueDate).toLocaleDateString("tr-TR") : "-";
      return `• ${loan.title} (Teslim: ${dueDate})`;
    });
    return [
      `${studentName} öğrencisinin teslim edilmemiş ${loansForStudent.length} kitabı var:`,
      ...lines,
      "",
      "Bu öğrenci ve bağlı ödünç kayıtları silinecek. Onaylıyor musunuz?"
    ].join("\n");
  };

  const ensureStudentDeletionConfirmation = async (targetStudents: UserInfo[]): Promise<boolean> => {
    if (targetStudents.length === 0) {
      return true;
    }

    const latestLoans = await httpClient.get<LoanInfo[]>("/books/loans");
    const loansByBorrower = new Map<string, LoanInfo[]>();
    latestLoans.forEach(loan => {
      const key = normalizeStudentName(loan.borrower || "");
      if (!key) return;
      if (!loansByBorrower.has(key)) {
        loansByBorrower.set(key, []);
      }
      loansByBorrower.get(key)!.push(loan);
    });

    const studentsWithLoans = targetStudents.map(student => {
      const displayName = formatStudentDisplayName(student);
      const nameKey = normalizeStudentName(`${student.name || ""} ${student.surname || ""}`);
      const fallbackKey = nameKey || normalizeStudentName(student.name || student.surname || "");
      const lookupKey = fallbackKey;
      const loansForStudent = lookupKey ? (loansByBorrower.get(lookupKey) || []) : [];
      return { student, displayName, loansForStudent };
    }).filter(entry => entry.loansForStudent.length > 0);

    if (studentsWithLoans.length === 0) {
      return true;
    }

    // Ödünç varsa onay kartını göster
    return new Promise<boolean>((resolve) => {
      setStudentToDelete({ students: targetStudents, loansByStudent: loansByBorrower });
      setShowStudentDeleteConfirm(true);
      (window as any).__studentDeleteResolve = resolve;
    });
  };

  const confirmStudentDelete = async () => {
    if (!studentToDelete) return;

    setDeleteLoading(true);
    try {
      setShowStudentDeleteConfirm(false);
      const students = studentToDelete.students;
      setStudentToDelete(null);
      if ((window as any).__studentDeleteResolve) {
        (window as any).__studentDeleteResolve(true);
        delete (window as any).__studentDeleteResolve;
      }
    } catch (error: any) {
      const message = error instanceof Error ? error.message : error?.response?.data?.message;
      alert(message || "Öğrenci silme işlemi başarısız oldu");
      if ((window as any).__studentDeleteResolve) {
        (window as any).__studentDeleteResolve(false);
        delete (window as any).__studentDeleteResolve;
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const cancelStudentDelete = () => {
    setShowStudentDeleteConfirm(false);
    setStudentToDelete(null);
    if ((window as any).__studentDeleteResolve) {
      (window as any).__studentDeleteResolve(false);
      delete (window as any).__studentDeleteResolve;
    }
  };

  const handleDeleteUser = async (identifier: string, role: string) => {
    if (role !== "Student") {
      const confirmed = await new Promise<boolean>((resolve) => {
        setInfoCardData({
          title: "Kullanıcı Silme Onayı",
          message: `${identifier} ${role === "Student" ? "öğrencisini" : "kullanıcısını"} silmek istediğinize emin misiniz?`,
          type: "warning",
          icon: "⚠️"
        });
        setShowInfoCard(true);
        (window as any).__userDeleteConfirm = resolve;
      });
      if (!confirmed) return;
    }
    try {
      if (role === "Student") {
        const studentRecord = students.find(student => String(student.studentNumber) === identifier);
        const allowed = await ensureStudentDeletionConfirmation(studentRecord ? [studentRecord] : []);
        if (!allowed) {
          return;
        }
        // Onay verildiyse silme işlemini yap
        await httpClient.delete(`/admin/students/${identifier}`);
        showInfo("Başarılı", "Kullanıcı başarıyla silindi", "success", "✅");
        if (activeTab === 'students') {
          loadStudents();
        } else {
          loadUsers();
        }
        loadDatabaseInfo();
      } else if (role === "personel") {
        await httpClient.delete(`/admin/personel/${identifier}`);
        showInfo("Başarılı", "Kullanıcı başarıyla silindi", "success", "✅");
        if (activeTab === 'students') {
          loadStudents();
        } else {
          loadUsers();
        }
        loadDatabaseInfo();
      }
    } catch (error: any) {
      const message = error instanceof Error ? error.message : error?.response?.data?.message;
      showInfo("Hata", message || "Kullanıcı silinemedi", "error", "❌");
    }
  };

  const handleDeleteBook = async (bookId: string) => {
    await deleteBookWithLoanCheck(bookId, {
      onConfirm: () => {
        // Zaten confirmBookDelete içinde loadBooks ve loadDatabaseInfo çağrılıyor
      }
    });
  };

  const handleReturnLoan = async (bookId: string, borrower: string) => {
    const confirmed = await new Promise<boolean>((resolve) => {
      setInfoCardData({
        title: "Kitap İade Onayı",
        message: `${borrower} adlı öğrencinin ödüncünü iade etmek istediğinize emin misiniz?`,
        type: "warning",
        icon: "⚠️"
      });
      setShowInfoCard(true);
      (window as any).__returnLoanConfirm = resolve;
    });
    if (!confirmed) return;

    try {
      await httpClient.post(`/books/${bookId}/return`, {
        borrower: borrower,
        personelName: "Admin" // Admin panelinden yapılan işlemler
      });
      showInfo("Başarılı", "Kitap başarıyla iade edildi", "success", "✅");
      loadLoans();
      loadBooks();
      loadDatabaseInfo();
    } catch (error: any) {
      const message = error instanceof Error ? error.message : error?.response?.data?.message;
      showInfo("Hata", message || "Kitap iade edilemedi", "error", "❌");
    }
  };

  const handleBulkDeleteBooks = async () => {
    if (selectedBookIds.size === 0) return;

    const selectedBooks = books.filter(b => selectedBookIds.has(b.id));
    const latestLoans = await httpClient.get<LoanInfo[]>("/books/loans");

    // Ödünç listesi olan kitapları bul
    const booksWithLoans = selectedBooks.map(book => {
      const bookLoans = latestLoans.filter(l => l.bookId === book.id);
      return {
        id: book.id,
        name: `${book.title} - ${book.author}`,
        loans: bookLoans
      };
    }).filter(item => item.loans.length > 0);

    // Eğer ödünç listesi olan kitaplar varsa, detaylı onay kartını göster
    if (booksWithLoans.length > 0) {
      setBulkDeleteData({
        type: "books",
        items: booksWithLoans,
        selectedItems: new Set(selectedBookIds)
      });
      setShowBulkDeleteDetail(true);
      return;
    }

    // Ödünç yoksa direkt sil
    await executeBulkDeleteBooks(selectedBookIds);
  };

  const executeBulkDeleteBooks = async (bookIdsToDelete: Set<string>) => {
    let deletedCount = 0;
    const bookIdsArray = Array.from(bookIdsToDelete);

    for (const bookId of bookIdsArray) {
      try {
        await httpClient.delete(`/books/${bookId}?personelName=Admin`);
        deletedCount++;
      } catch (error: any) {
        const message = error instanceof Error ? error.message : error?.response?.data?.message;
        showInfo("Hata", `${message || "Kitap silinemedi"}`, "error", "❌");
      }
    }

    if (deletedCount > 0) {
      showInfo("Başarılı", `${deletedCount} kitap başarıyla silindi`, "success", "✅");
      setSelectionMode(null);
      setSelectedBookIds(new Set());
      loadBooks();
      loadDatabaseInfo();
    }
  };

  const handleBulkDeleteStudents = async () => {
    if (selectedStudentIds.size === 0) return;
    const targetStudents = students.filter(student =>
      typeof student.studentNumber === "number" && selectedStudentIds.has(student.studentNumber)
    );
    if (targetStudents.length === 0) {
      showInfo("Hata", "Silinecek öğrenciler bulunamadı", "error", "❌");
      return;
    }

    const latestLoans = await httpClient.get<LoanInfo[]>("/books/loans");
    const loansByBorrower = new Map<string, LoanInfo[]>();
    latestLoans.forEach(loan => {
      const key = normalizeStudentName(loan.borrower || "");
      if (!key) return;
      if (!loansByBorrower.has(key)) {
        loansByBorrower.set(key, []);
      }
      loansByBorrower.get(key)!.push(loan);
    });

    // Ödünç listesi olan öğrencileri bul
    const studentsWithLoans = targetStudents.map(student => {
      const displayName = formatStudentDisplayName(student);
      const nameKey = normalizeStudentName(`${student.name || ""} ${student.surname || ""}`);
      const fallbackKey = nameKey || normalizeStudentName(student.name || student.surname || "");
      const lookupKey = fallbackKey;
      const loansForStudent = lookupKey ? (loansByBorrower.get(lookupKey) || []) : [];
      return {
        id: student.studentNumber!,
        name: displayName,
        loans: loansForStudent
      };
    }).filter(item => item.loans.length > 0);

    // Eğer ödünç listesi olan öğrenciler varsa, detaylı onay kartını göster
    if (studentsWithLoans.length > 0) {
      setBulkDeleteData({
        type: "students",
        items: studentsWithLoans,
        selectedItems: new Set(selectedStudentIds)
      });
      setShowBulkDeleteDetail(true);
      return;
    }

    // Ödünç yoksa direkt sil
    await executeBulkDeleteStudents(selectedStudentIds);
  };

  const executeBulkDeleteStudents = async (studentIdsToDelete: Set<number>) => {
    try {
      for (const studentNumber of studentIdsToDelete) {
        const num = Number(studentNumber);
        if (!Number.isNaN(num)) {
          await httpClient.delete(`/admin/students/${num}`);
        }
      }
      showInfo("Başarılı", `${studentIdsToDelete.size} öğrenci başarıyla silindi`, "success", "✅");
      setSelectionMode(null);
      setSelectedStudentIds(new Set());
      loadStudents();
      loadDatabaseInfo();
    } catch (error: any) {
      const message = error instanceof Error ? error.message : error?.response?.data?.message;
      showInfo("Hata", message || "Öğrenciler silinemedi", "error", "❌");
    }
  };

  const handleBulkDeleteUsers = async () => {
    if (selectedUserIds.size === 0) return;
    const confirmed = await new Promise<boolean>((resolve) => {
      setInfoCardData({
        title: "Toplu Kullanıcı Silme Onayı",
        message: `${selectedUserIds.size} kullanıcıyı silmek istediğinize emin misiniz?`,
        type: "warning",
        icon: "⚠️"
      });
      setShowInfoCard(true);
      (window as any).__bulkDeleteUsersConfirm = resolve;
    });
    if (!confirmed) return;

    try {
      for (const username of selectedUserIds) {
        // Kullanıcının rolünü bul
        const user = users.find(u => u.username === username);
        if (user && user.role !== "ADMIN" && user.role !== "Admin") {
          await httpClient.delete(`/admin/personel/${username}`);
        }
      }
      showInfo("Başarılı", `${selectedUserIds.size} kullanıcı başarıyla silindi`, "success", "✅");
      setSelectionMode(null);
      setSelectedUserIds(new Set());
      loadUsers();
      loadDatabaseInfo();
    } catch (error: any) {
      const message = error instanceof Error ? error.message : error?.response?.data?.message;
      showInfo("Hata", message || "Kullanıcılar silinemedi", "error", "❌");
    }
  };

  const handleBulkReturnLoans = async () => {
    if (selectedLoanIds.size === 0) return;
    const confirmed = await new Promise<boolean>((resolve) => {
      setInfoCardData({
        title: "Toplu İade Onayı",
        message: `${selectedLoanIds.size} ödünç kaydını iade etmek istediğinize emin misiniz?`,
        type: "warning",
        icon: "⚠️"
      });
      setShowInfoCard(true);
      (window as any).__bulkReturnLoansConfirm = resolve;
    });
    if (!confirmed) return;

    try {
      for (const loanId of selectedLoanIds) {
        const loan = loans.find(l => l.id === loanId);
        if (loan) {
          await httpClient.post(`/books/${loan.bookId}/return`, {
            borrower: loan.borrower,
            personelName: "Admin"
          });
        }
      }
      showInfo("Başarılı", `${selectedLoanIds.size} ödünç kaydı başarıyla iade edildi`, "success", "✅");
      setSelectionMode(null);
      setSelectedLoanIds(new Set());
      loadLoans();
      loadBooks();
      loadDatabaseInfo();
    } catch (error: any) {
      const message = error instanceof Error ? error.message : error?.response?.data?.message;
      showInfo("Hata", message || "Ödünç kayıtları iade edilemedi", "error", "❌");
    }
  };

  const handleUpdateLoan = async () => {
    if (!selectedLoan) {
      return;
    }
    if (!editLoanData.borrower || !editLoanData.dueDate) {
      alert("Öğrenci adı ve teslim tarihi zorunludur");
      return;
    }
    try {
      // Ödünç kaydını güncellemek için önce iade edip sonra yeniden ödünç ver
      await httpClient.post(`/books/${selectedLoan.bookId}/return`, {
        borrower: selectedLoan.borrower,
        personelName: editLoanData.personel || "Admin"
      });

      // Yeni ödünç kaydı oluştur
      const dueDate = new Date(editLoanData.dueDate);
      const days = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      await httpClient.post(`/books/${selectedLoan.bookId}/borrow`, {
        borrower: editLoanData.borrower,
        days: days > 0 ? days : 7,
        personelName: editLoanData.personel || "Admin"
      });

      alert("Ödünç kaydı başarıyla güncellendi");
      setEditLoanMode(false);
      setSelectedLoan(null);
      setEditLoanData({ borrower: "", dueDate: "", personel: "" });
      loadLoans();
      loadBooks();
      loadDatabaseInfo();
    } catch (error: any) {
      const message = error instanceof Error ? error.message : error?.response?.data?.message;
      alert(message || "Ödünç kaydı güncellenemedi");
    }
  };

  return (
    <>
      {/* Toast Container */}
      <div className="toast-container">
        {toasts.map(toast => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>

      <div className="admin-panel">
        <div className="admin-header">
          <h1>🔧 Admin Paneli</h1>
          <p>Veritabanı Yönetim ve Kontrol Paneli</p>
        </div>

        <div className="admin-tabs">
          <button
            className={activeTab === 'overview' ? 'active' : ''}
            onClick={() => setActiveTab('overview')}
          >
            <HomeIcon />
            <span>Genel Bakış</span>
          </button>
          <button
            className={activeTab === 'users' ? 'active' : ''}
            onClick={() => setActiveTab('users')}
          >
            <StudentIcon />
            <span>Kullanıcılar</span>
          </button>
          <button
            className={activeTab === 'students' ? 'active' : ''}
            onClick={() => setActiveTab('students')}
          >
            <StudentIcon />
            <span>Öğrenciler</span>
          </button>
          <button
            className={activeTab === 'books' ? 'active' : ''}
            onClick={() => setActiveTab('books')}
          >
            <BookIcon />
            <span>Kitaplar</span>
          </button>
          <button
            className={activeTab === 'loans' ? 'active' : ''}
            onClick={() => setActiveTab('loans')}
          >
            <LoanListIcon />
            <span>Ödünçler</span>
          </button>
          <button
            className={activeTab === 'database' ? 'active' : ''}
            onClick={() => setActiveTab('database')}
          >
            <DatabaseIcon />
            <span>Veritabanı</span>
          </button>
        </div>

        <div className="admin-content">
          {activeTab === 'overview' && dbInfo && (
            <div className="overview-grid">
              <div className="stat-card stat-card-books" onClick={() => setActiveTab('books')}>
                <div className="stat-icon">
                  <BookIcon />
                </div>
                <h3>Kitaplar</h3>
                <p className="stat-number">{dbInfo.bookCount}</p>
              </div>
              <div className="stat-card stat-card-users" onClick={() => setActiveTab('users')}>
                <div className="stat-icon">
                  <StudentIcon />
                </div>
                <h3>Kullanıcılar</h3>
                <p className="stat-number">{dbInfo.userCount}</p>
              </div>
              <div className="stat-card stat-card-loans" onClick={() => setActiveTab('loans')}>
                <div className="stat-icon">
                  <LoanListIcon />
                </div>
                <h3>Ödünçler</h3>
                <p className="stat-number">{dbInfo.loanCount}</p>
              </div>
              <div className="stat-card stat-card-students" onClick={() => setActiveTab('students')}>
                <div className="stat-icon">
                  <StudentIcon />
                </div>
                <h3>Öğrenciler</h3>
                <p className="stat-number">{dbInfo.studentCount}</p>
              </div>
              <div className="stat-card stat-card-personel" onClick={() => setActiveTab('users')}>
                <div className="stat-icon">
                  <StudentIcon />
                </div>
                <h3>Personeller</h3>
                <p className="stat-number">{dbInfo.personelCount}</p>
              </div>
              <div className="stat-card stat-card-admins">
                <div className="stat-icon">
                  <DatabaseIcon />
                </div>
                <h3>Adminler</h3>
                <p className="stat-number">{dbInfo.adminCount}</p>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="users-table">
              <div className="action-buttons">
                <button
                  className={`btn-add ${showAddpersonel ? 'active' : ''}`}
                  onClick={() => {
                    setShowAddpersonel(true);
                  }}
                >
                  ➕ Yeni Personel Ekle
                </button>
                <button
                  className="btn-upload"
                  onClick={() => {
                    setShowPersonelImportCard(true);
                    setShowPersonelUploadModal(true);
                  }}
                >
                  <ImportIcon />
                  <span>Excel/CSV ile Ekle</span>
                </button>
                <button
                  className={`btn-select ${selectionMode === 'users' ? 'active' : ''}`}
                  onClick={() => {
                    if (selectionMode === 'users') {
                      setSelectionMode(null);
                      setSelectedUserIds(new Set());
                    } else {
                      setSelectionMode('users');
                    }
                  }}
                >
                  {selectionMode === 'users' ? "✕ Seçimi İptal" : "✓ Seç"}
                </button>
                {selectionMode === 'users' && selectedUserIds.size > 0 && (
                  <>
                    <button
                      className="btn-edit-bulk"
                      onClick={() => {
                        const selectedUsers = users.filter(u => u.username && selectedUserIds.has(u.username));
                        if (selectedUsers.length === 1) {
                          setSelectedUser(selectedUsers[0]);
                          setEditMode(true);
                          setEditpersonelData({
                            name: selectedUsers[0].name || "",
                            surname: selectedUsers[0].surname || "",
                            position: selectedUsers[0].position || "",
                            password: ""
                          });
                        } else if (selectedUsers.length > 1) {
                          const initialData = selectedUsers.reduce<Record<string, any>>((acc, user) => {
                            if (user.username) {
                              acc[user.username] = {
                                name: user.name || "",
                                surname: user.surname || "",
                                position: user.position || "",
                                password: ""
                              };
                            }
                            return acc;
                          }, {});
                          setBulkEditContext({ type: "users", items: selectedUsers });
                          setBulkEditForm(initialData);
                          setBulkEditError(null);
                          setShowBulkEditModal(true);
                        }
                      }}
                    >
                      <span className="btn-icon">
                        <EditIcon />
                      </span>
                      <span>Seçilenleri Düzenle ({selectedUserIds.size})</span>
                    </button>
                    <button
                      className="btn-delete-bulk"
                      onClick={handleBulkDeleteUsers}
                    >
                      <span className="btn-icon">
                        <TrashIcon />
                      </span>
                      <span>Seçilenleri Sil ({selectedUserIds.size})</span>
                    </button>
                  </>
                )}
              </div>


              {showAddpersonel && (
                <div className="add-modal">
                  <h3>Yeni Personel Ekle</h3>
                  <div className="add-form">
                    <div>
                      <label>Kullanıcı Adı *</label>
                      <input
                        type="text"
                        value={newpersonel.username}
                        onChange={(e) => setNewpersonel({ ...newpersonel, username: e.target.value })}
                        placeholder="Kullanıcı adı"
                      />
                    </div>
                    <div>
                      <label>Şifre</label>
                      <input
                        type="password"
                        value={newpersonel.password}
                        onChange={(e) => setNewpersonel({ ...newpersonel, password: e.target.value })}
                        placeholder="Boş bırakılırsa: 1234"
                      />
                    </div>
                    <div>
                      <label>Ad *</label>
                      <input
                        type="text"
                        value={newpersonel.name}
                        onChange={(e) => setNewpersonel({ ...newpersonel, name: e.target.value })}
                        placeholder="Personel adı"
                      />
                    </div>
                    <div>
                      <label>soyad *</label>
                      <input
                        type="text"
                        value={newpersonel.surname}
                        onChange={(e) => setNewpersonel({ ...newpersonel, surname: e.target.value })}
                        placeholder="Personel soyadı"
                      />
                    </div>
                    <div>
                      <label>Görev</label>
                      <input
                        type="text"
                        value={newpersonel.position}
                        onChange={(e) => setNewpersonel({ ...newpersonel, position: e.target.value })}
                        placeholder="Pozisyon (opsiyonel)"
                      />
                    </div>
                    <div className="form-actions">
                      <button className="btn-save" onClick={handleAddpersonel}>
                        Kaydet
                      </button>
                      <button className="btn-cancel" onClick={() => {
                        setShowAddpersonel(false);
                        setNewpersonel({ username: "", password: "", name: "", surname: "", position: "" });
                      }}>
                        İptal
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {loading ? (
                <p>Yükleniyor...</p>
              ) : users.length === 0 ? (
                <p className="empty-message">Henüz kullanıcı eklenmemiş. Yukarıdaki butona tıklayarak personel ekleyebilirsiniz.</p>
              ) : (
                <>
                  <table>
                    <thead>
                      <tr>
                        <th>Kullanıcı Adı</th>
                        <th>Ad</th>
                        <th>soyad</th>
                        <th>Rol</th>
                        <th>Pozisyon</th>
                        {/* selectionMode !== 'users' col removed */}
                        {selectionMode === 'users' && (
                          <th style={{ width: "60px", textAlign: "center" }}>
                            <div
                              className={`selection-checkbox ${users.filter(u => u.role !== "ADMIN" && u.role !== "Admin" && u.username).length > 0 && users.filter(u => u.role !== "ADMIN" && u.role !== "Admin" && u.username).every(u => u.username && selectedUserIds.has(u.username)) ? 'selected' : ''}`}
                              onClick={() => {
                                const selectableUsers = users.filter(u => u.role !== "ADMIN" && u.role !== "Admin" && u.username);
                                const allSelected = selectableUsers.every(u => u.username && selectedUserIds.has(u.username));
                                const newSelected = new Set(selectedUserIds);
                                if (allSelected) {
                                  selectableUsers.forEach(u => {
                                    if (u.username) newSelected.delete(u.username);
                                  });
                                } else {
                                  selectableUsers.forEach(u => {
                                    if (u.username) newSelected.add(u.username);
                                  });
                                }
                                setSelectedUserIds(newSelected);
                              }}
                              style={{ cursor: "pointer", display: "inline-block" }}
                            >
                              {users.filter(u => u.role !== "ADMIN" && u.role !== "Admin" && u.username).length > 0 && users.filter(u => u.role !== "ADMIN" && u.role !== "Admin" && u.username).every(u => u.username && selectedUserIds.has(u.username)) && (
                                <span>✓</span>
                              )}
                            </div>
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user, index) => (
                        <tr key={user.username || `user-${index}`}>
                          <td>{user.username || "-"}</td>
                          <td>{user.name || "-"}</td>
                          <td>{user.surname || "-"}</td>
                          <td>
                            <span className={`role-badge role-${user.role.toLowerCase()}`}>
                              {user.role === "ADMIN" || user.role === "Admin" ? "Admin" : "Personel"}
                            </span>
                          </td>
                          <td>{user.position || "-"}</td>

                          {/* actions col removed */}

                          {selectionMode === 'users' && (
                            <td onClick={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
                              {user.role !== "ADMIN" && user.role !== "Admin" && user.username && (
                                <div
                                  className={`selection-checkbox ${selectedUserIds.has(user.username!) ? 'selected' : ''}`}
                                  onClick={() => {
                                    const newSelected = new Set(selectedUserIds);
                                    if (selectedUserIds.has(user.username!)) {
                                      newSelected.delete(user.username!);
                                    } else {
                                      newSelected.add(user.username!);
                                    }
                                    setSelectedUserIds(newSelected);
                                  }}
                                >
                                  {selectedUserIds.has(user.username!) && (
                                    <span>✓</span>
                                  )}
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {editMode && selectedUser && selectedUser.username && (
                    <div className="edit-modal">
                      <h3>Personel Düzenle: {selectedUser.username}</h3>
                      <div className="edit-form">
                        <div>
                          <label>Ad *</label>
                          <input
                            type="text"
                            value={editpersonelData.name}
                            onChange={(e) => setEditpersonelData({ ...editpersonelData, name: e.target.value })}
                            placeholder="Personel adı"
                          />
                        </div>
                        <div>
                          <label>soyad *</label>
                          <input
                            type="text"
                            value={editpersonelData.surname}
                            onChange={(e) => setEditpersonelData({ ...editpersonelData, surname: e.target.value })}
                            placeholder="Personel soyadı"
                          />
                        </div>
                        <div>
                          <label>Pozisyon</label>
                          <input
                            type="text"
                            value={editpersonelData.position}
                            onChange={(e) => setEditpersonelData({ ...editpersonelData, position: e.target.value })}
                            placeholder="Pozisyon (opsiyonel)"
                          />
                        </div>
                        <div>
                          <label>Yeni Şifre</label>
                          <input
                            type="password"
                            value={editpersonelData.password}
                            onChange={(e) => setEditpersonelData({ ...editpersonelData, password: e.target.value })}
                            placeholder="Boş bırakılırsa değiştirilmez"
                          />
                        </div>
                        <div className="form-actions">
                          <button className="btn-save" onClick={handleUpdatepersonel}>
                            Güncelle
                          </button>
                          <button className="btn-cancel" onClick={() => {
                            setEditMode(false);
                            setSelectedUser(null);
                            setEditpersonelData({ name: "", surname: "", position: "", password: "" });
                          }}>
                            İptal
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'students' && (
            <div className="students-table">
              <div className="action-buttons">
                <button
                  className={`btn-add ${showAddStudent ? 'active' : ''}`}
                  onClick={() => {
                    setShowAddStudent(true);
                  }}
                >
                  ➕ Yeni Öğrenci Ekle
                </button>
                <button
                  className={`btn-select ${selectionMode === 'students' ? 'active' : ''}`}
                  onClick={() => {
                    if (selectionMode === 'students') {
                      setSelectionMode(null);
                      setSelectedStudentIds(new Set());
                    } else {
                      setSelectionMode('students');
                    }
                  }}
                >
                  {selectionMode === 'students' ? "✕ Seçimi İptal" : "✓ Seç"}
                </button>
                {selectionMode === 'students' && selectedStudentIds.size > 0 && (
                  <>
                    <button
                      className="btn-edit-bulk"
                      onClick={() => {
                        const selectedStudents = students.filter(s => s.studentNumber && selectedStudentIds.has(s.studentNumber));
                        if (selectedStudents.length === 1) {
                          setSelectedStudent(selectedStudents[0]);
                          setEditStudentMode(true);
                          setEditStudentData({
                            name: selectedStudents[0].name || "",
                            surname: selectedStudents[0].surname || "",
                            class: selectedStudents[0].class?.toString() || "",
                            branch: selectedStudents[0].branch || "",
                            studentNumber: selectedStudents[0].studentNumber?.toString() || ""
                          });
                        } else if (selectedStudents.length > 1) {
                          const initialData = selectedStudents.reduce<Record<string, any>>((acc, student) => {
                            if (student.studentNumber !== undefined) {
                              acc[String(student.studentNumber)] = {
                                name: student.name || "",
                                surname: student.surname || "",
                                class: student.class?.toString() || "",
                                branch: student.branch || "",
                              };
                            }
                            return acc;
                          }, {});
                          setBulkEditContext({ type: "students", items: selectedStudents });
                          setBulkEditForm(initialData);
                          setBulkEditError(null);
                          setShowBulkEditModal(true);
                        }
                      }}
                    >
                      <span className="btn-icon">
                        <EditIcon />
                      </span>
                      <span>Seçilenleri Düzenle ({selectedStudentIds.size})</span>
                    </button>
                    <button
                      className="btn-delete-bulk"
                      onClick={handleBulkDeleteStudents}
                    >
                      <span className="btn-icon">
                        <TrashIcon />
                      </span>
                      <span>Seçilenleri Sil ({selectedStudentIds.size})</span>
                    </button>
                  </>
                )}
              </div>

              {showAddStudent && (
                <div className="add-modal">
                  <h3>Yeni Öğrenci Ekle</h3>
                  <div className="add-form">
                    <div>
                      <label>Ad *</label>
                      <input
                        type="text"
                        value={newStudent.name}
                        onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
                        placeholder="Öğrenci adı"
                      />
                    </div>
                    <div>
                      <label>soyad *</label>
                      <input
                        type="text"
                        value={newStudent.surname}
                        onChange={(e) => setNewStudent({ ...newStudent, surname: e.target.value })}
                        placeholder="Öğrenci soyadı"
                      />
                    </div>
                    <div>
                      <label>Öğrenci Numarası *</label>
                      <input
                        type="number"
                        value={newStudent.studentNumber}
                        onChange={(e) => setNewStudent({ ...newStudent, studentNumber: e.target.value })}
                        placeholder="Öğrenci numarası"
                      />
                    </div>
                    <div>
                      <label>Sınıf</label>
                      <select
                        value={newStudent.class}
                        onChange={(e) => setNewStudent({ ...newStudent, class: e.target.value })}
                      >
                        <option value="">Seçiniz (Opsiyonel)</option>
                        <option value="9">9</option>
                        <option value="10">10</option>
                        <option value="11">11</option>
                        <option value="12">12</option>
                      </select>
                    </div>
                    <div>
                      <label>Şube</label>
                      <select
                        value={newStudent.branch}
                        onChange={(e) => setNewStudent({ ...newStudent, branch: e.target.value })}
                      >
                        <option value="">Seçiniz (Opsiyonel)</option>
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                        <option value="E">E</option>
                        <option value="F">F</option>
                      </select>
                    </div>
                    <div className="form-actions">
                      <button className="btn-save" onClick={handleAddStudent}>
                        Kaydet
                      </button>
                      <button className="btn-cancel" onClick={() => {
                        setShowAddStudent(false);
                        setNewStudent({ name: "", surname: "", class: "", branch: "", studentNumber: "" });
                      }}>
                        İptal
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {loading ? (
                <p>Yükleniyor...</p>
              ) : students.length === 0 ? (
                <p className="empty-message">Henüz öğrenci eklenmemiş. Yukarıdaki butona tıklayarak öğrenci ekleyebilirsiniz.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Öğrenci Numarası</th>
                      <th>Ad</th>
                      <th>soyad</th>
                      <th>Sınıf</th>
                      <th>Şube</th>
                      <th>Ceza Puanı</th>
                      {selectionMode === 'students' && (
                        <th style={{ width: "60px", textAlign: "center" }}>
                          <div
                            className={`selection-checkbox ${students.filter(s => s.studentNumber).length > 0 && students.filter(s => s.studentNumber).every(s => s.studentNumber && selectedStudentIds.has(s.studentNumber)) ? 'selected' : ''}`}
                            onClick={() => {
                              const selectableStudents = students.filter(s => s.studentNumber);
                              const allSelected = selectableStudents.every(s => s.studentNumber && selectedStudentIds.has(s.studentNumber));
                              const newSelected = new Set(selectedStudentIds);
                              if (allSelected) {
                                selectableStudents.forEach(s => {
                                  if (s.studentNumber) newSelected.delete(s.studentNumber);
                                });
                              } else {
                                selectableStudents.forEach(s => {
                                  if (s.studentNumber) newSelected.add(s.studentNumber);
                                });
                              }
                              setSelectedStudentIds(newSelected);
                            }}
                            style={{ cursor: "pointer", display: "inline-block" }}
                          >
                            {students.filter(s => s.studentNumber).length > 0 && students.filter(s => s.studentNumber).every(s => s.studentNumber && selectedStudentIds.has(s.studentNumber)) && (
                              <span>✓</span>
                            )}
                          </div>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student, index) => (
                      <tr key={`student-${index}-${student.studentNumber}`}>
                        <td>{student.studentNumber || "-"}</td>
                        <td>{student.name || "-"}</td>
                        <td>{student.surname || "-"}</td>
                        <td>{student.class || "-"}</td>
                        <td>{student.branch || "-"}</td>
                        <td>{student.penaltyPoints || 0}</td>

                        {/* actions col removed */}

                        {selectionMode === 'students' && (
                          <td onClick={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
                            {student.studentNumber && (
                              <div
                                className={`selection-checkbox ${selectedStudentIds.has(student.studentNumber!) ? 'selected' : ''}`}
                                onClick={() => {
                                  const newSelected = new Set(selectedStudentIds);
                                  if (selectedStudentIds.has(student.studentNumber!)) {
                                    newSelected.delete(student.studentNumber!);
                                  } else {
                                    newSelected.add(student.studentNumber!);
                                  }
                                  setSelectedStudentIds(newSelected);
                                }}
                              >
                                {selectedStudentIds.has(student.studentNumber!) && (
                                  <span>✓</span>
                                )}
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {editStudentMode && selectedStudent && (
                <div className="edit-modal">
                  <h3>Öğrenci Düzenle: {selectedStudent.studentNumber}</h3>
                  <div className="edit-form">
                    <div>
                      <label>Ad *</label>
                      <input
                        type="text"
                        value={editStudentData.name}
                        onChange={(e) => setEditStudentData({ ...editStudentData, name: e.target.value })}
                        placeholder="Öğrenci adı"
                      />
                    </div>
                    <div>
                      <label>soyad *</label>
                      <input
                        type="text"
                        value={editStudentData.surname}
                        onChange={(e) => setEditStudentData({ ...editStudentData, surname: e.target.value })}
                        placeholder="Öğrenci soyadı"
                      />
                    </div>
                    <div>
                      <label>Sınıf</label>
                      <select
                        value={editStudentData.class}
                        onChange={(e) => setEditStudentData({ ...editStudentData, class: e.target.value })}
                      >
                        <option value="">Seçiniz (Opsiyonel)</option>
                        <option value="9">9</option>
                        <option value="10">10</option>
                        <option value="11">11</option>
                        <option value="12">12</option>
                      </select>
                    </div>
                    <div>
                      <label>Şube</label>
                      <select
                        value={editStudentData.branch}
                        onChange={(e) => setEditStudentData({ ...editStudentData, branch: e.target.value })}
                      >
                        <option value="">Seçiniz (Opsiyonel)</option>
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                        <option value="E">E</option>
                        <option value="F">F</option>
                      </select>
                    </div>
                    <div className="form-actions">
                      <button className="btn-save" onClick={handleUpdateStudent}>
                        Güncelle
                      </button>
                      <button className="btn-cancel" onClick={() => {
                        setEditStudentMode(false);
                        setSelectedStudent(null);
                        setEditStudentData({ name: "", surname: "", class: "", branch: "", studentNumber: "" });
                      }}>
                        İptal
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'books' && (
            <div className="books-table">
              <div className="action-buttons">
                <button className="btn-add" onClick={() => setShowAddBook(true)}>
                  ➕ Yeni Kitap Ekle
                </button>
                <button
                  className={`btn-select ${selectionMode === 'books' ? 'active' : ''}`}
                  onClick={() => {
                    if (selectionMode === 'books') {
                      setSelectionMode(null);
                      setSelectedBookIds(new Set());
                    } else {
                      setSelectionMode('books');
                    }
                  }}
                >
                  {selectionMode === 'books' ? "✕ Seçimi İptal" : "✓ Seç"}
                </button>
                {selectionMode === 'books' && selectedBookIds.size > 0 && (
                  <>
                    <button
                      className="btn-edit-bulk"
                      onClick={() => {
                        const selectedBooks = books.filter(b => selectedBookIds.has(b.id));
                        if (selectedBooks.length === 1) {
                          setSelectedBook(selectedBooks[0]);
                          setEditBookMode(true);
                          setEditBookData({
                            title: selectedBooks[0].title,
                            author: selectedBooks[0].author,
                            category: selectedBooks[0].category,
                            quantity: selectedBooks[0].totalQuantity.toString()
                          });
                        } else if (selectedBooks.length > 1) {
                          const initialData = selectedBooks.reduce<Record<string, any>>((acc, book) => {
                            acc[book.id] = {
                              title: book.title,
                              author: book.author,
                              category: book.category,
                              quantity: book.totalQuantity.toString(),
                            };
                            return acc;
                          }, {});
                          setBulkEditContext({ type: "books", items: selectedBooks });
                          setBulkEditForm(initialData);
                          setBulkEditError(null);
                          setShowBulkEditModal(true);
                        }
                      }}
                    >
                      <span className="btn-icon">
                        <EditIcon />
                      </span>
                      <span>Seçilenleri Düzenle ({selectedBookIds.size})</span>
                    </button>
                    <button
                      className="btn-delete-bulk"
                      onClick={handleBulkDeleteBooks}
                    >
                      <span className="btn-icon">
                        <TrashIcon />
                      </span>
                      <span>Seçilenleri Sil ({selectedBookIds.size})</span>
                    </button>
                  </>
                )}
              </div>

              {showAddBook && (
                <div className="add-modal">
                  <h3>Yeni Kitap Ekle</h3>
                  <div className="add-form">
                    <div>
                      <label>Başlık *</label>
                      <input
                        type="text"
                        value={newBook.title}
                        onChange={(e) => setNewBook({ ...newBook, title: e.target.value })}
                        placeholder="Kitap başlığı"
                      />
                    </div>
                    <div>
                      <label>Yazar *</label>
                      <input
                        type="text"
                        value={newBook.author}
                        onChange={(e) => setNewBook({ ...newBook, author: e.target.value })}
                        placeholder="Yazar adı"
                      />
                    </div>
                    <div>
                      <label>Kategori</label>
                      <input
                        type="text"
                        value={newBook.category}
                        onChange={(e) => setNewBook({ ...newBook, category: e.target.value })}
                        placeholder="Kategori (varsayılan: Genel)"
                      />
                    </div>
                    <div>
                      <label>Miktar *</label>
                      <input
                        type="number"
                        value={newBook.quantity}
                        onChange={(e) => setNewBook({ ...newBook, quantity: e.target.value })}
                        placeholder="Kitap sayısı"
                      />
                    </div>
                    <div className="form-actions">
                      <button className="btn-save" onClick={handleAddBook}>
                        Kaydet
                      </button>
                      <button className="btn-cancel" onClick={() => {
                        setShowAddBook(false);
                        setNewBook({ title: "", author: "", category: "", quantity: "" });
                      }}>
                        İptal
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {loading ? (
                <p>Yükleniyor...</p>
              ) : books.length === 0 ? (
                <p className="empty-message">Henüz kitap eklenmemiş. Yukarıdaki butona tıklayarak kitap ekleyebilirsiniz.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Başlık</th>
                      <th>Yazar</th>
                      <th>Kategori</th>
                      <th>Mevcut</th>
                      <th>Toplam</th>
                      <th>Aktif Ödünç</th>
                      {selectionMode === 'books' && (
                        <th style={{ width: "60px", textAlign: "center" }}>
                          <div
                            className={`selection-checkbox ${books.length > 0 && books.every(b => selectedBookIds.has(b.id)) ? 'selected' : ''}`}
                            onClick={() => {
                              const allSelected = books.every(b => selectedBookIds.has(b.id));
                              const newSelected = new Set(selectedBookIds);
                              if (allSelected) {
                                books.forEach(b => newSelected.delete(b.id));
                              } else {
                                books.forEach(b => newSelected.add(b.id));
                              }
                              setSelectedBookIds(newSelected);
                            }}
                            style={{ cursor: "pointer", display: "inline-block" }}
                          >
                            {books.length > 0 && books.every(b => selectedBookIds.has(b.id)) && (
                              <span>✓</span>
                            )}
                          </div>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {books.map((book) => (
                      <tr key={book.id}>
                        <td>{book.title}</td>
                        <td>{book.author}</td>
                        <td>{book.category}</td>
                        <td>{book.quantity}</td>
                        <td>{book.totalQuantity}</td>
                        <td>{book.loans?.length || 0}</td>

                        {/* actions col removed */}

                        {selectionMode === 'books' && (
                          <td onClick={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
                            <div
                              className={`selection-checkbox ${selectedBookIds.has(book.id) ? 'selected' : ''}`}
                              onClick={() => {
                                const newSelected = new Set(selectedBookIds);
                                if (selectedBookIds.has(book.id)) {
                                  newSelected.delete(book.id);
                                } else {
                                  newSelected.add(book.id);
                                }
                                setSelectedBookIds(newSelected);
                              }}
                            >
                              {selectedBookIds.has(book.id) && (
                                <span>✓</span>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {editBookMode && selectedBook && (
                <div className="edit-modal">
                  <h3>Kitap Düzenle: {selectedBook.title}</h3>
                  <div className="edit-form">
                    <div>
                      <label>Başlık *</label>
                      <input
                        type="text"
                        value={editBookData.title}
                        onChange={(e) => setEditBookData({ ...editBookData, title: e.target.value })}
                        placeholder="Kitap başlığı"
                      />
                    </div>
                    <div>
                      <label>Yazar *</label>
                      <input
                        type="text"
                        value={editBookData.author}
                        onChange={(e) => setEditBookData({ ...editBookData, author: e.target.value })}
                        placeholder="Yazar adı"
                      />
                    </div>
                    <div>
                      <label>Kategori</label>
                      <input
                        type="text"
                        value={editBookData.category}
                        onChange={(e) => setEditBookData({ ...editBookData, category: e.target.value })}
                        placeholder="Kategori (varsayılan: Genel)"
                      />
                    </div>
                    <div>
                      <label>Toplam Miktar *</label>
                      <input
                        type="number"
                        value={editBookData.quantity}
                        onChange={(e) => setEditBookData({ ...editBookData, quantity: e.target.value })}
                        placeholder="Toplam kitap sayısı"
                      />
                    </div>
                    <div className="form-actions">
                      <button className="btn-save" onClick={handleUpdateBook}>
                        Güncelle
                      </button>
                      <button className="btn-cancel" onClick={() => {
                        setEditBookMode(false);
                        setSelectedBook(null);
                        setEditBookData({ title: "", author: "", category: "", quantity: "" });
                      }}>
                        İptal
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'loans' && (
            <div className="loans-table">
              {loading ? (
                <p>Yükleniyor...</p>
              ) : (
                <>
                  <div className="action-buttons">
                    <button
                      className={`btn-select ${selectionMode === 'loans' ? 'active' : ''}`}
                      onClick={() => {
                        if (selectionMode === 'loans') {
                          setSelectionMode(null);
                          setSelectedLoanIds(new Set());
                        } else {
                          setSelectionMode('loans');
                        }
                      }}
                    >
                      {selectionMode === 'loans' ? "✕ Seçimi İptal" : "✓ Seç"}
                    </button>
                    {selectionMode === 'loans' && selectedLoanIds.size > 0 && (
                      <>
                        <button
                          className="btn-edit-bulk"
                          onClick={() => {
                            const selectedLoans = loans.filter(l => selectedLoanIds.has(l.id));
                            if (selectedLoans.length === 1) {
                              setSelectedLoan(selectedLoans[0]);
                              setEditLoanMode(true);
                              setEditLoanData({
                                borrower: selectedLoans[0].borrower,
                                dueDate: selectedLoans[0].dueDate ? new Date(selectedLoans[0].dueDate).toISOString().split('T')[0] : "",
                                personel: selectedLoans[0].personel
                              });
                            } else if (selectedLoans.length > 1) {
                              const initialData = selectedLoans.reduce<Record<string, any>>((acc, loan) => {
                                acc[String(loan.id)] = {
                                  borrower: loan.borrower,
                                  dueDate: loan.dueDate ? new Date(loan.dueDate).toISOString().split("T")[0] : "",
                                  personel: loan.personel || "",
                                };
                                return acc;
                              }, {});
                              setBulkEditContext({ type: "loans", items: selectedLoans });
                              setBulkEditForm(initialData);
                              setBulkEditError(null);
                              setShowBulkEditModal(true);
                            }
                          }}
                        >
                          <span className="btn-icon">
                            <EditIcon />
                          </span>
                          <span>Seçilenleri Düzenle ({selectedLoanIds.size})</span>
                        </button>
                        <button
                          className="btn-delete-bulk"
                          onClick={handleBulkReturnLoans}
                        >
                          <span className="btn-icon">
                            <TrashIcon />
                          </span>
                          <span>Seçilenleri İade Et ({selectedLoanIds.size})</span>
                        </button>
                      </>
                    )}
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>Kitap</th>
                        <th>Öğrenci</th>
                        <th>Teslim Tarihi</th>
                        <th>Personel</th>
                        {selectionMode === 'loans' && (
                          <th style={{ width: "60px", textAlign: "center" }}>
                            <div
                              className={`selection-checkbox ${loans.length > 0 && loans.every(l => selectedLoanIds.has(l.id)) ? 'selected' : ''}`}
                              onClick={() => {
                                const allSelected = loans.every(l => selectedLoanIds.has(l.id));
                                const newSelected = new Set(selectedLoanIds);
                                if (allSelected) {
                                  loans.forEach(l => newSelected.delete(l.id));
                                } else {
                                  loans.forEach(l => newSelected.add(l.id));
                                }
                                setSelectedLoanIds(newSelected);
                              }}
                              style={{ cursor: "pointer", display: "inline-block" }}
                            >
                              {loans.length > 0 && loans.every(l => selectedLoanIds.has(l.id)) && (
                                <span>✓</span>
                              )}
                            </div>
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {loans.length === 0 ? (
                        <tr>
                          <td colSpan={selectionMode === 'loans' ? 5 : 4} style={{ textAlign: "center", padding: "40px", color: "#7f8c8d" }}>
                            Henüz ödünç kaydı bulunmuyor.
                          </td>
                        </tr>
                      ) : (
                        loans.map((loan) => (
                          <tr key={loan.id}>
                            <td>{loan.bookTitle || loan.book?.title || "Bilinmiyor"}</td>
                            <td>{loan.borrower}</td>
                            <td>{new Date(loan.dueDate).toLocaleDateString('tr-TR')}</td>
                            <td>{loan.personel}</td>
                            {selectionMode === 'loans' && (
                              <td onClick={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
                                <div
                                  className={`selection-checkbox ${selectedLoanIds.has(loan.id) ? 'selected' : ''}`}
                                  onClick={() => {
                                    const newSelected = new Set(selectedLoanIds);
                                    if (selectedLoanIds.has(loan.id)) {
                                      newSelected.delete(loan.id);
                                    } else {
                                      newSelected.add(loan.id);
                                    }
                                    setSelectedLoanIds(newSelected);
                                  }}
                                >
                                  {selectedLoanIds.has(loan.id) && (
                                    <span>✓</span>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>

                  {editLoanMode && selectedLoan && (
                    <div className="edit-modal">
                      <h3>Ödünç Kaydı Düzenle</h3>
                      <div className="edit-form">
                        <div>
                          <label>Öğrenci Adı *</label>
                          <input
                            type="text"
                            value={editLoanData.borrower}
                            onChange={(e) => setEditLoanData({ ...editLoanData, borrower: e.target.value })}
                            placeholder="Öğrenci adı"
                          />
                        </div>
                        <div>
                          <label>Teslim Tarihi *</label>
                          <input
                            type="date"
                            value={editLoanData.dueDate}
                            onChange={(e) => setEditLoanData({ ...editLoanData, dueDate: e.target.value })}
                          />
                        </div>
                        <div>
                          <label>Personel</label>
                          <input
                            type="text"
                            value={editLoanData.personel}
                            onChange={(e) => setEditLoanData({ ...editLoanData, personel: e.target.value })}
                            placeholder="Personel adı"
                          />
                        </div>
                        <div className="form-actions">
                          <button className="btn-save" onClick={handleUpdateLoan}>
                            Güncelle
                          </button>
                          <button className="btn-cancel" onClick={() => {
                            setEditLoanMode(false);
                            setSelectedLoan(null);
                            setEditLoanData({ borrower: "", dueDate: "", personel: "" });
                          }}>
                            İptal
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'database' && (
            <div className="database-management">


              <div className="backup-section">
                <div className="backup-title">
                  <div className="backup-icon">
                    <BackupIcon />
                  </div>
                  <div>
                    <h3>Yedekleme Merkezi</h3>
                    <p>Veritabanınızı güvenli bir şekilde dışa aktarabilir ve gerektiğinde geri yükleyebilirsiniz.</p>
                  </div>
                </div>
                <button className="btn-backup" onClick={handleCreateBackup}>
                  Yeni Yedek Oluştur
                </button>
              </div>

              {/* Otomatik Yedekleme Ayarları */}
              <div className="auto-backup-section" style={{
                backgroundColor: '#f8fafc',
                padding: '20px',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                marginTop: '20px'
              }}>
                <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  Otomatik Yedekleme
                </h3>
                {autoBackupStatus && (
                  <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
                    <div>Durum: <strong>{autoBackupStatus.enabled ? '✅ Aktif' : '❌ Pasif'}</strong></div>
                    <div>Aralık: <strong>{autoBackupStatus.intervalDays} gün</strong></div>
                    {autoBackupStatus.lastBackupDate && (
                      <div>Son Yedek: <strong>{new Date(autoBackupStatus.lastBackupDate).toLocaleString('tr-TR')}</strong></div>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={autoBackupEnabled}
                      onChange={(e) => setAutoBackupEnabled(e.target.checked)}
                    />
                    <span style={{ fontSize: '14px' }}>Otomatik Yedekleme Aktif</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px' }}>Aralık (gün):</span>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={autoBackupDays}
                      onChange={(e) => setAutoBackupDays(parseInt(e.target.value) || 30)}
                      style={{
                        width: '80px',
                        padding: '6px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '14px'
                      }}
                    />
                  </label>
                  <button
                    className="btn-backup"
                    onClick={handleConfigureAutoBackup}
                    style={{ fontSize: '14px', padding: '8px 16px' }}
                  >
                    Ayarları Kaydet
                  </button>
                </div>
              </div>

              {/* Eski Yedekleri Temizleme */}
              <div style={{ marginTop: '20px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '12px' }}>
                  Eski Yedekleri Temizle
                </h4>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1, maxWidth: '200px' }}>
                    <label style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px', display: 'block' }}>
                      Ne kadar eski yedekler silinsin?
                    </label>
                    <select
                      value={cleanupDays}
                      onChange={(e) => setCleanupDays(parseInt(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        border: '2px solid rgba(226, 232, 240, 0.8)',
                        borderRadius: '8px',
                        fontSize: '14px',
                        color: '#1e293b',
                        backgroundColor: 'white'
                      }}
                    >
                      <option value={30}>30 gün</option>
                      <option value={60}>60 gün</option>
                      <option value={90}>90 gün</option>
                      <option value={180}>180 gün</option>
                      <option value={365}>1 yıl</option>
                    </select>
                  </div>
                  <button
                    className="btn-restore"
                    onClick={handleCleanOldBackups}
                    style={{ fontSize: '14px', padding: '10px 20px' }}
                  >
                    Temizle
                  </button>
                </div>
              </div>

              <div className="backups-list">
                <h3>Mevcut Yedekler</h3>
                {backups.length === 0 ? (
                  <p>Henüz yedek oluşturulmamış</p>
                ) : (
                  <ul>
                    {backups.map((backup, index) => (
                      <li key={index}>
                        <span>{formatBackupDisplay(backup, backups)}</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            className="btn-restore"
                            onClick={() => handleRestore(backup)}
                          >
                            Geri Yükle
                          </button>
                          <button
                            className="btn-delete"
                            onClick={() => handleDeleteBackup(backup)}
                            style={{
                              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                              color: 'white',
                              border: 'none',
                              padding: '8px 16px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '14px',
                              fontWeight: '500'
                            }}
                          >
                            Sil
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Veritabanı Yolu Kartı */}
              {dbInfo && (
                <div className="info-card" style={{ marginBottom: '24px' }}>
                  <h3>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                      <polyline points="17 21 17 13 7 13 7 21"></polyline>
                      <polyline points="7 3 7 8 15 8"></polyline>
                    </svg>
                    Veritabanı Yolu
                  </h3>
                  <p className="db-path">{dbInfo.databasePath}</p>
                </div>
              )}
            </div >
          )}
        </div >

        {/* Kitap Silme Onay Kartı */}
        < ConfirmCard
          isOpen={showBookDeleteConfirm}
          title="Kitap Silme Onayı"
          icon="⚠️"
          onConfirm={confirmBookDelete}
          onCancel={cancelBookDelete}
          confirmText="Sil"
          cancelText="İptal"
          confirmButtonColor="#ef4444"
          loading={deleteLoading}
        >
          {bookToDelete && (
            <>
              {bookToDelete.loans.length > 0 ? (
                <>
                  <div style={{ fontSize: "14px", color: "#475569", marginBottom: "12px", lineHeight: "1.6" }}>
                    <strong>{bookToDelete.book.title}</strong> kitabı şu öğrencilerde ödünç görünüyor:
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
                    <div style={{ fontSize: "14px", color: "#92400e", fontWeight: 600, marginBottom: "8px" }}>
                      ⚠️ Aktif Ödünçler ({bookToDelete.loans.length})
                    </div>
                    <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "13px", color: "#78350f" }}>
                      {bookToDelete.loans.map((loan, index) => {
                        const dueDate = loan.dueDate ? new Date(loan.dueDate).toLocaleDateString("tr-TR") : "-";
                        return (
                          <li key={index} style={{ marginBottom: "4px" }}>
                            <strong>{loan.borrower}</strong> (Teslim: {dueDate})
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  <div style={{ fontSize: "13px", color: "#64748b", marginTop: "12px" }}>
                    <strong>{bookToDelete.loans.length} ödünç kaydı</strong> bu işlemle birlikte silinecek.
                  </div>
                </>
              ) : (
                <div style={{ fontSize: "14px", color: "#475569", lineHeight: "1.6" }}>
                  <strong>{bookToDelete.book.title}</strong> kitabını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
                </div>
              )}
            </>
          )}
        </ConfirmCard >

        {/* Öğrenci Silme Onay Kartı */}
        < ConfirmCard
          isOpen={showStudentDeleteConfirm}
          title="Öğrenci Silme Onayı"
          icon="⚠️"
          onConfirm={async () => {
            await confirmStudentDelete();
            // Öğrencileri tek tek sil
            if (studentToDelete) {
              for (const student of studentToDelete.students) {
                if (student.studentNumber) {
                  try {
                    await httpClient.delete(`/admin/students/${student.studentNumber}`);
                  } catch (error: any) {
                    const message = error instanceof Error ? error.message : error?.response?.data?.message;
                    alert(`${formatStudentDisplayName(student)} silinirken hata: ${message || "Bilinmeyen hata"}`);
                  }
                }
              }
              alert("Öğrenci(ler) başarıyla silindi");
              if (activeTab === 'students') {
                loadStudents();
              } else {
                loadUsers();
              }
              loadDatabaseInfo();
            }
          }}
          onCancel={cancelStudentDelete}
          confirmText="Sil"
          cancelText="İptal"
          confirmButtonColor="#ef4444"
          loading={deleteLoading}
        >
          {studentToDelete && (() => {
            const studentsWithLoans = studentToDelete.students.map(student => {
              const displayName = formatStudentDisplayName(student);
              const nameKey = normalizeStudentName(`${student.name || ""} ${student.surname || ""}`);
              const fallbackKey = nameKey || normalizeStudentName(student.name || student.surname || "");
              const lookupKey = fallbackKey;
              const loansForStudent = lookupKey ? (studentToDelete.loansByStudent.get(lookupKey) || []) : [];
              return { student, displayName, loansForStudent };
            }).filter(entry => entry.loansForStudent.length > 0);

            if (studentsWithLoans.length === 0) {
              return (
                <div style={{ fontSize: "14px", color: "#475569", lineHeight: "1.6" }}>
                  {studentToDelete.students.length === 1 ? (
                    <>
                      <strong>{formatStudentDisplayName(studentToDelete.students[0])}</strong> öğrencisini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
                    </>
                  ) : (
                    <>
                      <strong>{studentToDelete.students.length} öğrenci</strong> silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
                    </>
                  )}
                </div>
              );
            }

            return (
              <>
                <div style={{ fontSize: "14px", color: "#475569", marginBottom: "12px", lineHeight: "1.6" }}>
                  Seçilen öğrencilerin bazılarında teslim edilmemiş kitaplar var:
                </div>
                {studentsWithLoans.map((entry, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: "12px",
                      backgroundColor: "#fef3c7",
                      borderRadius: "8px",
                      border: "1px solid #fbbf24",
                      marginBottom: "12px",
                    }}
                  >
                    <div style={{ fontSize: "14px", color: "#92400e", fontWeight: 600, marginBottom: "8px" }}>
                      ⚠️ {entry.displayName} - {entry.loansForStudent.length} Kitap
                    </div>
                    <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "13px", color: "#78350f" }}>
                      {entry.loansForStudent.map((loan, loanIdx) => {
                        const dueDate = loan.dueDate ? new Date(loan.dueDate).toLocaleDateString("tr-TR") : "-";
                        return (
                          <li key={loanIdx} style={{ marginBottom: "4px" }}>
                            <strong>{loan.title}</strong> (Teslim: {dueDate})
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
                <div style={{ fontSize: "13px", color: "#64748b", marginTop: "12px" }}>
                  <strong>{studentsWithLoans.reduce((sum, entry) => sum + entry.loansForStudent.length, 0)} ödünç kaydı</strong> bu işlemle birlikte silinecek.
                </div>
              </>
            );
          })()}
        </ConfirmCard >

        {/* Toplu Silme Detay Kartı */}
        < ConfirmCard
          isOpen={showBulkDeleteDetail}
          title={bulkDeleteData?.type === "books" ? "Toplu Kitap Silme" : "Toplu Öğrenci Silme"}
          icon="⚠️"
          onConfirm={async () => {
            if (!bulkDeleteData) return;

            setDeleteLoading(true);
            try {
              if (bulkDeleteData.type === "books") {
                await executeBulkDeleteBooks(bulkDeleteData.selectedItems as Set<string>);
              } else {
                await executeBulkDeleteStudents(bulkDeleteData.selectedItems as Set<number>);
              }
              setShowBulkDeleteDetail(false);
              setBulkDeleteData(null);
            } finally {
              setDeleteLoading(false);
            }
          }}
          onCancel={() => {
            setShowBulkDeleteDetail(false);
            setBulkDeleteData(null);
          }}
          confirmText="Devam Et"
          cancelText="İptal"
          confirmButtonColor="#ef4444"
          loading={deleteLoading}
        >
          {bulkDeleteData && (
            <>
              <div style={{ fontSize: "14px", color: "#475569", marginBottom: "16px", lineHeight: "1.6" }}>
                <strong>Silinecekler içerisinde ödünç listesi olanlar var:</strong>
              </div>
              <div style={{ maxHeight: "400px", overflowY: "auto", marginBottom: "16px" }}>
                {bulkDeleteData.items.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: "12px",
                      backgroundColor: "#fef3c7",
                      borderRadius: "8px",
                      border: "1px solid #fbbf24",
                      marginBottom: "12px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                      <div
                        className={`selection-checkbox ${bulkDeleteData.selectedItems.has(item.id) ? 'selected' : ''}`}
                        onClick={() => {
                          const newSelected = new Set(bulkDeleteData.selectedItems);
                          if (bulkDeleteData.selectedItems.has(item.id)) {
                            newSelected.delete(item.id);
                          } else {
                            newSelected.add(item.id);
                          }
                          setBulkDeleteData({
                            ...bulkDeleteData,
                            selectedItems: newSelected
                          });
                        }}
                        style={{ cursor: "pointer", flexShrink: 0 }}
                      >
                        {bulkDeleteData.selectedItems.has(item.id) && <span>✓</span>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "14px", color: "#92400e", fontWeight: 600 }}>
                          {item.name} - {item.loans.length} Ödünç
                        </div>
                      </div>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: "40px", fontSize: "13px", color: "#78350f" }}>
                      {item.loans.map((loan, loanIdx) => {
                        const dueDate = loan.dueDate ? new Date(loan.dueDate).toLocaleDateString("tr-TR") : "-";
                        return (
                          <li key={loanIdx} style={{ marginBottom: "4px" }}>
                            {bulkDeleteData.type === "books" ? (
                              <><strong>{loan.borrower}</strong> (Teslim: {dueDate})</>
                            ) : (
                              <><strong>{loan.title}</strong> (Teslim: {dueDate})</>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: "13px", color: "#64748b", padding: "12px", backgroundColor: "#f1f5f9", borderRadius: "8px" }}>
                <strong>{bulkDeleteData.items.reduce((sum, item) => sum + item.loans.length, 0)} ödünç kaydı</strong> seçilen {bulkDeleteData.type === "books" ? "kitap" : "öğrenci"}lerle birlikte silinecek.
              </div>
            </>
          )}
        </ConfirmCard >

        {showBulkEditModal && bulkEditContext && createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(15, 23, 42, 0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1200,
              padding: "16px",
            }}
            onClick={closeBulkEditModal}
          >
            <div
              className="card"
              style={{
                width: "100%",
                maxWidth: "900px",
                maxHeight: "90vh",
                overflowY: "auto",
                borderRadius: "16px",
                padding: "24px",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div>
                  <h2 style={{ margin: 0 }}>Toplu {bulkEditTitles[bulkEditContext.type]} Düzenleme</h2>
                  <p style={{ margin: "4px 0 0", color: "#475569", fontSize: "14px" }}>
                    {bulkEditContext.items.length} kayıt seçildi
                  </p>
                </div>
                <button
                  onClick={closeBulkEditModal}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: "26px",
                    cursor: "pointer",
                    color: "#94a3b8",
                  }}
                  aria-label="Toplu düzenlemeyi kapat"
                >
                  ×
                </button>
              </div>

              {bulkEditError && (
                <div style={{ padding: "12px", borderRadius: "10px", backgroundColor: "#fee2e2", color: "#b91c1c", marginBottom: "16px" }}>
                  {bulkEditError}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {bulkEditContext.items.map((item, index) => renderBulkEditItem(item, index))}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
                <button
                  onClick={closeBulkEditModal}
                  style={{
                    padding: "10px 20px",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    background: "#fff",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  İptal
                </button>
                <button
                  onClick={handleBulkEditSubmit}
                  disabled={bulkEditLoading}
                  style={{
                    padding: "10px 24px",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: bulkEditLoading ? "#94a3b8" : "#2563eb",
                    color: "white",
                    cursor: bulkEditLoading ? "not-allowed" : "pointer",
                    fontWeight: 700,
                  }}
                >
                  {bulkEditLoading ? "Güncelleniyor..." : "Değişiklikleri Kaydet"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Bilgilendirme Kartı */}
        <InfoCard
          isOpen={showInfoCard}
          title={infoCardData?.title || "Bilgi"}
          icon={infoCardData?.icon}
          type={infoCardData?.type || "info"}
          onClose={() => {
            setShowInfoCard(false);
            setInfoCardData(null);
            // İptal edildiğinde callback'leri false yap
            if ((window as any).__userDeleteConfirm) {
              (window as any).__userDeleteConfirm(false);
              delete (window as any).__userDeleteConfirm;
            }
            if ((window as any).__bulkDeleteUsersConfirm) {
              (window as any).__bulkDeleteUsersConfirm(false);
              delete (window as any).__bulkDeleteUsersConfirm;
            }
            if ((window as any).__bulkReturnLoansConfirm) {
              (window as any).__bulkReturnLoansConfirm(false);
              delete (window as any).__bulkReturnLoansConfirm;
            }
            if ((window as any).__returnLoanConfirm) {
              (window as any).__returnLoanConfirm(false);
              delete (window as any).__returnLoanConfirm;
            }
          }}
          onConfirm={infoCardData?.type === "warning" ? () => {
            // Onay verildiğinde callback'leri true yap
            if ((window as any).__userDeleteConfirm) {
              (window as any).__userDeleteConfirm(true);
              delete (window as any).__userDeleteConfirm;
            }
            if ((window as any).__bulkDeleteUsersConfirm) {
              (window as any).__bulkDeleteUsersConfirm(true);
              delete (window as any).__bulkDeleteUsersConfirm;
            }
            if ((window as any).__bulkReturnLoansConfirm) {
              (window as any).__bulkReturnLoansConfirm(true);
              delete (window as any).__bulkReturnLoansConfirm;
            }
            if ((window as any).__returnLoanConfirm) {
              (window as any).__returnLoanConfirm(true);
              delete (window as any).__returnLoanConfirm;
            }
          } : undefined}
          confirmText="Onayla"
        >
          <div style={{ fontSize: "14px", color: "#475569", lineHeight: "1.6" }}>
            {infoCardData?.message}
          </div>
        </InfoCard>

        <PersonelExcelUploadModal
          isOpen={showPersonelUploadModal}
          onClose={() => setShowPersonelUploadModal(false)}
          onSuccess={async (result) => {
            if (result) {
              setPersonelUploadSummary(result);
            }
            await loadUsers();
            await loadDatabaseInfo();
          }}
        />

        {/* Confirm Dialog */}
        <ConfirmCard
          isOpen={!!confirmDialog}
          title={confirmDialog?.title || "Onay"}
          icon={confirmDialog?.icon || "⚠️"}
          onConfirm={async () => {
            if (confirmDialog?.onConfirm) {
              await confirmDialog.onConfirm();
            }
          }}
          onCancel={() => setConfirmDialog(null)}
          confirmText={confirmDialog?.confirmText || "Onayla"}
          cancelText="İptal"
          confirmButtonColor={confirmDialog?.confirmButtonColor || "#ef4444"}
        >
          <div style={{ fontSize: "14px", color: "#475569", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>
            {confirmDialog?.message || ""}
          </div>
        </ConfirmCard>

        {/* Recovery Code Modal */}
        {showRecoveryCodeModal && recoveryCode && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10000
            }}
            onClick={() => setShowRecoveryCodeModal(false)}
          >
            <div
              style={{
                backgroundColor: 'white',
                borderRadius: '16px',
                padding: '32px',
                maxWidth: '500px',
                width: '90%',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px', color: '#1e293b', textAlign: 'center' }}>
                🔐 K urtarma Kodu
              </h2>
              <p style={{ fontSize: '14px', color: '#64748b', textAlign: 'center', marginBottom: '24px' }}>
                Bu kodu güvenli bir yerde saklayın
              </p>

              <div style={{
                backgroundColor: '#f8fafc',
                border: '2px dashed #cbd5e1',
                borderRadius: '12px',
                padding: '24px',
                textAlign: 'center',
                marginBottom: '24px'
              }}>
                <div style={{
                  fontSize: '32px',
                  fontWeight: 'bold',
                  letterSpacing: '4px',
                  color: '#2563eb',
                  fontFamily: 'monospace'
                }}>
                  {recoveryCode}
                </div>
              </div>

              <div style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '24px'
              }}>
                <p style={{ fontSize: '13px', color: '#dc2626', margin: 0 }}>
                  ⚠️ Bu kod sadece <strong>bir kere</strong> kullanılabilir ve <strong>30 gün</strong> geçerlidir.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(recoveryCode);
                    showToast('Kurtarma kodu kopyalandı', 'success');
                  }}
                  style={{
                    flex: 1,
                    padding: '12px 20px',
                    backgroundColor: '#f1f5f9',
                    color: '#475569',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  📋 Kopyala
                </button>
                <button
                  onClick={handlePrintRecoveryCode}
                  style={{
                    flex: 1,
                    padding: '12px 20px',
                    background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  🖨️ Yazdır
                </button>
                <button
                  onClick={() => setShowRecoveryCodeModal(false)}
                  style={{
                    padding: '12px 20px',
                    backgroundColor: '#f1f5f9',
                    color: '#475569',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default AdminPanel;
