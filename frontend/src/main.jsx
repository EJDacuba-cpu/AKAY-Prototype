import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router";
import App from "./App";
import "./index.css";
import { Toaster } from "react-hot-toast";
import { NotificationProvider } from "./hooks/useNotificationsContext";
import { queryClient } from "./lib/queryClient";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <NotificationProvider>
          <App />
          <Toaster position="top-right" />
        </NotificationProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
