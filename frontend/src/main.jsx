import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import VirtualKeyboard from "./components/VirtualKeyboard";
import "./index.css";


createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
    <VirtualKeyboard />
  </StrictMode>,
);
