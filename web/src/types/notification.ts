export type NotificationSettings = {
  notifications: boolean;
  notificationTypes: {
    studentAdd: boolean;
    studentDelete: boolean;
    studentBulkDelete?: boolean;
    studentUpdate: boolean;
    bookAdd: boolean;
    bookDelete: boolean;
    bookBulkDelete?: boolean;
    bookUpdate: boolean;
    loanExtend: boolean;
    loanReturn: boolean;
    loanBorrow: boolean;
    dueSoon: boolean;
    overdue: boolean;
  };
};

export const createDefaultNotificationSettings = (): NotificationSettings => ({
  notifications: true,
  notificationTypes: {
    studentAdd: true,
    studentDelete: true,
    studentBulkDelete: true,
    studentUpdate: true,
    bookAdd: true,
    bookDelete: true,
    bookBulkDelete: true,
    bookUpdate: true,
    loanExtend: true,
    loanReturn: true,
    loanBorrow: true,
    dueSoon: true,
    overdue: true,
  },
});
