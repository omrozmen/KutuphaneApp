import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import "./NotificationToast.css";
const NotificationToast = ({ notifications, onClose }) => {
    const [visible, setVisible] = useState(true);
    useEffect(() => {
        const timer = setTimeout(() => {
            setVisible(false);
            setTimeout(() => {
                onClose();
            }, 300);
        }, 5000);
        return () => clearTimeout(timer);
    }, [onClose]);
    if (!notifications || notifications.length === 0) {
        return null;
    }
    return (_jsx("div", { className: `notification-container ${visible ? "visible" : "hidden"}`, children: notifications.map((notification, index) => (_jsxs("div", { key: index, className: `notification-toast notification-${notification.type || "info"}`, children: [_jsxs("div", { className: "notification-content", children: [_jsx("div", { className: "notification-icon", children: notification.type === "success" ? "✓" : notification.type === "warning" ? "⚠" : notification.type === "error" ? "✕" : "ℹ" }), _jsxs("div", { className: "notification-text", children: [_jsx("div", { className: "notification-title", children: notification.title }), notification.message && (_jsx("div", { className: "notification-message", children: notification.message }))] })] }), _jsx("button", { className: "notification-close", onClick: () => {
                        const newNotifications = notifications.filter((_, i) => i !== index);
                        if (newNotifications.length === 0) {
                            setVisible(false);
                            setTimeout(() => {
                                onClose();
                            }, 300);
                        }
                    }, children: "×" })] }, index))) })));
};
export default NotificationToast;



