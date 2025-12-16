import { Book, LoanInfo } from "../api/types";

type Props = {
  studentName: string;
  books: Book[];
  loans: LoanInfo[];
};

const StudentProfile = ({ studentName, books, loans }: Props) => {
  // Öğrenci adını doğru eşleştir - username'den ad bul
  // Önce username ile eşleştir, sonra ad ile
  const studentLoans = loans.filter((loan) => {
    const borrowerLower = loan.borrower.toLowerCase();
    const nameLower = studentName.toLowerCase();
    // "Ogrenci Kullanıcı 1" gibi formatları da kontrol et
    return borrowerLower.includes(nameLower) || 
           borrowerLower === nameLower ||
           loan.borrower === studentName;
  });
  
  // Silinmiş kitapları filtrele - sadece mevcut kitapları göster
  const studentBooks = studentLoans
    .map((loan) => {
      const book = books.find((b) => b.id === loan.bookId);
      return { ...loan, book };
    })
    .filter((item) => item.book !== undefined); // Silinmiş kitapları filtrele

  return (
    <div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Profilim</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "24px" }}>
          <div style={{ padding: "16px", backgroundColor: "#f0f9ff", borderRadius: "8px" }}>
            <div style={{ fontSize: "24px", fontWeight: 700, color: "#3b82f6", marginBottom: "4px" }}>
              {studentName}
            </div>
            <div style={{ fontSize: "14px", color: "#64748b" }}>Öğrenci</div>
          </div>
          <div style={{ padding: "16px", backgroundColor: "#f0fdf4", borderRadius: "8px" }}>
            <div style={{ fontSize: "24px", fontWeight: 700, color: "#10b981", marginBottom: "4px" }}>
              {studentBooks.length}
            </div>
            <div style={{ fontSize: "14px", color: "#64748b" }}>Aktif Ödünç</div>
          </div>
        </div>

        <h3>Ödünç Aldığım Kitaplar</h3>
        {studentBooks.length === 0 ? (
          <p>Henüz ödünç aldığınız kitap bulunmuyor.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {studentBooks.map((item, index) => {
              const dueDate = new Date(item.dueDate);
              // Backend'den gelen remainingDays kullan, yoksa hesapla
              let remainingDays = item.remainingDays;
              if (remainingDays === null || remainingDays === undefined) {
                dueDate.setHours(0, 0, 0, 0);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                remainingDays = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              }
              // Geciken kontrolü: remainingDays < 0 veya teslim tarihi bugünden önce
              const isLate = remainingDays < 0 || (() => {
                const dueDateCheck = new Date(item.dueDate);
                dueDateCheck.setHours(0, 0, 0, 0);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                return dueDateCheck.getTime() < today.getTime();
              })();
              const isWarning = !isLate && remainingDays > 0 && remainingDays <= 3;

              return (
                <div
                  key={index}
                  style={{
                    padding: "16px",
                    backgroundColor: "#f8fafc",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: "16px", marginBottom: "8px" }}>{item.title}</div>
                      <div style={{ fontSize: "14px", color: "#64748b", marginBottom: "4px" }}>
                        Kategori: {item.category}
                      </div>
                      <div style={{ fontSize: "14px", color: "#64748b" }}>
                        Teslim Tarihi: {dueDate.toLocaleDateString("tr-TR")}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span
                        style={{
                          padding: "6px 16px",
                          borderRadius: "12px",
                          fontSize: "14px",
                          fontWeight: 600,
                          backgroundColor: isLate ? "#fee2e2" : isWarning ? "#fef3c7" : "#d1fae5",
                          color: isLate ? "#dc2626" : isWarning ? "#d97706" : "#059669",
                        }}
                      >
                        {remainingDays} gün kaldı
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentProfile;

