import { createContext, useContext, useState, useMemo, useEffect } from "react";

const NotificationContext = createContext(null);

const STORAGE_KEY = "akay_notifications";

const seedNotifications = [
  {
    id: "notif-1",
    type: "referral",
    sender: "Dr. Reyes (RHU)",
    title: "RHU Feedback: Juan Dela Cruz (REF-2024-085)",
    description: "Feedback has been submitted.",
    fullMessage:
      "The attending physician at the Rural Health Unit has provided clinical feedback regarding the referred patient. The return slip is now available for viewing and printing at the BHC.",
    timestamp: "May 26, 8:00 AM",
    read: false,
    referralId: "REF-2024-085",
    link: "/bhc/referrals",
    linkLabel: "View Feedback Slip",
  },
  {
    id: "notif-2",
    type: "alert",
    sender: "Inventory System",
    title: "Medicine Stock Alert: Paracetamol 500mg",
    description: "Stock has fallen below minimum level.",
    fullMessage:
      "Inventory check indicates that Paracetamol 500mg is running critically low. Current stock is unable to meet the projected demand for the next 14 days. Immediate resupply request is recommended.",
    timestamp: "May 23, 2:30 PM",
    read: false,
    link: "/bhc/medicine-availability",
    linkLabel: "Check Inventory",
  },
  {
    id: "notif-3",
    type: "followup",
    sender: "System Reminder",
    title: "Follow-up scheduled for Ana Reyes today",
    description: "Patient is due for a follow-up checkup.",
    fullMessage:
      "Automated reminder: Patient Ana Reyes is due for a follow-up checkup today based on the previous health record filed last week.",
    timestamp: "May 24, 9:00 AM",
    read: true,
    link: "/bhc/health-records",
    linkLabel: "View Health Record",
  },
  {
    id: "notif-4",
    type: "referral",
    sender: "BHC Malolos",
    title: "New Referral Received for Maria Santos",
    description: "Referral has been received.",
    fullMessage:
      "A new referral request has been formally transmitted to your facility. The patient is scheduled for assessment.",
    timestamp: "May 22, 10:08 PM",
    read: true,
    referralId: "REF-2024-089",
    link: "/rhu/incoming-referrals",
    linkLabel: "View Referral",
  },
];

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState(() => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error("Failed to read notifications", e);
    }
    return seedNotifications;
  });

  const [selectedNotif, setSelectedNotif] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
    } catch (e) {
      console.error("Failed to save notifications", e);
    }
  }, [notifications]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const getLatestNotifications = () => notifications.slice(0, 5);

  const markAsRead = (id) =>
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );

  const markAllAsRead = () =>
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

  const deleteNotification = (id) =>
    setNotifications((prev) => prev.filter((n) => n.id !== id));

  const clearAll = () => setNotifications([]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        getLatestNotifications,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAll,
        selectedNotif,
        setSelectedNotif,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx)
    throw new Error(
      "useNotifications must be used within NotificationProvider",
    );
  return ctx;
}
