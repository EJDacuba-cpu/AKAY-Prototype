/**
 * useNotification Hook - Toast notifications management
 * @hook
 *
 * @returns {Object} { show, success, error, info, warning }
 *
 * @example
 * const notify = useNotification();
 * notify.success('Patient created!');
 * notify.error('Failed to create patient');
 */
import toast from "react-hot-toast";

export default function useNotification() {
  return {
    show: (message, type = "blank") => {
      return toast(message, {
        style: {
          background: "#0B2E59",
          color: "#fff",
          borderRadius: "8px",
        },
      });
    },
    success: (message) => {
      return toast.success(message, {
        style: {
          background: "#10B981",
          color: "#fff",
          borderRadius: "8px",
        },
      });
    },
    error: (message) => {
      return toast.error(message, {
        style: {
          background: "#EF4444",
          color: "#fff",
          borderRadius: "8px",
        },
      });
    },
    info: (message) => {
      return toast(message, {
        style: {
          background: "#0B2E59",
          color: "#fff",
          borderRadius: "8px",
        },
      });
    },
    warning: (message) => {
      return toast(message, {
        style: {
          background: "#D97706",
          color: "#fff",
          borderRadius: "8px",
        },
      });
    },
    promise: (promise, messages) => {
      return toast.promise(promise, messages, {
        style: {
          borderRadius: "8px",
        },
      });
    },
  };
}
