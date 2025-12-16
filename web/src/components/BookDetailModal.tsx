import React from 'react';
import { createPortal } from 'react-dom';
import BookDetailContent from './BookDetailContent';
import { Book, LoanInfo, StudentStat } from '../api/types';

interface BookDetailModalProps {
  book: Book;
  onClose: () => void;
  onEdit?: (book: Book) => void;
  students?: StudentStat[];
  loans?: LoanInfo[];
  books?: Book[];
  loading?: boolean;
  currentUserId?: string;
  isReadOnly?: boolean;
  onRefresh?: () => void | Promise<void>;
  personelName?: string;
  onAddNotification?: (type: "error" | "success" | "warning" | "info", title: string, message: string) => void;
}

const BookDetailModal: React.FC<BookDetailModalProps> = (props) => {
  const { onClose } = props;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 52000,
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <BookDetailContent
        {...props}
        onEdit={props.onEdit}
      />
    </div>,
    document.body
  );
};

export default BookDetailModal;
