import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { X } from "lucide-react";
import { projects, type Project, type ProjectImage } from "../lib/projects";
import "./project-image-viewer.css";

const previews = import.meta.glob<string>("../lib/project-previews/**/*.webp", { eager: true, query: "?url", import: "default" });
const previewWidths = [640, 960, 1600];
const previewSizes = "(max-width: 767px) calc(100vw - 48px), (max-width: 1000px) calc(82vw - 72px), 748px";

function previewFor(original: string) {
  const path = original.match(/^\/projects\/(.+)\.[^/.]+$/)?.[1];
  const sources = path ? previewWidths.flatMap((width) => {
    const url = previews[`../lib/project-previews/${path}-${width}.webp`];
    return url ? [{ url, width }] : [];
  }) : [];
  return {
    src: sources[0]?.url ?? original,
    srcSet: sources.length ? sources.map(({ url, width }) => `${url} ${width}w`).join(", ") : undefined,
  };
}

function OriginalImage({ image, onClose }: { image: ProjectImage; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog className="work-image-original" ref={ref} aria-label="查看原图" onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }}>
    <img src={image.src} alt={image.alt} width={image.width} height={image.height} />
    <button autoFocus type="button" onClick={onClose} aria-label="关闭原图"><X size={20} /></button>
  </dialog>;
}

export default function ProjectImageViewer({ project, onClose }: { project: Project; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const imageRefs = useRef<(HTMLImageElement | null)[]>([]);
  const positionFrame = useRef<number | null>(null);
  const [opened, setOpened] = useState(false);
  const [position, setPosition] = useState({ page: 1, progress: 0 });
  const [zoomed, setZoomed] = useState<ProjectImage | null>(null);
  const total = project.images.length;

  const updatePosition = useCallback(() => {
    const view = scrollRef.current;
    if (!view) return;
    const scrollTop = view.scrollTop;
    if (scrollTop <= 0) {
      setPosition((current) => current.page === 1 && current.progress === 0 ? current : { page: 1, progress: 0 });
      return;
    }
    const max = view.scrollHeight - view.clientHeight;
    const progress = max > 0 ? Math.min(1, scrollTop / max) : 0;
    const line = view.getBoundingClientRect().top + view.clientHeight * 0.45;
    let page = 1;
    imageRefs.current.forEach((image, index) => { if (image && image.getBoundingClientRect().top <= line) page = index + 1; });
    if (max > 0 && scrollTop >= max - 1) page = total;
    setPosition((current) => current.page === page && current.progress === progress ? current : { page, progress });
  }, [total]);

  const schedulePositionUpdate = useCallback(() => {
    if (positionFrame.current !== null) return;
    positionFrame.current = requestAnimationFrame(() => {
      positionFrame.current = null;
      updatePosition();
    });
  }, [updatePosition]);

  useEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    const showImmediately = window.matchMedia("(max-width: 767px), (prefers-reduced-motion: reduce)").matches;
    const desktopTimer = showImmediately ? undefined : window.setTimeout(() => setOpened(true), 460);
    if (showImmediately) setOpened(true);
    const observer = new ResizeObserver(schedulePositionUpdate);
    observer.observe(scrollRef.current!);
    return () => {
      window.clearTimeout(desktopTimer);
      observer.disconnect();
      if (positionFrame.current !== null) cancelAnimationFrame(positionFrame.current);
      positionFrame.current = null;
      dialog.close();
    };
  }, [schedulePositionUpdate]);

  return <dialog className="modal-backdrop project-modal work-image-modal" ref={dialogRef} aria-label={project.title} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <button className="modal-close work-image-desktop-close" type="button" onClick={onClose} aria-label="关闭作品"><X size={19} /></button>
    <div className={`project-stage ${opened ? "is-open" : ""}`} style={{ "--project": project.color, "--project-ink": project.ink } as CSSProperties}>
      <div className="project-pack"><span>PROJECT</span><strong>{project.number}</strong></div>
      <div className="project-sheet work-image-panel">
        <button className="modal-close work-image-mobile-close" type="button" onClick={onClose} aria-label="关闭作品"><X size={14} /></button>
        <div className="work-image-scroll" ref={scrollRef} tabIndex={0} aria-label="作品图片，上下滚动浏览" onScroll={schedulePositionUpdate}>
          <article className="work-image-gallery" aria-label={project.title}>
            {project.images.map((image, index) => <img key={image.id} ref={(element) => { imageRefs.current[index] = element; }} {...previewFor(image.src)} sizes={previewSizes} alt={image.alt}
              width={image.width} height={image.height} loading={index === 0 ? "eager" : "lazy"} fetchPriority={index === 0 ? "high" : "auto"} decoding="async" onLoad={schedulePositionUpdate}
              role="button" tabIndex={0} aria-label={`${image.alt}，点击查看原图`} onClick={() => setZoomed(image)}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setZoomed(image); } }} />)}
            {!total && <p className="work-image-empty">作品图片准备中。</p>}
          </article>
          <footer className="work-image-footer">MONDAY MART · PROJECT {project.number}</footer>
        </div>
        {total > 0 && <aside className="work-image-reading" role="progressbar" aria-label="作品阅读进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(position.progress * 100)} aria-valuetext={`当前第 ${position.page} 张，共 ${total} 张`}>
          <span aria-hidden="true">{String(position.page).padStart(2, "0")}</span>
          <i aria-hidden="true" style={{ "--read-progress": `${position.progress * 100}%` } as CSSProperties} />
          <span aria-hidden="true">{String(total).padStart(2, "0")}</span>
        </aside>}
      </div>
    </div>
    {zoomed && <OriginalImage image={zoomed} onClose={() => setZoomed(null)} />}
  </dialog>;
}

// Direct access uses the same viewer as the 3D project entrances.
export function ProjectImagePreview() {
  const requested = new URLSearchParams(window.location.search).get("project");
  const project = projects.find((item) => item.id === requested) || projects[0];
  return <ProjectImageViewer project={project} onClose={() => { window.location.href = "/"; }} />;
}
