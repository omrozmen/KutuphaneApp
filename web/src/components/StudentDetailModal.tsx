import { createPortal } from "react-dom";
import { StudentStat, LoanInfo, Book, StudentHistoryEntry, StudentHistoryResponse } from "../api/types";
import StudentDetailCard from "./StudentDetailCard";
import { httpClient } from "../api/client";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    student: StudentStat | null;
    loans: LoanInfo[];
    books?: Book[];
    personelName: string;
    onRefresh?: () => void;
    onEdit?: (student: StudentStat) => void;
    onBookClick?: (book: Book) => void;
    maxPenaltyPoints?: number;
    loading?: boolean;
    studentHistory?: StudentHistoryResponse | null;
    historyEntries?: StudentHistoryEntry[];
};

const StudentDetailModal = ({
    isOpen,
    onClose,
    student,
    loans,
    books = [],
    personelName,
    onRefresh,
    onEdit,
    onBookClick,
    maxPenaltyPoints = 100,
    loading = false,
    studentHistory,
    historyEntries = [],
}: Props) => {
    if (!isOpen || !student) return null;

    const handleReturnBook = async (bookId: string, borrower: string) => {
        if (!personelName || personelName.trim() === "") {
            throw new Error("Personel adı gereklidir. Lütfen giriş yapın.");
        }

        await httpClient.post(`/books/${bookId}/return`, {
            borrower,
            personelName: personelName.trim(),
        });
    };

    return createPortal(
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
            onClick={onClose}
        >
            <div
                className="card"
                style={{
                    maxWidth: "800px",
                    width: "90%",
                    maxHeight: "90vh",
                    overflowY: "auto",
                    overflowX: "hidden",
                    position: "relative",
                    backgroundColor: "#fff",
                    borderRadius: "12px",
                    padding: "24px",
                    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                    <h2 style={{ margin: 0, color: "#1e293b", fontSize: "24px", fontWeight: 700 }}>Öğrenci Detayları</h2>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        {onEdit && (
                            <button
                                onClick={() => onEdit(student)}
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
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    transition: "background-color 0.2s",
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#2563eb"}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#3b82f6"}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                                Düzenle
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
                                padding: "4px",
                                width: "32px",
                                height: "32px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                borderRadius: "50%",
                                transition: "background-color 0.2s",
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f1f5f9"}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                        >
                            ×
                        </button>
                    </div>
                </div>

                <StudentDetailCard
                    student={student}
                    loans={loans}
                    books={books}
                    personelName={personelName}
                    onRefresh={onRefresh}
                    onBookClick={onBookClick}
                    maxPenaltyPoints={maxPenaltyPoints}
                    loading={loading}
                    studentHistory={studentHistory}
                    historyEntries={historyEntries}
                    showEditButton={!!onEdit}
                    onReturnBook={handleReturnBook}
                />
            </div>
        </div>,
        document.body
    );
};

export default StudentDetailModal;
