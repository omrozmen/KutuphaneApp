import { useState, useRef, useEffect } from "react";
import { UserResponse } from "../api/types";
import { httpClient } from "../api/client";
import { createPortal } from "react-dom";
import "./SettingsModal.css";
import { NotificationSettings } from "../types/notification";
import ConfirmCard from "./ConfirmCard";

interface SettingsModalProps {
  user: UserResponse;
  onClose: () => void;
  onAutoRecordSettingsChanged?: (settings?: { enabled: boolean; interval: number }) => void;
  notificationSettings: NotificationSettings;
  onNotificationSettingsChange: (settings: NotificationSettings) => void;
  onShowInfo?: (title: string, message: string, type: "info" | "success" | "warning" | "error", icon?: string) => void;
}

interface BrowseResponse {
  currentPath: string;
  items: Array<{
    name: string;
    path: string;
    type: "directory" | "file";
    size?: number;
    lastModified: string;
  }>;
}

const SettingsModal = ({ user, onClose, onAutoRecordSettingsChanged, notificationSettings, onNotificationSettingsChange, onShowInfo }: SettingsModalProps) => {
  const [activeTab, setActiveTab] = useState<"general" | "records" | "other">("general");
  const [notifications, setNotifications] = useState(notificationSettings.notifications);
  const [notificationTypes, setNotificationTypes] = useState(notificationSettings.notificationTypes);
  const skipNotificationSyncRef = useRef(false);
  const isAdmin = user.role === "ADMIN" || user.role === "Admin";

  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    icon?: string;
    confirmText?: string;
    confirmButtonColor?: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Recovery code states
  const [showRecoveryCodeModal, setShowRecoveryCodeModal] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [recoveryCodeLoading, setRecoveryCodeLoading] = useState(false);
  const [hasActiveRecoveryCode, setHasActiveRecoveryCode] = useState(false);

  // Password confirmation for recovery code
  const [showPasswordConfirmModal, setShowPasswordConfirmModal] = useState(false);
  const [passwordConfirmValue, setPasswordConfirmValue] = useState("");
  const [passwordConfirmError, setPasswordConfirmError] = useState("");
  const [recoveryCodeMode, setRecoveryCodeMode] = useState<"generate" | "reset">("generate");

  const notify = (
    title: string,
    message: string,
    type: "info" | "success" | "warning" | "error" = "info",
    icon?: string,
  ) => {
    if (onShowInfo) {
      onShowInfo(title, message, type, icon);
      return;
    }
    // Fallback (idealde kullanılmamalı)
    alert(`${title}\n\n${message}`);
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

  const renderConfirmCard = () => (
    <ConfirmCard
      isOpen={!!confirmDialog}
      title={confirmDialog?.title || "Onay"}
      icon={confirmDialog?.icon || "⚠️"}
      onConfirm={async () => {
        if (!confirmDialog) return;
        setConfirmLoading(true);
        try {
          await confirmDialog.onConfirm();
        } finally {
          setConfirmLoading(false);
          setConfirmDialog(null);
        }
      }}
      onCancel={() => {
        if (confirmLoading) return;
        setConfirmDialog(null);
      }}
      confirmText={confirmDialog?.confirmText || "Onayla"}
      cancelText="İptal"
      confirmButtonColor={confirmDialog?.confirmButtonColor || "#ef4444"}
      loading={confirmLoading}
    >
      <div style={{ fontSize: "14px", color: "#475569", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>
        {confirmDialog?.message || ""}
      </div>
    </ConfirmCard>
  );

  const handleShowRecoveryCode = async () => {
    // Önce şifre doğrulama modalini aç
    setRecoveryCodeMode("generate");
    setPasswordConfirmValue("");
    setPasswordConfirmError("");
    setShowPasswordConfirmModal(true);
  };

  const handleResetRecoveryCode = async () => {
    // Sıfırlama modu
    setRecoveryCodeMode("reset");
    setPasswordConfirmValue("");
    setPasswordConfirmError("");
    setShowPasswordConfirmModal(true);
  };

  const handlePasswordConfirmed = async () => {
    if (!passwordConfirmValue) {
      setPasswordConfirmError("Şifre gerekli");
      return;
    }

    setRecoveryCodeLoading(true);
    setPasswordConfirmError("");

    try {
      if (recoveryCodeMode === "reset") {
        // RESET MODU: Sadece kodu sil, yeni kod ÜRETME
        await httpClient.post('/auth/recovery-code/reset', {
          username: user.username,
          password: passwordConfirmValue
        });

        // Modalı kapat
        setShowPasswordConfirmModal(false);
        setPasswordConfirmValue("");

        // State'i güncelle - buton aktif olsun
        setHasActiveRecoveryCode(false);
        setRecoveryCode(null);

        notify("İşlem Başarılı", "Kurtarma kodu silindi. Yeni kod üretmek için butona tıklayın.", "success", "✅");
      } else {
        // GENERATE MODU: Kod üret ve MODAL GÖSTER
        const response: any = await httpClient.post('/auth/recovery-code/generate', {
          username: user.username,
          password: passwordConfirmValue
        });
        const code = response.recoveryCode;
        setRecoveryCode(code);

        // Şifre modalını kapat
        setShowPasswordConfirmModal(false);
        setPasswordConfirmValue("");

        // Kod modalını aç
        setShowRecoveryCodeModal(true);

        // State'i güncelle
        setHasActiveRecoveryCode(true);

        // Bilgi mesajı gösterme - modal açılıyor
      }
    } catch (error: any) {
      const message = error?.response?.data?.message || (recoveryCodeMode === "reset" ? 'Kurtarma kodu silinemedi' : 'Kurtarma kodu oluşturulamadı');
      setPasswordConfirmError(message);
      notify("Hata", message, "error", "❌");
    } finally {
      setRecoveryCodeLoading(false);
    }
  };

  // Check if user has active recovery code on mount
  useEffect(() => {
    const checkRecoveryCode = async () => {
      if (isAdmin) {
        try {
          const response: any = await httpClient.get(`/auth/recovery-code/check/${user.username}`);
          setHasActiveRecoveryCode(response.hasRecoveryCode);
        } catch (error) {
          console.error('Kurtarma kodu kontrolü başarısız:', error);
        }
      }
    };
    checkRecoveryCode();
  }, [isAdmin, user.username]);



  useEffect(() => {
    if (isAdmin && activeTab !== "general") {
      setActiveTab("general");
    }
  }, [isAdmin, activeTab]);

  useEffect(() => {
    skipNotificationSyncRef.current = true;
    setNotifications(notificationSettings.notifications);
    setNotificationTypes({ ...notificationSettings.notificationTypes });
  }, [notificationSettings]);

  // onNotificationSettingsChange fonksiyonunu ref'e al
  const onNotificationSettingsChangeRef = useRef(onNotificationSettingsChange);

  useEffect(() => {
    onNotificationSettingsChangeRef.current = onNotificationSettingsChange;
  }, [onNotificationSettingsChange]);

  useEffect(() => {
    if (skipNotificationSyncRef.current) {
      skipNotificationSyncRef.current = false;
      return;
    }
    onNotificationSettingsChangeRef.current({
      notifications,
      notificationTypes,
    });
  }, [notifications, notificationTypes]);
  const [autoRecordEnabled, setAutoRecordEnabled] = useState(false);
  const [autoRecordIntervalMinutes, setAutoRecordIntervalMinutes] = useState(60);
  const [themePreference, setThemePreference] = useState<"light" | "dark">("light");

  // Diğer ayarlar için state'ler
  const [classes, setClasses] = useState<number[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [newBranch, setNewBranch] = useState("");
  const [showAddBranch, setShowAddBranch] = useState(false);

  // Sistem ayarları state'leri
  const [borrowLimit, setBorrowLimit] = useState(5);
  const [penaltyLimit, setPenaltyLimit] = useState(100);
  const [isSingleBookAddEnabled, setIsSingleBookAddEnabled] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(false);

  // setMaxBorrowLimit uyumluluğu için (Eğer dışarıdan prop olarak geliyorsa veya kullanılıyorsa)
  const setMaxBorrowLimit = setBorrowLimit;
  const maxBorrowLimit = borrowLimit;

  // Bilgilendirme pencereleri için state'ler
  const [showGeneralInfo, setShowGeneralInfo] = useState(false);
  const [showRecordsInfo, setShowRecordsInfo] = useState(false);
  const [showOtherInfo, setShowOtherInfo] = useState(false);

  // Kayıt tipleri interface
  interface RecordType {
    id: string;
    name: string;
    dataTypes: string[];
    filePath: string;
    isDefault: boolean;
    saveMode: "overwrite" | "current";
    saveToCurrentDateFolder?: boolean;
  }

  // Kayıt ayarları state'leri
  const [recordTypes, setRecordTypes] = useState<RecordType[]>([
    {
      id: "default",
      name: "Tüm Kayıtlar",
      dataTypes: ["ogrenci_bilgileri", "personel_bilgileri", "kitap_listesi", "odunc_bilgileri"],
      filePath: "Masaüstü/KütüphaneApp",
      isDefault: true,
      saveMode: "overwrite"
    }
  ]);
  const [activeRecordTypeId, setActiveRecordTypeId] = useState<string>("default");
  const [showNewRecordForm, setShowNewRecordForm] = useState(false);
  const [newRecordName, setNewRecordName] = useState("");
  const [newRecordDataTypes, setNewRecordDataTypes] = useState<string[]>(["kitap_listesi", "odunc_bilgileri"]);
  const [newRecordFilePath, setNewRecordFilePath] = useState("");
  const [newRecordSaveToCurrentDateFolder, setNewRecordSaveToCurrentDateFolder] = useState(true);
  const [editingRecordTypeId, setEditingRecordTypeId] = useState<string | null>(null);

  // Klasör gezme modal state'leri
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [currentBrowsePath, setCurrentBrowsePath] = useState<string | null>(null);
  const [folderItems, setFolderItems] = useState<Array<{ name: string; path: string; type: "directory" | "file" }>>([]);
  const folderBrowserCallbackRef = useRef<((path: string) => void) | null>(null);

  // Aktif kayıt tipini al
  const activeRecordType = recordTypes.find(rt => rt.id === activeRecordTypeId) || recordTypes[0];

  const handleAddNewRecordType = () => {
    setShowNewRecordForm(true);
    setNewRecordName("");
    setNewRecordDataTypes(["kitap_listesi", "odunc_bilgileri"]);
    // Tarih formatı: gg-aa-yyyy
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    const dateStr = `${day}-${month}-${year}`;
    setNewRecordFilePath(`Masaüstü/KütüphaneApp/${user.username}/${dateStr}`);
    setNewRecordSaveToCurrentDateFolder(true);
  };

  const handleSaveNewRecordType = async () => {
    if (!newRecordName.trim()) {
      notify("Hata", "Lütfen kayıt tipi adı girin.", "error", "❌");
      return;
    }
    if (newRecordDataTypes.length === 0) {
      notify("Hata", "Lütfen en az bir veri tipi seçin.", "error", "❌");
      return;
    }

    // Tarih formatı: gg-aa-yyyy
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    const dateStr = `${day}-${month}-${year}`;
    const defaultPath = `Masaüstü/KütüphaneApp/${user.username}/${dateStr}`;

    const newRecordType: RecordType = {
      id: `record_${Date.now()}`,
      name: newRecordName,
      dataTypes: newRecordDataTypes,
      filePath: newRecordFilePath || defaultPath,
      isDefault: false,
      saveMode: "current",
      saveToCurrentDateFolder: newRecordSaveToCurrentDateFolder
    };

    // Backend'e kaydet
    try {
      await saveRecordType(newRecordType);

      // State'e ekle
      setRecordTypes([...recordTypes, newRecordType]);
      setShowNewRecordForm(false);
      setNewRecordName("");
      setNewRecordDataTypes(["kitap_listesi", "odunc_bilgileri"]);
      setNewRecordFilePath("");
      setNewRecordSaveToCurrentDateFolder(true);
      notify("Başarılı", "Kayıt tipi başarıyla eklendi.", "success", "✅");
    } catch (error: any) {
      console.error("Kayıt tipi kaydedilemedi:", error);
      const errorMessage = error?.message || "Kayıt tipi kaydedilirken bir hata oluştu. Lütfen tekrar deneyin.";
      notify("Hata", errorMessage, "error", "❌");
    }
  };

  const handleDeleteRecordType = async (recordTypeId: string) => {
    requestConfirm({
      title: "Kayıt Tipi Silme Onayı",
      icon: "⚠️",
      confirmText: "Sil",
      confirmButtonColor: "#ef4444",
      message: "Bu kayıt tipini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.",
      onConfirm: async () => {
        try {
          await httpClient.delete(`/record-types/${user.username}/${recordTypeId}`);
          setRecordTypes(recordTypes.filter(rt => rt.id !== recordTypeId));
          if (activeRecordTypeId === recordTypeId) {
            setActiveRecordTypeId("default");
          }
          notify("Başarılı", "Kayıt tipi silindi.", "success", "✅");
        } catch (error) {
          console.error("Kayıt tipi silinemedi:", error);
          notify("Hata", "Kayıt tipi silinirken bir hata oluştu.", "error", "❌");
        }
      },
    });
  };

  const handleUpdateRecordType = async (recordType: RecordType) => {
    try {
      await saveRecordType(recordType);

      // State'i güncelle
      const updated = recordTypes.map(rt =>
        rt.id === recordType.id ? recordType : rt
      );
      setRecordTypes(updated);
      setEditingRecordTypeId(null);
      notify("Başarılı", "Kayıt tipi başarıyla güncellendi.", "success", "✅");
    } catch (error: any) {
      console.error("Kayıt tipi güncellenemedi:", error);
      notify("Hata", `Kayıt tipi güncellenirken bir hata oluştu: ${error.message || "Bilinmeyen hata"}`, "error", "❌");
    }
  };

  const saveRecordType = async (recordType: RecordType) => {
    try {
      const response = await httpClient.post<{ success?: boolean; message?: string }>(`/record-types/${user.username}`, {
        id: recordType.id,
        name: recordType.name,
        dataTypes: recordType.dataTypes || [],
        filePath: recordType.filePath || "",
        saveMode: recordType.saveMode || "current",
        saveToCurrentDateFolder: recordType.saveToCurrentDateFolder ?? false
      });

      // Backend'den success field'ı gelmeyebilir, bu durumda hata yoksa başarılı say
      if (response && response.success === false) {
        throw new Error(response.message || "Kayıt tipi kaydedilemedi");
      }
    } catch (error: any) {
      // httpClient zaten hata durumunda exception fırlatıyor
      const errorMessage = error?.message || "Kayıt tipi kaydedilirken bir hata oluştu";
      console.error("Kayıt tipi kaydetme hatası:", error);
      throw new Error(errorMessage);
    }
  };

  // Component mount olduğunda kayıt tiplerini yükle
  useEffect(() => {
    const loadRecordTypes = async () => {
      try {
        const response = await httpClient.get<RecordType[]>(`/record-types/${user.username}`);
        // Default kayıt tipini her zaman ilk sıraya ekle
        const defaultRecord = {
          id: "default",
          name: "Tüm Kayıtlar",
          dataTypes: ["ogrenci_bilgileri", "personel_bilgileri", "kitap_listesi", "odunc_bilgileri"],
          filePath: "Masaüstü/KütüphaneApp",
          isDefault: true,
          saveMode: "overwrite" as const
        };

        if (response && Array.isArray(response) && response.length > 0) {
          setRecordTypes([defaultRecord, ...response]);
        } else {
          // Hiç kayıt tipi yoksa sadece default'u göster
          setRecordTypes([defaultRecord]);
        }
      } catch (error) {
        console.error("Kayıt tipleri yüklenemedi:", error);
        // Hata durumunda da default kayıt tipini göster
        const defaultRecord = {
          id: "default",
          name: "Tüm Kayıtlar",
          dataTypes: ["ogrenci_bilgileri", "personel_bilgileri", "kitap_listesi", "odunc_bilgileri"],
          filePath: "Masaüstü/KütüphaneApp",
          isDefault: true,
          saveMode: "overwrite" as const
        };
        setRecordTypes([defaultRecord]);
      }
    };
    if (user?.username) {
      loadRecordTypes();
    }
  }, [user?.username]);

  // Component mount olduğunda otomatik kayıt ayarlarını yükle
  useEffect(() => {
    const loadAutoRecordSettings = async () => {
      try {
        const response = await httpClient.get<{ autoRecordEnabled: boolean; autoRecordIntervalMinutes: number }>(
          `/record-types/${user.username}/auto-record-settings`
        );
        setAutoRecordEnabled(response.autoRecordEnabled);
        setAutoRecordIntervalMinutes(response.autoRecordIntervalMinutes);
      } catch (error) {
        console.error("Otomatik kayıt ayarları yüklenemedi:", error);
        // Default değerler zaten set edilmiş
      }
    };
    if (user?.username) {
      loadAutoRecordSettings();
    }
  }, [user?.username]);

  // Component mount olduğunda sınıf listesini yükle
  useEffect(() => {
    const loadClasses = async () => {
      try {
        const response = await httpClient.get<number[]>("/admin/classes");
        setClasses(response);
      } catch (error) {
        console.error("Sınıf listesi yüklenemedi:", error);
        // Default değerler: 9-12
        setClasses([9, 10, 11, 12]);
      }
    };
    loadClasses();
  }, []);

  // Şube listesini localStorage'dan yükle
  useEffect(() => {
    const savedBranches = localStorage.getItem("kutuphane_branches");
    if (savedBranches) {
      try {
        setBranches(JSON.parse(savedBranches));
      } catch (error) {
        console.error("Şube listesi yüklenemedi:", error);
        setBranches(["A", "B", "C", "D", "E", "F"]);
      }
    } else {
      setBranches(["A", "B", "C", "D", "E", "F"]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const savedTheme = localStorage.getItem("kutuphane_theme");
    const initialTheme = savedTheme === "dark" ? "dark" : "light";
    setThemePreference(initialTheme);
    applyThemePreference(initialTheme);
  }, []);

  // Sistem ayarlarını yükle
  useEffect(() => {
    const loadSystemSettings = async () => {
      try {
        const response = await httpClient.get<{ maxBorrowLimit: number; maxPenaltyPoints: number; isSingleBookAddEnabled?: boolean }>("/system-settings");
        setMaxBorrowLimit(response.maxBorrowLimit);
        setPenaltyLimit(response.maxPenaltyPoints);
        if (response.isSingleBookAddEnabled !== undefined) {
          setIsSingleBookAddEnabled(response.isSingleBookAddEnabled);
        }
      } catch (error) {
        console.error("Sistem ayarları yüklenemedi:", error);
        // Default değerler zaten set edilmiş
      }
    };
    loadSystemSettings();
  }, []);

  // Sistem ayarlarını kaydet
  // Not: Artık otomatik kaydetmek yerine, kullanıcı input'tan çıkar çıkmaz veya bir "Kaydet" butonu ile değil,
  // değişiklik olduğunda useEffect ile debounced kaydetme veya mevcut "Kaydet" butonu yapısını koruma.
  // Kullanıcı arayüzünde kaydet butonu kaldırıldı ve input change ile state güncelleniyor.
  // Otomatik kaydetme için useEffect ekleyelim veya input onChange'de kaydetme çağıralım. 
  // Ancak önceki kodda "Sistem Ayarlarını Kaydet" butonu kaldırıldığı için, bu fonksiyonu
  // inputların onChange/onBlur eventlerinde çağırmak mantıklı olabilir.
  // Şimdilik state değiştiğinde otomatik kaydetsin.

  useEffect(() => {
    const saveTimer = setTimeout(() => {
      if (borrowLimit > 0 && penaltyLimit > 0) {
        saveSystemSettings();
      }
    }, 1000);
    return () => clearTimeout(saveTimer);
  }, [borrowLimit, penaltyLimit, isSingleBookAddEnabled]);


  const saveSystemSettings = async () => {
    if (maxBorrowLimit < 1) {
      // notify("Hata", "Kitap alma sınırı en az 1 olmalıdır.", "error", "❌");
      return;
    }
    if (penaltyLimit < 1) {
      // notify("Hata", "Ceza puanı sınırı en az 1 olmalıdır.", "error", "❌");
      return;
    }
    try {
      setLoadingSettings(true);
      await httpClient.put("/system-settings", {
        maxBorrowLimit,
        maxPenaltyPoints: penaltyLimit,
        isSingleBookAddEnabled
      });
      // notify("Başarılı", "Sistem ayarları kaydedildi.", "success", "✅");
      // Otomatik kayıtta sürekli bildirim göstermek rahatsız edici olabilir, sadece hata durumunda gösterelim.
    } catch (error: any) {
      notify("Hata", error?.message || "Sistem ayarları kaydedilirken bir hata oluştu.", "error", "❌");
    } finally {
      setLoadingSettings(false);
    }
  };

  // Şube ekle
  const handleAddBranch = () => {
    if (newBranch.trim() && !branches.includes(newBranch.trim().toUpperCase())) {
      const updatedBranches = [...branches, newBranch.trim().toUpperCase()].sort();
      setBranches(updatedBranches);
      localStorage.setItem("kutuphane_branches", JSON.stringify(updatedBranches));
      setNewBranch("");
      setShowAddBranch(false);
    }
  };

  // Şube sil
  const handleDeleteBranch = (branch: string) => {
    const updatedBranches = branches.filter(b => b !== branch);
    setBranches(updatedBranches);
    localStorage.setItem("kutuphane_branches", JSON.stringify(updatedBranches));
  };

  const applyThemePreference = (nextTheme: "light" | "dark") => {
    if (typeof document === "undefined") {
      return;
    }
    document.documentElement.setAttribute("data-theme", nextTheme);
    document.body?.setAttribute("data-theme", nextTheme);
  };

  const toggleThemePreference = () => {
    const nextTheme = themePreference === "light" ? "dark" : "light";
    setThemePreference(nextTheme);
    if (typeof window !== "undefined") {
      localStorage.setItem("kutuphane_theme", nextTheme);
    }
    applyThemePreference(nextTheme);
  };

  // Assuming SettingsModalProps interface is defined elsewhere in the file or imported.
  // If it's not, it should be added here. For this change, we assume it exists and needs modification.
  // Example structure if it were to be added:
  /*
  interface SettingsModalProps {
    user: UserResponse;
    onClose: () => void;
    onAutoRecordSettingsChanged?: (settings?: { enabled: boolean; interval: number }) => void;
    notificationSettings: NotificationSettings;
    onNotificationSettingsChange: (settings: NotificationSettings) => void;
    onShowInfo?: (title: string, message: string, type: "info" | "success" | "warning" | "error", icon?: string) => void;
  }
  */

  // Otomatik kayıt ayarlarını otomatik kaydet
  const saveAutoRecordSettings = async (enabled: boolean, interval: number) => {
    try {
      await httpClient.post(`/record-types/${user.username}/auto-record-settings`, {
        autoRecordEnabled: enabled,
        autoRecordIntervalMinutes: interval
      });
      // App.tsx'e haber ver ki timer'ı yeniden başlatsın - yeni değerleri direkt gönder
      if (onAutoRecordSettingsChanged) {
        onAutoRecordSettingsChanged({ enabled, interval });
      }
    } catch (error: any) {
      console.error("Otomatik kayıt ayarları kaydedilemedi:", error);
    }
  };

  // Backend'den gelen tam yolu "Masaüstü/" formatına çevir
  const convertToDesktopPath = (fullPath: string): string => {
    if (fullPath === "Masaüstü" || fullPath.startsWith("Masaüstü/") || fullPath.startsWith("Masaüstü\\")) {
      return fullPath.replace(/\\/g, "/");
    }

    if (fullPath.includes("Desktop")) {
      const desktopMatch = fullPath.match(/(.*?Desktop)(.*)/);
      if (desktopMatch) {
        const afterDesktop = desktopMatch[2].replace(/\\/g, "/").replace(/^\//, "");
        if (!afterDesktop || afterDesktop === "") {
          return "Masaüstü";
        }
        return `Masaüstü/${afterDesktop}`;
      }
      return "Masaüstü";
    }

    return fullPath.replace(/\\/g, "/");
  };

  // Klasör gezme fonksiyonları
  const openFolderBrowser = async (callback: (path: string) => void, initialPath?: string) => {
    folderBrowserCallbackRef.current = callback;
    setShowFolderBrowser(true);
    setCurrentBrowsePath(null);

    try {
      const browsePath = initialPath || activeRecordType?.filePath || "Masaüstü/KütüphaneApp";
      const response = await httpClient.get<BrowseResponse>("/filesystem/browse", { path: browsePath });

      setCurrentBrowsePath(response.currentPath);
      setFolderItems(response.items.map(item => ({
        name: item.name,
        path: item.path,
        type: item.type as "directory" | "file"
      })));
    } catch (error) {
      console.error("Klasör listesi alınamadı:", error);
      try {
        const response = await httpClient.get<BrowseResponse>("/filesystem/browse");
        setCurrentBrowsePath(response.currentPath);
        setFolderItems(response.items.map(item => ({
          name: item.name,
          path: item.path,
          type: item.type as "directory" | "file"
        })));
      } catch (fallbackError) {
        notify("Hata", "Klasör listesi alınamadı: " + (error instanceof Error ? error.message : "Bilinmeyen hata"), "error", "❌");
      }
    }
  };

  const browseFolder = async (path: string) => {
    try {
      const pathToSend = path === "Masaüstü" ? undefined : path;
      const response = await httpClient.get<BrowseResponse>("/filesystem/browse", pathToSend ? { path: pathToSend } : undefined);
      setCurrentBrowsePath(response.currentPath);
      setFolderItems(response.items.map(item => ({
        name: item.name,
        path: item.path,
        type: item.type as "directory" | "file"
      })));
    } catch (error) {
      console.error("Klasör listesi alınamadı:", error);
      notify("Hata", "Klasör listesi alınamadı: " + (error instanceof Error ? error.message : "Bilinmeyen hata"), "error", "❌");
    }
  };

  const selectFolder = (selectedPath: string) => {
    if (folderBrowserCallbackRef.current) {
      const convertedPath = convertToDesktopPath(selectedPath);
      folderBrowserCallbackRef.current(convertedPath);
    }
    setShowFolderBrowser(false);
    folderBrowserCallbackRef.current = null;
  };

  // Breadcrumb için path parçalarını al
  const getPathParts = (fullPath: string | null): Array<{ name: string; path: string }> => {
    if (!fullPath) {
      return [{ name: "Masaüstü", path: "Masaüstü" }];
    }

    const parts: Array<{ name: string; path: string }> = [];
    let desktopPath = convertToDesktopPath(fullPath);

    if (fullPath.includes("Desktop")) {
      const desktopMatch = fullPath.match(/(.*?Desktop)(.*)/);
      if (desktopMatch) {
        const afterDesktop = desktopMatch[2].replace(/\\/g, "/").replace(/^\//, "");
        desktopPath = afterDesktop ? `Masaüstü/${afterDesktop}` : "Masaüstü";
      } else {
        desktopPath = "Masaüstü";
      }
    }

    const pathSegments = desktopPath.split(/[/\\]/).filter(p => p);

    let currentPath = "";
    pathSegments.forEach((segment, index) => {
      if (index === 0 && (segment === "Masaüstü" || segment === "Desktop")) {
        currentPath = "Masaüstü";
        parts.push({ name: "Masaüstü", path: "Masaüstü" });
      } else {
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        parts.push({ name: segment, path: currentPath });
      }
    });

    return parts;
  };

  // Bilgilendirme penceresi dışına tıklandığında kapat
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showGeneralInfo && !target.closest('[data-info-popover="info-popover-general"]') && !target.closest('[data-info-button="info-button-general"]')) {
        setShowGeneralInfo(false);
      }
      if (showRecordsInfo && !target.closest('[data-info-popover="info-popover-records"]') && !target.closest('[data-info-button="info-button-records"]')) {
        setShowRecordsInfo(false);
      }
      if (showOtherInfo && !target.closest('[data-info-popover="info-popover-other"]') && !target.closest('[data-info-button="info-button-other"]')) {
        setShowOtherInfo(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showGeneralInfo, showRecordsInfo, showOtherInfo]);

  // Bilgilendirme butonu render fonksiyonu
  const renderInfoButton = (type: "general" | "records" | "other", showInfo: boolean, setShowInfo: (show: boolean) => void) => {
    const buttonId = `info-button-${type}`;
    const popoverId = `info-popover-${type}`;

    // Bilgi içerikleri
    const infoContent = {
      general: {
        title: "Genel Ayarlar",
        headerIcon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        ),
        items: [
          {
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#2563eb" }}>
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            ),
            title: "Tema Seçimi",
            desc: "Kütüphane arayüzünü günün saatine veya kişisel tercihinize göre Aydınlık, Karanlık veya Sistem temasında kullanabilirsiniz."
          },
          {
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#d97706" }}>
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
            ),
            title: "Bildirim Ayarları",
            desc: "Kitap iadesi, stok uyarısı veya sistem mesajları gibi hangi durumlarda bildirim almak istediğinizi özelleştirebilirsiniz."
          }
        ]
      },
      records: {
        title: "Kayıt ve Otomatik İşlemler",
        headerIcon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
            <polyline points="17 21 17 13 7 13 7 21"></polyline>
            <polyline points="7 3 7 8 15 8"></polyline>
          </svg>
        ),
        items: [
          {
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#16a34a" }}>
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            ),
            title: "Otomatik Kayıt",
            desc: "Verilerinizin güvenliği için belirlediğiniz aralıklarla (örn. her 30 dakikada bir) sistemin otomatik yedek almasını sağlayabilirsiniz."
          },
          {
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#7c3aed" }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            ),
            title: "Özel Raporlar",
            desc: "Farklı ihtiyaçlar için özel Excel rapor şablonları oluşturabilir, her şablon için hangi verilerin kaydedileceğini seçebilirsiniz."
          }
        ]
      },
      other: {
        title: "Sistem ve Veritabanı",
        headerIcon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
            <line x1="8" y1="21" x2="16" y2="21"></line>
            <line x1="12" y1="17" x2="12" y2="21"></line>
          </svg>
        ),
        items: [
          {
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#ef4444" }}>
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            ),
            title: "Sistem Kısıtlamaları",
            desc: "Ödünç kitap sayısı sınırı ve ceza puanı limiti gibi kuralları belirleyerek kütüphane işleyişini kontrol altında tutabilirsiniz."
          },
          {
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#2563eb" }}>
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                <path d="M3 5v14c0 1.66 4 3 9 3s 9-1.34 9-3V5"></path>
              </svg>
            ),
            title: "Veritabanı Merkezi",
            desc: "Gelişmiş veritabanı işlemlerine (yedekleme, geri yükleme, Excel ile toplu işlem) hızlıca erişebilirsiniz."
          }
        ]
      }
    };

    const currentInfo = infoContent[type];

    return (
      <div style={{ position: "relative", zIndex: 10000 }}>
        <button
          data-info-button={buttonId}
          onClick={() => setShowInfo(!showInfo)}
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            border: "2px solid",
            borderColor: showInfo ? "#3b82f6" : "#fbbf24",
            background: showInfo ? "#eff6ff" : "#fef9e7",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "20px",
            color: showInfo ? "#1d4ed8" : "#d97706",
            transition: "all 0.2s",
            fontWeight: 700,
            boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
            padding: 0,
          }}
          title="Bilgi"
          onMouseEnter={(e) => {
            if (!showInfo) {
              e.currentTarget.style.backgroundColor = "#fef3c7";
              e.currentTarget.style.borderColor = "#f59e0b";
            }
          }}
          onMouseLeave={(e) => {
            if (!showInfo) {
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
            stroke={showInfo ? "#1d4ed8" : "#d97706"}
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
        {showInfo && (
          <div
            data-info-popover={popoverId}
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
              animation: "fadeIn 0.2s ease-out"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Dekoratif Ok */}
            <div
              style={{
                position: "absolute",
                top: "-8px",
                right: "12px", // Butonun ortasına denk gelmesi için ayarlandı
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
                <h3 style={{ marginTop: 0, marginBottom: "10px", fontSize: "16px", fontWeight: 600, color: "#1e293b", display: "flex", alignItems: "center", gap: "6px" }}>
                  {currentInfo.headerIcon}
                  {currentInfo.title}
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px", color: "#475569", lineHeight: "1.5" }}>
                  {currentInfo.items.map((item, index) => (
                    <p key={index} style={{ margin: 0 }}>
                      <strong style={{ color: "#1e293b" }}>{item.title}:</strong> {item.desc}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()} style={{ position: "relative" }}>
        {renderConfirmCard()}
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#667eea" }}>
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            <h2>Ayarlar</h2>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div className="settings-tabs" style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              className={`tab-button ${activeTab === "general" ? "active" : ""}`}
              onClick={() => setActiveTab("general")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="9" y1="3" x2="9" y2="21"></line>
              </svg>
              <span>Genel Ayarlar</span>
            </button>
            {!isAdmin && (
              <>
                <button
                  className={`tab-button ${activeTab === "records" ? "active" : ""}`}
                  onClick={() => setActiveTab("records")}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                  </svg>
                  <span>Kayıt Ayarları</span>
                </button>
                <button
                  className={`tab-button ${activeTab === "other" ? "active" : ""}`}
                  onClick={() => setActiveTab("other")}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                  </svg>
                  <span>Diğer</span>
                </button>
              </>
            )}
          </div>
          <div style={{ position: "relative" }}>
            {activeTab === "general" && renderInfoButton("general", showGeneralInfo, setShowGeneralInfo)}
            {!isAdmin && activeTab === "records" && renderInfoButton("records", showRecordsInfo, setShowRecordsInfo)}
            {activeTab === "other" && renderInfoButton("other", showOtherInfo, setShowOtherInfo)}
          </div>
        </div>
        <div className="modal-body">
          {activeTab === "general" && (
            <>
              {/* Tema Ayarları */}
              <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px", marginTop: "4px" }}>
                Tema Ayarları
              </h3>
              <div
                className="settings-section"
                style={{
                  border: "1px solid rgba(226, 232, 240, 0.8)",
                  borderRadius: "10px",
                  padding: "18px",
                  backgroundColor: "#ffffff",
                  marginBottom: "24px",
                  boxShadow: "0 2px 8px rgba(15, 23, 42, 0.05)"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 auto" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                      {themePreference === "dark" ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#818cf8" }}>
                          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                        </svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#f59e0b" }}>
                          <circle cx="12" cy="12" r="5"></circle>
                          <line x1="12" y1="1" x2="12" y2="3"></line>
                          <line x1="12" y1="21" x2="12" y2="23"></line>
                          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                          <line x1="1" y1="12" x2="3" y2="12"></line>
                          <line x1="21" y1="12" x2="23" y2="12"></line>
                        </svg>
                      )}
                      <span style={{ color: "#1e293b", fontWeight: 600, fontSize: "15px" }}>
                        {themePreference === "dark" ? "Koyu Tema" : "Açık Tema"}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
                      Uygulamanın görünümünü {themePreference === "dark" ? "koyu" : "açık"} moda geçirin.
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: themePreference === "light" ? "#1e293b" : "#94a3b8", transition: "color 0.3s" }}>Açık</span>
                    <button
                      type="button"
                      onClick={() => {
                        // Butona tıklandığında hafif bir gecikme ekleyerek geçişin hissedilmesini sağla
                        toggleThemePreference();
                      }}
                      role="switch"
                      aria-checked={themePreference === "dark"}
                      style={{
                        width: "64px",
                        height: "32px",
                        borderRadius: "999px",
                        border: "none",
                        padding: "4px",
                        background: themePreference === "dark" ? "#312e81" : "#e2e8f0", // Koyu modda daha belirgin renk
                        display: "flex",
                        alignItems: "center",
                        justifyContent: themePreference === "dark" ? "flex-end" : "flex-start",
                        cursor: "pointer",
                        boxShadow: themePreference === "dark" ? "inset 0 2px 4px rgba(0,0,0,0.3)" : "inset 0 1px 4px rgba(15, 23, 42, 0.1)",
                        transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)", // Daha yumuşak geçiş
                        position: "relative"
                      }}
                    >
                      <span
                        style={{
                          width: "24px",
                          height: "24px",
                          borderRadius: "50%",
                          backgroundColor: "#ffffff",
                          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                          color: themePreference === "dark" ? "#312e81" : "#f59e0b"
                        }}
                      >
                        {themePreference === "dark" ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                          </svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="5"></circle>
                            <line x1="12" y1="1" x2="12" y2="3"></line>
                            <line x1="12" y1="21" x2="12" y2="23"></line>
                            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                            <line x1="1" y1="12" x2="3" y2="12"></line>
                            <line x1="21" y1="12" x2="23" y2="12"></line>
                          </svg>
                        )}
                      </span>
                    </button>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: themePreference === "dark" ? "#1e293b" : "#94a3b8", transition: "color 0.3s" }}>Koyu</span>
                  </div>
                </div>
              </div>

              {/* Admin Recovery Code Section */}
              {isAdmin && (
                <>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px", marginTop: "24px" }}>
                    Güvenlik
                  </h3>
                  <div className="settings-section">
                    <div className="setting-item" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", backgroundColor: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#3b82f6" }}>
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                          </svg>
                          <span style={{ color: "#1e293b", fontWeight: 600, fontSize: "15px" }}>
                            Kurtarma Kodu
                          </span>
                        </div>
                        <p style={{ margin: "8px 0 0 30px", fontSize: "13px", color: "#64748b", lineHeight: "1.5" }}>
                          Admin şifrenizi unutursanız, kurtarma kodu ile şifrenizi sıfırlayabilirsiniz.
                        </p>
                      </div>



                      <button
                        onClick={handleShowRecoveryCode}
                        disabled={recoveryCodeLoading || hasActiveRecoveryCode}
                        style={{
                          padding: "10px 20px",
                          background: (recoveryCodeLoading || hasActiveRecoveryCode) ? "#94a3b8" : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                          color: "white",
                          border: "none",
                          borderRadius: "8px",
                          fontSize: "14px",
                          fontWeight: "600",
                          cursor: (recoveryCodeLoading || hasActiveRecoveryCode) ? "not-allowed" : "pointer",
                          boxShadow: "0 2px 8px rgba(16, 185, 129, 0.2)",
                          transition: "all 0.2s",
                          whiteSpace: "nowrap",
                          opacity: hasActiveRecoveryCode ? 0.6 : 1
                        }}
                        title={hasActiveRecoveryCode ? "Aktif kurtarma kodunuz zaten var" : ""}
                      >
                        {recoveryCodeLoading ? "Oluşturuluyor..." : hasActiveRecoveryCode ? "🔒 Aktif Kod Mevcut" : "🔑 Kurtarma Kodu Üret"}
                      </button>
                    </div>

                    {/* Security Documentation */}
                    <div style={{
                      marginTop: "16px",
                      backgroundColor: "#eff6ff",
                      border: "1px solid #bfdbfe",
                      borderRadius: "12px",
                      padding: "16px 20px"
                    }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "#3b82f6", flexShrink: 0, marginTop: "2px" }}>
                          <circle cx="12" cy="12" r="10"></circle>
                          <line x1="12" y1="16" x2="12" y2="12"></line>
                          <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                        <div style={{ flex: 1 }}>
                          <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "#1e40af", marginBottom: "8px" }}>
                            📋 Kurtarma Kodu Nasıl Kullanılır?
                          </h4>
                          <ol style={{ margin: "8px 0 0 0", padding: "0 0 0 20px", fontSize: "13px", color: "#1e40af", lineHeight: "1.8" }}>
                            <li><strong>Kod Üretimi:</strong> "Kurtarma Kodu Üret" butonuna tıklayın. Kod otomatik olarak kopyalanır ve yazdırma penceresi açılır.</li>
                            <li><strong>Güvenli Saklama:</strong> Kodu fiziksel olarak güvenli bir yerde saklayın (yazdırın veya not edin).</li>
                            <li><strong>Kullanım:</strong> Şifrenizi unutursanız, login ekranında şifre yerine kurtarma kodunu girin.</li>
                            <li><strong>Tek Kullanımlık:</strong> Kod kullanıldıktan sonra geçersiz olur. Yeni kod üretmeniz gerekir.</li>
                            <li><strong>Süresiz Geçerlilik:</strong> Kod kullanılana kadar süresiz geçerlidir.</li>
                          </ol>

                          {/* Reset Link - Alt Kısımda */}
                          {hasActiveRecoveryCode && !recoveryCodeLoading && (
                            <div style={{
                              marginTop: "16px",
                              paddingTop: "16px",
                              borderTop: "1px solid #bfdbfe"
                            }}>
                              <div style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "12px"
                              }}>
                                <div style={{ flex: 1 }}>
                                  <p style={{ margin: 0, fontSize: "13px", color: "#1e40af", fontWeight: 500 }}>
                                    🔒 Kurtarma kodunuzu kaybettiniz mi?
                                  </p>
                                  <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#60a5fa", lineHeight: "1.4" }}>
                                    Admin şifrenizle sıfırlayabilir ve yeni kod üretebilirsiniz
                                  </p>
                                </div>
                                <button
                                  onClick={handleResetRecoveryCode}
                                  style={{
                                    background: "linear-gradient(135deg, #ef4444, #dc2626)",
                                    border: "none",
                                    color: "white",
                                    fontSize: "13px",
                                    fontWeight: "600",
                                    cursor: "pointer",
                                    padding: "8px 16px",
                                    borderRadius: "8px",
                                    whiteSpace: "nowrap",
                                    boxShadow: "0 2px 6px rgba(239, 68, 68, 0.3)",
                                    transition: "all 0.2s"
                                  }}
                                  onMouseOver={(e) => e.currentTarget.style.transform = "translateY(-1px)"}
                                  onMouseOut={(e) => e.currentTarget.style.transform = "translateY(0)"}
                                >
                                  🔄 Kodu Sıfırla
                                </button>
                              </div>
                            </div>
                          )}

                          <div style={{
                            marginTop: "12px",
                            padding: "10px 12px",
                            backgroundColor: "#fee2e2",
                            border: "1px solid #fecaca",
                            borderRadius: "8px"
                          }}>
                            <p style={{ margin: 0, fontSize: "12px", color: "#991b1b", fontWeight: 500 }}>
                              ⚠️ <strong>Önemli:</strong> Kurtarma kodunu kimseyle paylaşmayın
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {!isAdmin && (
                <>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px", marginTop: "24px" }}>
                    Bildirim Tercihleri
                  </h3>
                  <div className="settings-section">
                    <h3 style={{ display: "none" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle", marginRight: "8px" }}>
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                      </svg>
                      Bildirimler
                    </h3>
                    <div className="setting-item">
                      <label style={{ color: "#1e293b", fontWeight: 600, display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                        <div style={{ position: "relative", width: "40px", height: "22px" }}>
                          <input
                            type="checkbox"
                            checked={notifications}
                            onChange={(e) => setNotifications(e.target.checked)}
                            style={{ opacity: 0, width: 0, height: 0 }}
                          />
                          <span style={{
                            position: "absolute", cursor: "pointer", top: 0, left: 0, right: 0, bottom: 0,
                            backgroundColor: notifications ? "#2563eb" : "#ccc", transition: "0.3s", borderRadius: "22px"
                          }}></span>
                          <span style={{
                            position: "absolute", content: '""', height: "16px", width: "16px", left: notifications ? "20px" : "4px", bottom: "3px",
                            backgroundColor: "white", transition: "0.3s", borderRadius: "50%"
                          }}></span>
                        </div>
                        <span style={{ color: "#1e293b" }}>Sistem bildirimlerini etkinleştir</span>
                      </label>
                      {notifications && (
                        <div className="setting-item" style={{ marginTop: "20px", marginLeft: "4px" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "24px" }}>
                            <div>
                              <div style={{ fontSize: "13px", fontWeight: 700, color: "#64748b", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                Veri İşlemleri
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", color: "#1e293b", fontWeight: 500, fontSize: "14px" }}>
                                  <input type="checkbox" checked={notificationTypes.studentAdd} onChange={(e) => setNotificationTypes({ ...notificationTypes, studentAdd: e.target.checked })} disabled={!notifications} style={{ accentColor: "#2563eb" }} />
                                  <span>Öğrenci Ekleme/Silme</span>
                                </label>
                                <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", color: "#1e293b", fontWeight: 500, fontSize: "14px" }}>
                                  <input type="checkbox" checked={notificationTypes.bookAdd} onChange={(e) => setNotificationTypes({ ...notificationTypes, bookAdd: e.target.checked })} disabled={!notifications} style={{ accentColor: "#2563eb" }} />
                                  <span>Kitap Ekleme/Silme</span>
                                </label>
                                <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", color: "#1e293b", fontWeight: 500, fontSize: "14px" }}>
                                  <input type="checkbox" checked={notificationTypes.bookBulkDelete} onChange={(e) => setNotificationTypes({ ...notificationTypes, bookBulkDelete: e.target.checked })} disabled={!notifications} style={{ accentColor: "#2563eb" }} />
                                  <span>Toplu İşlemler</span>
                                </label>
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: "13px", fontWeight: 700, color: "#64748b", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                Ödünç Durumu
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", color: "#1e293b", fontWeight: 500, fontSize: "14px" }}>
                                  <input type="checkbox" checked={notificationTypes.loanBorrow} onChange={(e) => setNotificationTypes({ ...notificationTypes, loanBorrow: e.target.checked })} disabled={!notifications} style={{ accentColor: "#2563eb" }} />
                                  <span>Ödünç Verme/Alma</span>
                                </label>
                                <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", color: "#1e293b", fontWeight: 500, fontSize: "14px" }}>
                                  <input type="checkbox" checked={notificationTypes.dueSoon} onChange={(e) => setNotificationTypes({ ...notificationTypes, dueSoon: e.target.checked })} disabled={!notifications} style={{ accentColor: "#2563eb" }} />
                                  <span>Teslim Yaklaşanlar</span>
                                </label>
                                <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", color: "#1e293b", fontWeight: 500, fontSize: "14px" }}>
                                  <input type="checkbox" checked={notificationTypes.overdue} onChange={(e) => setNotificationTypes({ ...notificationTypes, overdue: e.target.checked })} disabled={!notifications} style={{ accentColor: "#2563eb" }} />
                                  <span>Geciken Kitaplar</span>
                                </label>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px", marginTop: "24px" }}>
                Hesap Bilgileri
              </h3>
              <div className="settings-section">
                <h3 style={{ display: "none" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle", marginRight: "8px" }}>
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  Hesap Bilgileri
                </h3>
                <div className="setting-item">
                  <label>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle", marginRight: "8px", color: "#64748b" }}>
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    Kullanıcı Adı
                  </label>
                  <p className="readonly-value">{user.username}</p>
                </div>
                <div className="setting-item">
                  <label>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle", marginRight: "8px", color: "#64748b" }}>
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                      <circle cx="9" cy="7" r="4"></circle>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                    Rol
                  </label>
                  <p className="readonly-value">
                    {user.role === "personel" ? "Personel" : user.role === "ADMIN" ? "Yönetici" : user.role === "STUDENT" ? "Öğrenci" : user.role}
                  </p>
                </div>
              </div>

            </>
          )}
          {!isAdmin && activeTab === "records" && (
            <div className="records-tab" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0px", marginTop: "4px" }}>
                Otomatik Kayıt Yapılandırması
              </h3>
              <div
                className="settings-section"
                style={{
                  border: "1px solid rgba(226, 232, 240, 0.8)",
                  borderRadius: "10px",
                  padding: "18px",
                  backgroundColor: "#f8fafc",
                  boxShadow: "0 2px 8px rgba(15, 23, 42, 0.05)"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#2563eb" }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                  <div>
                    <span style={{ color: "#1e293b", fontWeight: 600, fontSize: "14px" }}>Otomatik Kayıt</span>
                    <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>
                      Belirlediğin aralıklarla kayıt dosyaları otomatik olarak güncellensin.
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <div style={{ position: "relative", width: "36px", height: "20px" }}>
                      <input
                        type="checkbox"
                        checked={autoRecordEnabled}
                        onChange={async (e) => {
                          const newValue = e.target.checked;
                          setAutoRecordEnabled(newValue);
                          await saveAutoRecordSettings(newValue, autoRecordIntervalMinutes);
                        }}
                        style={{ opacity: 0, width: 0, height: 0 }}
                      />
                      <span style={{
                        position: "absolute", cursor: "pointer", top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: autoRecordEnabled ? "#2563eb" : "#ccc", transition: "0.3s", borderRadius: "20px"
                      }}></span>
                      <span style={{
                        position: "absolute", content: '""', height: "14px", width: "14px", left: autoRecordEnabled ? "18px" : "4px", bottom: "3px",
                        backgroundColor: "white", transition: "0.3s", borderRadius: "50%"
                      }}></span>
                    </div>
                    <span style={{ color: "#1e293b", fontSize: "13px", fontWeight: 600 }}>Etkinleştir</span>
                  </label>
                  {autoRecordEnabled && (
                    <>
                      <span style={{ color: "#64748b", fontSize: "13px" }}>•</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ color: "#64748b", fontSize: "13px" }}>Aralık:</span>
                        <input
                          type="number"
                          min="1"
                          value={autoRecordIntervalMinutes}
                          onChange={async (e) => {
                            const value = parseInt(e.target.value, 10);
                            if (!isNaN(value) && value >= 1) {
                              setAutoRecordIntervalMinutes(value);
                              await saveAutoRecordSettings(autoRecordEnabled, value);
                            }
                          }}
                          style={{
                            width: "70px",
                            padding: "6px 10px",
                            border: "1px solid rgba(226, 232, 240, 0.8)",
                            borderRadius: "6px",
                            fontSize: "13px",
                            color: "#000000",
                            backgroundColor: "rgba(255, 255, 255, 0.5)"
                          }}
                          className="visible-spin-input"
                          placeholder="60"
                        />
                        <span style={{ color: "#64748b", fontSize: "13px" }}>dakika</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0px", marginTop: "12px" }}>
                Kayıt Tipleri
              </h3>
              {/* Her Kayıt Tipi İçin Kart */}
              {recordTypes.map((recordType) => {
                const isEditing = editingRecordTypeId === recordType.id;
                const labels: Record<string, string> = {
                  "ogrenci_bilgileri": "Öğrenci Bilgileri",
                  "personel_bilgileri": "Personel Bilgileri",
                  "kitap_listesi": "Kitap Listesi",
                  "odunc_bilgileri": "Ödünç Bilgileri"
                };

                return (
                  <div
                    key={recordType.id}
                    className="settings-section"
                    style={{
                      border: "2px solid rgba(59, 130, 246, 0.3)",
                      borderRadius: "12px",
                      padding: "20px",
                      backgroundColor: "#ffffff",
                      backdropFilter: "blur(10px)",
                      boxShadow: "0 4px 12px rgba(30, 64, 175, 0.15)"
                    }}
                  >
                    {/* Kart Başlığı */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                      <div>
                        <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px", color: "#1e293b", fontWeight: 700 }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#1e293b" }}>
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                          </svg>
                          {isEditing ? (
                            <input
                              type="text"
                              value={recordType.name}
                              onChange={(e) => {
                                const updated = recordTypes.map(rt =>
                                  rt.id === recordType.id ? { ...rt, name: e.target.value } : rt
                                );
                                setRecordTypes(updated);
                              }}
                              style={{ padding: "6px 12px", border: "2px solid rgba(226, 232, 240, 0.8)", borderRadius: "6px", fontSize: "16px", fontWeight: 600, background: "rgba(255, 255, 255, 0.8)", color: "#0f172a" }}
                            />
                          ) : (
                            <span>{recordType.name}</span>
                          )}
                        </h3>
                        <div style={{ fontSize: "13px", color: "#64748b", marginTop: "6px", fontWeight: 500 }}>
                          {recordType.isDefault ? "Tüm kullanıcılar için ortak" : "Kullanıcıya özel"}
                        </div>
                      </div>
                      {!recordType.isDefault && (
                        <div style={{ display: "flex", gap: "8px" }}>
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUpdateRecordType(recordType)}
                                style={{
                                  padding: "8px 16px",
                                  borderRadius: "8px",
                                  border: "2px solid #3b82f6",
                                  backgroundColor: "#3b82f6",
                                  color: "white",
                                  cursor: "pointer",
                                  fontSize: "14px",
                                  fontWeight: 600
                                }}
                              >
                                Kaydet
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingRecordTypeId(null)}
                                style={{
                                  padding: "8px 16px",
                                  borderRadius: "8px",
                                  border: "2px solid rgba(226, 232, 240, 0.8)",
                                  backgroundColor: "rgba(241, 245, 249, 0.8)",
                                  color: "#1e293b",
                                  cursor: "pointer",
                                  fontSize: "14px",
                                  fontWeight: 600
                                }}
                              >
                                İptal
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => setEditingRecordTypeId(recordType.id)}
                                style={{
                                  padding: "8px 12px",
                                  borderRadius: "8px",
                                  border: "2px solid rgba(226, 232, 240, 0.8)",
                                  backgroundColor: "rgba(241, 245, 249, 0.8)",
                                  cursor: "pointer",
                                  fontSize: "14px",
                                  color: "#0f172a"
                                }}
                                title="Düzenle"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRecordType(recordType.id)}
                                style={{
                                  padding: "8px 12px",
                                  borderRadius: "8px",
                                  border: "2px solid rgba(239, 68, 68, 0.3)",
                                  backgroundColor: "rgba(254, 242, 242, 0.8)",
                                  cursor: "pointer",
                                  fontSize: "14px",
                                  color: "#dc2626"
                                }}
                                title="Sil"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6"></polyline>
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Kayıt Yolu */}
                    <div className="setting-item" style={{ marginBottom: "16px" }}>
                      <label>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle", marginRight: "8px", color: "#1e293b" }}>
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                          <circle cx="12" cy="10" r="3"></circle>
                        </svg>
                        Kayıt Yolu
                      </label>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <input
                          type="text"
                          value={recordType.filePath}
                          onChange={(e) => {
                            const updated = recordTypes.map(rt =>
                              rt.id === recordType.id ? { ...rt, filePath: e.target.value } : rt
                            );
                            setRecordTypes(updated);
                          }}
                          disabled={recordType.isDefault || !isEditing}
                          style={{
                            flex: 1,
                            padding: "10px 14px",
                            border: "2px solid rgba(226, 232, 240, 0.8)",
                            borderRadius: "8px",
                            fontSize: "14px",
                            background: recordType.isDefault || !isEditing ? "rgba(241, 245, 249, 0.6)" : "#ffffff",
                            color: "#1e293b",
                            fontWeight: 500
                          }}
                          placeholder="Dosya yolu seçin veya yazın"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (!recordType.isDefault) {
                              openFolderBrowser((selectedPath) => {
                                const updated = recordTypes.map(rt =>
                                  rt.id === recordType.id ? { ...rt, filePath: selectedPath } : rt
                                );
                                setRecordTypes(updated);
                              }, recordType.filePath);
                            }
                          }}
                          disabled={recordType.isDefault || !isEditing}
                          style={{
                            padding: "10px 14px",
                            border: "2px solid rgba(226, 232, 240, 0.8)",
                            borderRadius: "8px",
                            background: (recordType.isDefault || !isEditing) ? "rgba(241, 245, 249, 0.6)" : "rgba(59, 130, 246, 0.1)",
                            cursor: (recordType.isDefault || !isEditing) ? "not-allowed" : "pointer",
                            color: "#1e293b",
                            fontSize: "14px",
                            fontWeight: 600
                          }}
                          title="Klasör seç"
                        >
                          ...
                        </button>
                      </div>
                    </div>

                    {/* Kaydedilecek Veriler */}
                    <div className="setting-item">
                      <label>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle", marginRight: "8px", color: "#1e293b" }}>
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                          <polyline points="14 2 14 8 20 8"></polyline>
                          <line x1="16" y1="13" x2="8" y2="13"></line>
                          <line x1="16" y1="17" x2="8" y2="17"></line>
                        </svg>
                        Kaydedilecek Veriler
                      </label>
                      <div className="data-types-checkboxes" style={{ marginTop: "12px" }}>
                        {["ogrenci_bilgileri", "personel_bilgileri", "kitap_listesi", "odunc_bilgileri"].map((dataType) => (
                          <label key={dataType} className="checkbox-label" style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px", cursor: (recordType.isDefault || !isEditing) ? "not-allowed" : "pointer", color: "#1e293b", fontWeight: 600 }}>
                            <input
                              type="checkbox"
                              checked={recordType.dataTypes.includes(dataType)}
                              onChange={(e) => {
                                if (!recordType.isDefault && isEditing) {
                                  const updated = recordTypes.map(rt => {
                                    if (rt.id === recordType.id) {
                                      if (e.target.checked) {
                                        return { ...rt, dataTypes: [...rt.dataTypes, dataType] };
                                      } else {
                                        return { ...rt, dataTypes: rt.dataTypes.filter(t => t !== dataType) };
                                      }
                                    }
                                    return rt;
                                  });
                                  setRecordTypes(updated);
                                }
                              }}
                              disabled={recordType.isDefault || !isEditing}
                              style={{ width: "20px", height: "20px", cursor: (recordType.isDefault || !isEditing) ? "not-allowed" : "pointer", accentColor: "#2563eb" }}
                            />
                            <span style={{ color: "#1e293b" }}>{labels[dataType]}</span>
                          </label>
                        ))}
                      </div>
                      <small style={{ color: "#475569", fontSize: "13px", marginTop: "12px", display: "block", fontWeight: 500 }}>
                        {recordType.saveMode === "overwrite"
                          ? "Seçilen veriler tek Excel dosyasında farklı sayfalara kaydedilecektir."
                          : "Seçilen her veri tipi için ayrı Excel dosyası oluşturulacaktır."}
                      </small>
                    </div>

                  </div>
                );
              })}

              {/* Yeni Kayıt Türü Ekle Formu - Kart Olarak */}
              {showNewRecordForm && (
                <div
                  className="settings-section"
                  style={{
                    border: "2px solid #667eea",
                    borderRadius: "12px",
                    padding: "20px",
                    backgroundColor: "white",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
                  }}
                >
                  <h3 style={{ marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="12" y1="18" x2="12" y2="12"></line>
                      <line x1="9" y1="15" x2="15" y2="15"></line>
                    </svg>
                    Yeni Kayıt Türü Ekle
                  </h3>

                  <div className="setting-item" style={{ marginBottom: "16px" }}>
                    <label>Kayıt Türü Adı</label>
                    <input
                      type="text"
                      value={newRecordName}
                      onChange={(e) => setNewRecordName(e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "14px" }}
                      placeholder="Örn: Günlük Rapor"
                    />
                  </div>

                  <div className="setting-item" style={{ marginBottom: "16px" }}>
                    <label>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle", marginRight: "8px", color: "#64748b" }}>
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                      </svg>
                      Kayıt Yolu
                    </label>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <input
                        type="text"
                        value={newRecordFilePath}
                        onChange={(e) => setNewRecordFilePath(e.target.value)}
                        style={{ flex: 1, padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "14px" }}
                        placeholder="Dosya yolu seçin veya yazın"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          openFolderBrowser((selectedPath) => {
                            setNewRecordFilePath(selectedPath);
                          }, newRecordFilePath);
                        }}
                        style={{
                          padding: "8px 12px",
                          border: "1px solid #d1d5db",
                          borderRadius: "6px",
                          background: "white",
                          cursor: "pointer",
                          color: "#374151",
                          fontSize: "14px",
                          fontWeight: 500
                        }}
                        title="Klasör seç"
                      >
                        ...
                      </button>
                    </div>
                  </div>

                  <div className="setting-item" style={{ marginBottom: "16px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", color: "#1e293b", fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={newRecordSaveToCurrentDateFolder}
                        onChange={(e) => setNewRecordSaveToCurrentDateFolder(e.target.checked)}
                        style={{ width: "20px", height: "20px", cursor: "pointer", accentColor: "#2563eb" }}
                      />
                      <span style={{ color: "#1e293b" }}>Güncel tarih klasörüne kaydet</span>
                    </label>
                    <small style={{ color: "#64748b", fontSize: "12px", marginTop: "4px", display: "block", marginLeft: "30px" }}>
                      İşaretlendiğinde, her çalışmada o günün tarihi için klasör açılır ve kayıtlar o klasöre kaydedilir (Tarih formatı: gg-aa-yyyy)
                    </small>
                  </div>

                  <div className="setting-item">
                    <label>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle", marginRight: "8px", color: "#64748b" }}>
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                      </svg>
                      Kaydedilecek Veriler
                    </label>
                    <div className="data-types-checkboxes" style={{ marginTop: "12px" }}>
                      {["ogrenci_bilgileri", "personel_bilgileri", "kitap_listesi", "odunc_bilgileri"].map((dataType) => {
                        const labels: Record<string, string> = {
                          "ogrenci_bilgileri": "Öğrenci Bilgileri",
                          "personel_bilgileri": "Personel Bilgileri",
                          "kitap_listesi": "Kitap Listesi",
                          "odunc_bilgileri": "Ödünç Bilgileri"
                        };
                        return (
                          <label key={dataType} className="checkbox-label" style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px", cursor: "pointer", color: "#1e293b", fontWeight: 600 }}>
                            <input
                              type="checkbox"
                              checked={newRecordDataTypes.includes(dataType)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setNewRecordDataTypes([...newRecordDataTypes, dataType]);
                                } else {
                                  setNewRecordDataTypes(newRecordDataTypes.filter(t => t !== dataType));
                                }
                              }}
                              style={{ width: "20px", height: "20px", cursor: "pointer", accentColor: "#2563eb" }}
                            />
                            <span style={{ color: "#1e293b" }}>{labels[dataType]}</span>
                          </label>
                        );
                      })}
                    </div>
                    <small style={{ color: "#64748b", fontSize: "12px", marginTop: "8px", display: "block" }}>
                      Seçilen her veri tipi için ayrı Excel dosyası oluşturulacaktır.
                    </small>
                  </div>

                  <div style={{ display: "flex", gap: "8px", marginTop: "20px" }}>
                    <button
                      type="button"
                      className="action-btn secondary"
                      onClick={() => {
                        setShowNewRecordForm(false);
                        setNewRecordName("");
                        setNewRecordDataTypes(["kitap_listesi", "odunc_bilgileri"]);
                        setNewRecordFilePath("");
                        setNewRecordSaveToCurrentDateFolder(true);
                      }}
                      style={{ flex: 1 }}
                    >
                      İptal
                    </button>
                    <button
                      type="button"
                      className="action-btn primary"
                      onClick={handleSaveNewRecordType}
                      style={{ flex: 1 }}
                    >
                      Kaydet
                    </button>
                  </div>
                </div>
              )}

              {/* Yeni Kayıt Türü Ekle Butonu */}
              {!showNewRecordForm && recordTypes.filter(rt => !rt.isDefault).length < 2 && (
                <div style={{ marginTop: "24px", paddingTop: "24px", borderTop: "1px solid #e5e7eb" }}>
                  <button
                    type="button"
                    className="action-btn secondary"
                    onClick={handleAddNewRecordType}
                    style={{ width: "100%" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "8px" }}>
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Yeni Kayıt Türü Ekle
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === "other" && (
            <div className="other-tab">
              <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px", marginTop: "4px" }}>
                Sistem Yapılandırması
              </h3>
              {/* Sistem Ayarları */}
              <div className="settings-section">
                <h3 style={{ display: "none" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle", marginRight: "8px" }}>
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                  </svg>
                  Sistem Ayarları
                </h3>
                <div className="setting-item">
                  <label style={{ color: "#1e293b", fontWeight: 600, marginBottom: "8px", display: "block" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle", marginRight: "8px", color: "#64748b" }}>
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                    </svg>
                    Kitap Alma Sınırı
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={borrowLimit}
                    onChange={(e) => setBorrowLimit(parseInt(e.target.value) || 5)}
                    style={{
                      padding: "10px 14px",
                      border: "2px solid rgba(226, 232, 240, 0.8)",
                      borderRadius: "8px",
                      fontSize: "14px",
                      width: "100%",
                      maxWidth: "200px",
                      color: "#1e293b"
                    }}
                    placeholder="5"
                  />
                  <p style={{ color: "#64748b", fontSize: "12px", marginTop: "8px" }}>
                    Öğrencilerin aynı anda alabileceği maksimum kitap sayısı.
                  </p>
                </div>
                <div className="setting-item" style={{ marginTop: "16px" }}>
                  <label style={{ color: "#1e293b", fontWeight: 600, marginBottom: "8px", display: "block" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle", marginRight: "8px", color: "#64748b" }}>
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    Ceza Puanı Sınırı
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={penaltyLimit}
                    onChange={(e) => setPenaltyLimit(parseInt(e.target.value) || 100)}
                    style={{
                      padding: "10px 14px",
                      border: "2px solid rgba(226, 232, 240, 0.8)",
                      borderRadius: "8px",
                      fontSize: "14px",
                      width: "100%",
                      maxWidth: "200px",
                      color: "#1e293b"
                    }}
                    placeholder="100"
                  />
                  <p style={{ color: "#64748b", fontSize: "12px", marginTop: "8px" }}>
                    Ceza puanı bu sınıra ulaşan öğrencilere işlem kısıtlaması uygulanır.
                  </p>
                </div>

                <div className="setting-item" style={{ marginTop: "16px" }}>
                  <label style={{ color: "#1e293b", fontWeight: 600, marginBottom: "8px", display: "block" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle", marginRight: "8px", color: "#64748b" }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="16" y1="13" x2="8" y2="13"></line>
                      <line x1="16" y1="17" x2="8" y2="17"></line>
                      <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                    Tekil Kitap Eklenebilir
                  </label>
                  <div style={{ position: "relative", width: "36px", height: "20px", display: "inline-block", verticalAlign: "middle" }}>
                    <input
                      type="checkbox"
                      checked={isSingleBookAddEnabled}
                      onChange={(e) => setIsSingleBookAddEnabled(e.target.checked)}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: "absolute", cursor: "pointer", top: 0, left: 0, right: 0, bottom: 0,
                      backgroundColor: isSingleBookAddEnabled ? "#2563eb" : "#ccc", transition: "0.3s", borderRadius: "20px"
                    }} onClick={() => setIsSingleBookAddEnabled(!isSingleBookAddEnabled)}></span>
                    <span style={{
                      position: "absolute", content: '""', height: "14px", width: "14px", left: isSingleBookAddEnabled ? "18px" : "4px", bottom: "3px",
                      backgroundColor: "white", transition: "0.3s", borderRadius: "50%"
                    }} onClick={() => setIsSingleBookAddEnabled(!isSingleBookAddEnabled)}></span>
                  </div>
                  <span style={{ marginLeft: "10px", fontSize: "14px", color: "#1e293b", fontWeight: 500 }}>Etkin</span>
                  <p style={{ color: "#64748b", fontSize: "12px", marginTop: "8px" }}>
                    ISBN sorgulama ile tek tek kitap ekleme özelliğini açıp kapatır.
                  </p>
                </div>
              </div>

              {/* Veritabanı Admin Paneline Geçiş - SADECE ADMIN İÇİN */}
              {isAdmin && (
                <div className="settings-section" style={{ marginTop: "20px", border: "2px solid rgba(226, 232, 240, 0.8)", cursor: "pointer", transition: "all 0.2s ease" }}>
                  <div
                    onClick={() => window.open('/admin', '_blank')}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "rgba(37, 99, 235, 0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#2563eb" }}>
                          <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                          <path d="M3 5v14c0 1.66 4 3 9 3s 9-1.34 9-3V5"></path>
                        </svg>
                      </div>
                      <div>
                        <h4 style={{ margin: 0, color: "#1e293b", fontSize: "15px" }}>Veritabanı Yönetimi</h4>
                        <p style={{ margin: 0, color: "#64748b", fontSize: "13px" }}>Yedekleme, geri yükleme ve Excel işlemleri</p>
                      </div>
                    </div>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#94a3b8" }}>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                      <polyline points="12 5 19 12 12 19"></polyline>
                    </svg>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="settings-actions">
            <button className="action-btn secondary" onClick={onClose}>
              Kapat
            </button>
          </div>
        </div>
      </div>

      {/* Klasör Gezme Modal */}
      {showFolderBrowser && (
        <div
          className="modal-overlay"
          style={{ zIndex: 2000 }}
          onClick={() => {
            setShowFolderBrowser(false);
            folderBrowserCallbackRef.current = null;
          }}
        >
          <div className="modal-content" style={{ maxWidth: "800px", maxHeight: "80vh" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Klasör Seç</h2>
              <button
                className="modal-close"
                onClick={() => {
                  setShowFolderBrowser(false);
                  folderBrowserCallbackRef.current = null;
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="modal-body" style={{ padding: "20px" }}>
              <div style={{ marginBottom: "16px" }}>
                {/* Breadcrumb Navigation */}
                {currentBrowsePath && (
                  <div style={{ marginBottom: "12px", padding: "10px", backgroundColor: "#f9fafb", borderRadius: "6px", border: "1px solid #e5e7eb" }}>
                    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px" }}>
                      <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 500 }}>Konum:</span>
                      {getPathParts(currentBrowsePath).map((part, index, array) => (
                        <div key={index} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <button
                            type="button"
                            onClick={() => {
                              const pathToBrowse = part.path === "Masaüstü" ? "Masaüstü" : part.path;
                              browseFolder(pathToBrowse);
                            }}
                            style={{
                              padding: "4px 8px",
                              borderRadius: "4px",
                              border: "none",
                              backgroundColor: index === array.length - 1 ? "#e0e7ff" : "transparent",
                              color: index === array.length - 1 ? "#4338ca" : "#2563eb",
                              cursor: "pointer",
                              fontSize: "13px",
                              fontWeight: index === array.length - 1 ? 600 : 400,
                              transition: "all 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              if (index !== array.length - 1) {
                                e.currentTarget.style.backgroundColor = "#e0e7ff";
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (index !== array.length - 1) {
                                e.currentTarget.style.backgroundColor = "transparent";
                              }
                            }}
                            title={part.path}
                          >
                            {part.name}
                          </button>
                          {index < array.length - 1 && <span style={{ color: "#94a3b8", fontSize: "12px" }}>/</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Path Input ve Navigasyon Butonları */}
                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px" }}>
                  <input
                    type="text"
                    value={currentBrowsePath ? convertToDesktopPath(currentBrowsePath) : ""}
                    readOnly
                    style={{ flex: 1, padding: "8px", borderRadius: "6px", border: "1px solid #d1d5db", backgroundColor: "#f9fafb", fontFamily: "monospace", fontSize: "13px" }}
                    placeholder="Mevcut klasör yolu"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (currentBrowsePath) {
                        const pathParts = currentBrowsePath.split(/[/\\]/);
                        pathParts.pop();
                        const parentPath = pathParts.length > 0 ? pathParts.join("/") : null;
                        if (parentPath) {
                          browseFolder(parentPath);
                        } else {
                          browseFolder("Masaüstü");
                        }
                      }
                    }}
                    disabled={!currentBrowsePath || getPathParts(currentBrowsePath).length <= 1}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "6px",
                      border: "1px solid #d1d5db",
                      backgroundColor: "white",
                      cursor: !currentBrowsePath || getPathParts(currentBrowsePath).length <= 1 ? "not-allowed" : "pointer",
                      whiteSpace: "nowrap",
                      opacity: !currentBrowsePath || getPathParts(currentBrowsePath).length <= 1 ? 0.5 : 1,
                    }}
                    title="Üst klasöre git"
                  >
                    ↑ Üst
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      browseFolder("Masaüstü");
                    }}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "6px",
                      border: "1px solid #d1d5db",
                      backgroundColor: "white",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                    title="Masaüstüne git"
                  >
                    🏠 Masaüstü
                  </button>
                </div>
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: "6px", maxHeight: "400px", overflowY: "auto", backgroundColor: "white" }}>
                {folderItems.length === 0 ? (
                  <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>Klasör boş</div>
                ) : (
                  <div style={{ padding: "8px" }}>
                    {folderItems.map((item, index) => (
                      <div
                        key={index}
                        onClick={() => {
                          if (item.type === "directory") {
                            browseFolder(item.path);
                          }
                        }}
                        style={{
                          padding: "12px",
                          borderRadius: "6px",
                          cursor: item.type === "directory" ? "pointer" : "default",
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          marginBottom: "4px",
                          backgroundColor: item.type === "directory" ? "transparent" : "#f9fafb",
                          transition: "background-color 0.2s",
                        }}
                        onMouseEnter={(e) => {
                          if (item.type === "directory") {
                            e.currentTarget.style.backgroundColor = "#f3f4f6";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (item.type === "directory") {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }
                        }}
                      >
                        <div style={{ fontSize: "20px", width: "24px", textAlign: "center" }}>{item.type === "directory" ? "📁" : "📄"}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, marginBottom: "4px", color: item.type === "directory" ? "#1e293b" : "#64748b" }}>{item.name}</div>
                          {item.type === "file" && <div style={{ fontSize: "12px", color: "#6b7280" }}>Dosya</div>}
                        </div>
                        {item.type === "directory" && <div style={{ color: "#94a3b8", fontSize: "12px" }}>→</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ marginTop: "16px", display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowFolderBrowser(false);
                    folderBrowserCallbackRef.current = null;
                  }}
                  style={{ padding: "10px 20px", borderRadius: "6px", border: "1px solid #d1d5db", backgroundColor: "white", cursor: "pointer" }}
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!currentBrowsePath) {
                      notify("Hata", "Lütfen bir klasör seçin", "error", "❌");
                      return;
                    }
                    selectFolder(currentBrowsePath);
                  }}
                  style={{ padding: "10px 20px", borderRadius: "6px", border: "none", backgroundColor: "#2563eb", color: "white", cursor: "pointer", fontWeight: 600 }}
                >
                  Bu Klasörü Seç
                </button>
              </div>
            </div>
          </div>
        </div>
      )}



      {/* Recovery Code Display Modal */}
      {showRecoveryCodeModal && recoveryCode && createPortal(
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
            zIndex: 10003,
          }}
          onClick={() => setShowRecoveryCodeModal(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              padding: '40px',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px', color: '#1e293b', textAlign: 'center' }}>
              🔐 Kurtarma Kodu
            </h2>
            <p style={{ fontSize: '14px', color: '#64748b', textAlign: 'center', marginBottom: '32px' }}>
              Bu kodu güvenli bir yerde saklayın
            </p>

            <div
              style={{
                backgroundColor: '#f8fafc',
                border: '2px dashed #cbd5e1',
                borderRadius: '12px',
                padding: '32px',
                textAlign: 'center',
                marginBottom: '24px',
              }}
            >
              <div
                style={{
                  fontSize: '36px',
                  fontWeight: 'bold',
                  letterSpacing: '6px',
                  color: '#2563eb',
                  fontFamily: 'monospace',
                  userSelect: 'all'
                }}
              >
                {recoveryCode}
              </div>
            </div>

            <div
              style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '24px',
              }}
            >
              <p style={{ fontSize: '13px', color: '#dc2626', margin: 0, lineHeight: '1.6' }}>
                ⚠️ Bu kod <strong>sadece bir kere</strong> kullanılabilir ve <strong>süresizdir</strong>. Kullanıldıktan sonra yeni kod üretmeniz gerekir.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(recoveryCode);
                  notify("Başarılı", "Kurtarma kodu kopyalandı", "success", "✓");
                }}
                style={{
                  flex: 1,
                  padding: '14px 24px',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                Kopyala
              </button>
              <button
                onClick={() => setShowRecoveryCodeModal(false)}
                style={{
                  flex: 1,
                  padding: '14px 24px',
                  backgroundColor: '#f1f5f9',
                  color: '#475569',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Password Confirmation Modal for Recovery Code */}
      {showPasswordConfirmModal && createPortal(
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
            zIndex: 10002,
          }}
          onClick={() => {
            if (!recoveryCodeLoading) {
              setShowPasswordConfirmModal(false);
              setPasswordConfirmValue("");
              setPasswordConfirmError("");
            }
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              padding: '32px',
              maxWidth: '450px',
              width: '90%',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px', color: '#1e293b', textAlign: 'center' }}>
              🔐 Şifre Doğrulama
            </h2>
            <p style={{ fontSize: '14px', color: '#64748b', textAlign: 'center', marginBottom: '24px' }}>
              {recoveryCodeMode === "reset"
                ? "Mevcut kurtarma kodunu silmek için admin şifrenizi girin (yeni kod üretilmez)"
                : "Kurtarma kodu üretmek için admin şifrenizi girin"}
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#475569', marginBottom: '8px' }}>
                Admin Şifresi
              </label>
              <input
                type="password"
                value={passwordConfirmValue}
                onChange={(e) => {
                  setPasswordConfirmValue(e.target.value);
                  setPasswordConfirmError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !recoveryCodeLoading) {
                    handlePasswordConfirmed();
                  }
                }}
                placeholder="Şifrenizi girin"
                disabled={recoveryCodeLoading}
                autoFocus
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: passwordConfirmError ? '2px solid #ef4444' : '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
              />
              {passwordConfirmError && (
                <p style={{ fontSize: '13px', color: '#ef4444', marginTop: '6px', marginBottom: 0 }}>
                  {passwordConfirmError}
                </p>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button
                onClick={() => {
                  if (!recoveryCodeLoading) {
                    setShowPasswordConfirmModal(false);
                    setPasswordConfirmValue("");
                    setPasswordConfirmError("");
                  }
                }}
                disabled={recoveryCodeLoading}
                style={{
                  flex: 1,
                  padding: '12px 20px',
                  backgroundColor: '#f1f5f9',
                  color: '#475569',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: recoveryCodeLoading ? 'not-allowed' : 'pointer',
                  opacity: recoveryCodeLoading ? 0.5 : 1
                }}
              >
                İptal
              </button>
              <button
                onClick={handlePasswordConfirmed}
                disabled={recoveryCodeLoading || !passwordConfirmValue}
                style={{
                  flex: 1,
                  padding: '12px 20px',
                  background: (recoveryCodeLoading || !passwordConfirmValue)
                    ? '#94a3b8'
                    : 'linear-gradient(135deg, #10b981, #059669)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: (recoveryCodeLoading || !passwordConfirmValue) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {recoveryCodeLoading ? (
                  <>
                    <span className="login-spinner">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" strokeDasharray="47" strokeDashoffset="47" opacity="0.2"></circle>
                        <circle cx="12" cy="12" r="10" strokeDasharray="47" strokeDashoffset="11.75"></circle>
                      </svg>
                    </span>
                    Doğrulanıyor...
                  </>
                ) : (
                  '✓ Onayla'
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default SettingsModal;
