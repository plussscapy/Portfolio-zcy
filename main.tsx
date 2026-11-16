import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import Portfolio from "./app/page";
import "./app/globals.css";

const CharacterReview = lazy(() => import("./components/CharacterReview"));
const ProjectImagePreview = lazy(() => import("./components/ProjectImageViewer").then(({ ProjectImagePreview }) => ({ default: ProjectImagePreview })));
const GloveCursorPreview = lazy(() => import("./components/GloveCursorPreview"));
const path = window.location.pathname.replace(/\/$/, "");
const isProjectPreview = path === "/project-preview" && (import.meta.env.DEV || import.meta.env.MODE === "preview");
const Page = path === "/character-review" ? CharacterReview : isProjectPreview ? ProjectImagePreview : Portfolio;
createRoot(document.getElementById("root")!).render(<Suspense fallback={null}><Page />{new URLSearchParams(window.location.search).get("cursor") === "glove" && <GloveCursorPreview />}</Suspense>);
