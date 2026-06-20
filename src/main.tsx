import { render } from "preact";
import { App } from "./App";
import "./index.css";

// Match the OS preference synchronously before first paint to avoid a flash;
// initTheme() reconciles with the persisted choice once the backend responds.
if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
  document.documentElement.classList.add("dark");
}

const root = document.getElementById("app");
if (root) render(<App />, root);
