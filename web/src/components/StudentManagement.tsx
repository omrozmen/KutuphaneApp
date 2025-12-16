import { useState, useMemo, useEffect } from "react";
import { StudentStat, LoanInfo, Book } from "../api/types";
import { httpClient } from "../api/client";
import StudentList from "./StudentList";

type Props = {
  students: StudentStat[];
  loans?: LoanInfo[];
  books?: Book[]; // Silinmiş kitapları filtrelemek için
  onRefresh: () => void;
  onSyncStudents: () => Promise<number>;
  resetSearch?: boolean;
  personelName?: string;
  onAddNotification?: (type: "info" | "success" | "warning" | "error", title: string, message: string) => void;
};

const StudentManagement = ({ students, loans = [], books = [], onRefresh, onSyncStudents, resetSearch = false, personelName = "", onAddNotification }: Props) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const OTHER_OPTION = "__OTHER__";
  const [newStudent, setNewStudent] = useState({ 
    name: "", 
    surname: "",
    class: "", 
    classOther: "",
    branch: "", 
    branchOther: "",
    studentNumber: "" 
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tüm sınıfları ve şubeleri çıkar
  const classes = useMemo(() => {
    const cls = new Set(students.map(s => s.class).filter((c): c is number => c !== undefined && c !== null));
    return Array.from(cls).sort((a, b) => a - b);
  }, [students]);

  const branches = useMemo(() => {
    const br = new Set(students.map(s => s.branch).filter((b): b is string => b !== undefined && b !== null));
    return Array.from(br).sort();
  }, [students]);


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
      await httpClient.post("/admin/students", {
        name,
        surname,
        class: classValue,
        branch: branchValue,
        studentNumber,
        personelName: personelName || ""
      });

      // Başarılı - formu temizle ve kapat
      setShowAddForm(false);
      setNewStudent({ name: "", surname: "", class: "", classOther: "", branch: "", branchOther: "", studentNumber: "" });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Öğrenci eklenemedi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {showAddForm && (
        <div className="card" style={{ marginBottom: "20px" }}>
          <h3 style={{ marginTop: 0, marginBottom: "16px" }}>Yeni Öğrenci Ekle</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
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
                  soyad <span style={{ color: "#ef4444" }}>*</span>
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

      <StudentList 
        students={students} 
        loans={loans}
        books={books}
        resetSearch={resetSearch}
        onRefresh={onRefresh}
        classes={classes}
        branches={branches}
        personelName={personelName}
        onAddNotification={onAddNotification}
        onAddStudent={async (studentData) => {
          try {
            await httpClient.post("/admin/students", {
              ...studentData,
              personelName: personelName || ""
            });
            // Başarılı olduğunda refresh yap
            await onRefresh();
          } catch (error) {
            // Hata durumunda tekrar fırlat ki StudentList'te yakalansın
            throw error;
          }
        }}
      />
    </div>
  );
};

export default StudentManagement;

