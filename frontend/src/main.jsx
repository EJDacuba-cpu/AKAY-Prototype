import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import "./index.css";
import { Toaster } from "react-hot-toast";
import { NotificationProvider } from "./hooks/useNotificationsContext";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <NotificationProvider>
        <App />
        <Toaster position="top-right" />
      </NotificationProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
