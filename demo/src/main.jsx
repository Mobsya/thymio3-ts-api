import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import "./classic-theme.css";

function loadThymioGlobal() {
  if (window.thymio) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL("./libs/thymio.iife.js", window.location.href).toString();
    script.onload = resolve;
    script.onerror = () => reject(new Error("Failed to load thymio.iife.js"));
    document.head.appendChild(script);
  });
}

void loadThymioGlobal().catch((error) => {
  console.error(error);
});

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
