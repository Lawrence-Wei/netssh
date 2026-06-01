import React from "react";
import ReactDOM from "react-dom/client";
import App from "./pages/App";
import { ConfirmProvider } from "./components/ConfirmDialog";
import "@xterm/xterm/css/xterm.css";
import "./assets/app.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfirmProvider>
      <App />
    </ConfirmProvider>
  </React.StrictMode>
);
