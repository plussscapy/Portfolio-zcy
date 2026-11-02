import { useEffect, useState } from "react";
import "./glove-cursor-preview.css";

type Pose = "default" | "hover" | "click";
const poses: { id: Pose; title: string; detail: string }[] = [
  { id: "default", title: "默认", detail: "指向与探索" },
  { id: "hover", title: "悬停", detail: "准备拿取" },
  { id: "click", title: "点击", detail: "轻轻捏一下" },
];
const asset = (pose: Pose) => `/cursors/glove-${pose}.png`;

export default function GloveCursorPreview() {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [pose, setPose] = useState<Pose>("default");
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let alive = true;
    const root = document.documentElement;
    const density = Math.max(1, Math.min(3, Math.ceil(window.devicePixelRatio || 1)));
    Promise.all(poses.map(({ id }) => new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const render = (scale: number) => {
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 40 * scale;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Cursor image unavailable");
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = "high";
            context.drawImage(img, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL("image/png");
          };
          const hotspots = { default: [7, 6], hover: [7, 5], click: [10, 11] };
          const [x, y] = hotspots[id];
          const high = `image-set(url("${render(density)}") ${density}x) ${x} ${y}, default`;
          const value = CSS.supports("cursor", high) ? high : `url("${render(1)}") ${x} ${y}, default`;
          if (alive) root.style.setProperty(`--glove-${id}`, value);
          resolve();
        } catch (error) { reject(error); }
      };
      img.onerror = reject;
      img.src = asset(id);
    }))).then(() => { if (alive) setReady(true); }).catch(() => { if (alive) setFailed(true); });
    return () => {
      alive = false;
      for (const { id } of poses) root.style.removeProperty(`--glove-${id}`);
    };
  }, []);

  useEffect(() => {
    if (!ready || !enabled || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    document.documentElement.classList.add("glove-preview-active");
    setPose("default");
    let x = -200, y = -200, target: Element | null = null;
    document.documentElement.dataset.glovePose = "default";
    let visible = false, pressed = false, clickedUntil = 0;
    let current: Pose = "default";
    let frame = 0;
    const hide = () => { visible = false; pressed = false; };
    const move = (event: MouseEvent | PointerEvent) => {
      if ("pointerType" in event && event.pointerType !== "mouse") return;
      x = event.clientX; y = event.clientY; visible = true;
      target = event.target instanceof Element ? event.target : null;

    };
    const down = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      move(event); pressed = true; clickedUntil = performance.now() + 160;
    };
    const up = () => { pressed = false; };
    const animate = () => {
      if (visible) target = document.elementFromPoint(x, y);
      const previewPose = target?.closest<HTMLElement>("[data-glove-pose]")?.dataset.glovePose as Pose | undefined;
      const clickable = !!target?.closest("button:not(:disabled), a[href], [role='button']") || (target?.tagName === "CANVAS" && document.body.style.cursor === "pointer");
      const next: Pose = pressed || performance.now() < clickedUntil ? "click" : previewPose || (clickable ? "hover" : "default");
      if (current !== next) {
        current = next;
        document.documentElement.dataset.glovePose = next;
        setPose(next);
      }
      frame = requestAnimationFrame(animate);
    };
    window.addEventListener("pointermove", move, { passive: true, capture: true });
    window.addEventListener("mousemove", move, { passive: true, capture: true });
    window.addEventListener("pointerdown", down, { passive: true, capture: true });
    window.addEventListener("pointerup", up, { passive: true, capture: true });
    window.addEventListener("pointercancel", hide);
    window.addEventListener("blur", hide);
    document.addEventListener("pointerleave", hide);
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      document.documentElement.classList.remove("glove-preview-active");
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("mousemove", move, true);
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", hide);
      window.removeEventListener("blur", hide);
      document.removeEventListener("pointerleave", hide);
      delete document.documentElement.dataset.glovePose;
      hide();
    };
  }, [enabled, ready]);

  return <>
    <aside className={`glove-preview-panel ${collapsed ? "is-collapsed" : ""}`} aria-label="手套光标预览">
      <header><div><small>CURSOR STUDY / 01</small><strong>店员手套 <span>{enabled ? poses.find(p => p.id === pose)?.title : "已暂停"}</span></strong></div><button aria-label={collapsed ? "展开光标预览" : "收起光标预览"} onClick={() => setCollapsed(!collapsed)}>{collapsed ? "+" : "−"}</button></header>
      {!collapsed && <>
        <p>{failed ? "素材暂时未加载，请刷新重试。" : !ready ? "正在准备手套…" : "移到商品上试试，按下鼠标轻捏一下。"}</p>
        <div className="glove-preview-poses">{poses.map(({ id, title, detail }) => <button type="button" key={id} data-glove-pose={id} aria-label={`预览${title}手势`}><img src={asset(id)} alt="" /><strong>{title}</strong><small>{detail}</small></button>)}</div>
        <footer><span className="glove-preview-fixed-size">40px · 高清原生版</span><button className="glove-preview-toggle" aria-pressed={enabled} onClick={() => setEnabled(!enabled)}>{enabled ? "暂停试用" : "启用手套"}</button></footer>
      </>}
    </aside>
  </>;
}
