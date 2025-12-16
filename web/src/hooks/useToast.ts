import { useState, useCallback } from 'react';
import type { ToastType } from '../components/Toast';

interface ToastItem {
    id: number;
    message: string;
    type: ToastType;
}

let toastId = 0;

export const useToast = () => {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const showToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = toastId++;
        setToasts(prev => [...prev, { id, message, type }]);
    }, []);

    const removeToast = useCallback((id: number) => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
    }, []);

    return {
        toasts,
        showToast,
        removeToast
    };
};
