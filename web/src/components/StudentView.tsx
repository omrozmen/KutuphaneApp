import { useState } from "react";
import { Book, LoanInfo } from "../api/types";
import BookDetailModal from "./BookDetailModal";

type Props = {
  books: Book[];
  loans?: LoanInfo[]; // Silinmiş kitapları filtrelemek için
  onSearch: (keyword: string) => void;
  isReadOnly?: boolean; // Öğrenci için sadece okuma modu
};

const StudentView = ({ books, loans = [], onSearch, isReadOnly = false }: Props) => {
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    onSearch(value);
  };

  return (
    <>
      <div className="card">
        <h2>Kitap Kataloğu</h2>
        <div className="toolbar">
          <input
            placeholder="Kitap, yazar, kategori veya künye bilgilerine göre ara..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            style={{ flex: 1, minWidth: "200px" }}
          />
        </div>
        <table className="book-table">
          <thead>
            <tr>
              <th>Başlık</th>
              <th>Yazar</th>
              <th>Kategori</th>
              <th>Mevcut Adet</th>
              <th>Durum</th>
            </tr>
          </thead>
          <tbody>
            {books.map((book) => (
              <tr
                key={book.id}
                onClick={() => setSelectedBook(book)}
                style={{ cursor: "pointer" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#f8fafc";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <td><strong>{book.title}</strong></td>
                <td>{book.author}</td>
                <td>
                  <span style={{
                    backgroundColor: "#e0e7ff",
                    color: "#4338ca",
                    padding: "4px 8px",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}>
                    {book.category}
                  </span>
                </td>
                <td>
                  {book.quantity}/{book.totalQuantity}
                </td>
                <td>
                  {book.quantity > 0 ? (
                    <span style={{ color: "#10b981", fontWeight: 600 }}>Müsait</span>
                  ) : (
                    <span style={{ color: "#ef4444", fontWeight: 600 }}>Ödünçte</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {books.length === 0 && <p>Henüz kitap bulunmuyor.</p>}
      </div>

      {selectedBook && (
        <BookDetailModal 
          book={selectedBook} 
          books={books}
          loans={loans}
          onClose={() => setSelectedBook(null)}
          isReadOnly={isReadOnly}
        />
      )}
    </>
  );
};

export default StudentView;

