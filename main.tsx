import { createRoot } from "react-dom/client";
import Portfolio from "./app/page";
import CharacterReview from "./components/CharacterReview";
import "./app/globals.css";
import GloveCursorPreview from "./components/GloveCursorPreview";
import { ProjectImagePreview } from "./components/ProjectImageViewer";

const Page = window.location.pathname.replace(/\/$/, "") === "/character-review"
  ? CharacterReview
  : window.location.pathname.replace(/\/$/, "") === "/project-preview" ? ProjectImagePreview : Portfolio;
createRoot(document.getElementById("root")!).render(<><Page />{new URLSearchParams(window.location.search).get("cursor") === "glove" && <GloveCursorPreview />}</>);
