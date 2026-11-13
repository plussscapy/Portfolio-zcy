"use client";

import { Canvas, ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { ArrowLeft, BriefcaseBusiness, Check, ChevronDown, CloudRain, Download, GraduationCap, Leaf, Mail, MapPin, Monitor, MousePointer2, Music, Phone, ReceiptText, RotateCcw, Snowflake, Sun, UserRound, X } from "lucide-react";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import RainyStoreScene from "@/components/RainyStoreScene";
import ProjectImageViewer from "@/components/ProjectImageViewer";
import { projects, type Project } from "@/lib/projects";
import { SeasonAmbience } from "@/lib/season-ambience";

type SceneMode = "outside" | "entering" | "inside";
type Season = "spring" | "summer" | "autumn" | "winter";
const seasons = [
  { id: "spring", name: "春", detail: "暖阳 · 樱花", Icon: Sun },
  { id: "summer", name: "夏", detail: "雨夜 · 雷光", Icon: CloudRain },
  { id: "autumn", name: "秋", detail: "夕照 · 枫叶", Icon: Leaf },
  { id: "winter", name: "冬", detail: "飘雪 · 冷夜", Icon: Snowflake },
] as const;
const seasonTracks: Record<Season, { src: string; title: string }> = {
  spring: { src: "/audio/spring-in-bloom.mp3", title: "Spring in Bloom" },
  summer: { src: "/audio/summer-rainy-lofi-night.mp3", title: "Instant Sleep — Rainy Lofi Night" },
  autumn: { src: "/audio/autumn-leaves-falling.mp3", title: "Autumn Leaves Falling" },
  winter: { src: "/audio/winter-ambient-instrumental.mp3", title: "Winter Ambient Instrumental" },
};
const loadingMessages = ["正在点亮店面", "正在摆放展品", "正在准备收银台", "今日营业中"] as const;
const cashierStyle = { skin: "#d9a57e", hair: "#283c43", shirt: "#eaf5f5", apron: "#4a91b7", accent: "#f6ca54" };

function usePointerCursor(active: boolean) {
  useEffect(() => { if (active) document.body.style.cursor = "pointer"; return () => { document.body.style.cursor = "default"; }; }, [active]);
}

function CameraRig({ mode }: { mode: SceneMode }) {
  const { camera } = useThree();
  const outside = useMemo(() => new THREE.Vector3(0, 2.55, 27.5), []);
  const inside = useMemo(() => new THREE.Vector3(0.55, 2.18, 2.72), []);
  const outsideLook = useMemo(() => new THREE.Vector3(0, 1.9, 0), []);
  const insideLook = useMemo(() => new THREE.Vector3(2.45, 1.35, -1.8), []);
  const elapsed = useRef(0);

  useEffect(() => { if (mode === "entering") elapsed.current = 0; }, [mode]);
  useEffect(() => { camera.position.copy(outside); camera.lookAt(outsideLook); }, [camera, outside, outsideLook]);

  useFrame((_, delta) => {
    if (mode === "entering") elapsed.current += delta;
    const target = mode === "outside" ? outside : inside;
    const easing = mode === "entering" ? 1.45 : 3.8;
    camera.position.lerp(target, 1 - Math.exp(-delta * easing));
    if (mode === "entering") camera.position.y += Math.sin(elapsed.current * 7) * 0.0035;
    camera.lookAt(mode === "outside" ? outsideLook : insideLook);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, mode === "outside" ? 31 : 54, 1 - Math.exp(-delta * 3));
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

function InteractiveGroup({ children, position, scale = 1, onClick }: { children: ReactNode; position: [number, number, number]; scale?: number; onClick: (event: ThreeEvent<MouseEvent>) => void }) {
  const [hovered, setHovered] = useState(false);
  usePointerCursor(hovered);
  return <group position={position} scale={hovered ? scale * 1.05 : scale} onClick={onClick}
    onPointerOver={(event) => { event.stopPropagation(); setHovered(true); }} onPointerOut={() => setHovered(false)}>{children}</group>;
}

function SlidingDoors({ open }: { open: boolean }) {
  const left = useRef<THREE.Mesh>(null);
  const right = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    const amount = 1 - Math.exp(-delta * 4.5);
    if (left.current) left.current.position.x = THREE.MathUtils.lerp(left.current.position.x, open ? -1.15 : -0.58, amount);
    if (right.current) right.current.position.x = THREE.MathUtils.lerp(right.current.position.x, open ? 1.15 : 0.58, amount);
  });
  return <group position={[0, 1.85, 3.12]}>
    <mesh ref={left} position={[-0.58, 0, 0]}><boxGeometry args={[1.12, 3.38, 0.08]} /><meshStandardMaterial color="#8ac3d5" transparent opacity={0.58} metalness={0.12} /></mesh>
    <mesh ref={right} position={[0.58, 0, 0]}><boxGeometry args={[1.12, 3.38, 0.08]} /><meshStandardMaterial color="#8ac3d5" transparent opacity={0.58} metalness={0.12} /></mesh>
  </group>;
}

function ProductPack({ item, position, onSelect }: { item: Project; position: [number, number, number]; onSelect: (item: Project) => void }) {
  return <InteractiveGroup position={position} onClick={(event) => { event.stopPropagation(); onSelect(item); }}>
    <mesh><boxGeometry args={[0.7, 0.82, 0.28]} /><meshStandardMaterial color={item.color} roughness={0.6} emissive={item.color} emissiveIntensity={0.05} /></mesh>
    <mesh position={[0, 0.08, 0.148]}><boxGeometry args={[0.45, 0.25, 0.014]} /><meshBasicMaterial color="#fffdf4" /></mesh>
    <mesh position={[0, -0.24, 0.153]}><boxGeometry args={[0.28, 0.055, 0.015]} /><meshBasicMaterial color={item.ink} /></mesh>
  </InteractiveGroup>;
}

function ProjectWall({ onSelect }: { onSelect: (item: Project) => void }) {
  const positions: [number, number, number][] = [[-0.9, 2.52, -3.63], [0.02, 2.52, -3.63], [-0.9, 1.52, -3.63], [0.02, 1.52, -3.63]];
  return <group position={[2.85, 0, 0]}>
    <mesh position={[-0.43, 2.05, -3.83]}><boxGeometry args={[2.65, 2.8, 0.22]} /><meshStandardMaterial color="#edf2ea" /></mesh>
    {[1.04, 2.04, 3.04].map((y) => <mesh key={y} position={[-0.43, y, -3.58]}><boxGeometry args={[2.45, 0.08, 0.48]} /><meshStandardMaterial color="#b8cbd0" /></mesh>)}
    {projects.map((item, index) => <ProductPack key={item.id} item={item} position={positions[index]} onSelect={onSelect} />)}
  </group>;
}

function CenterAisle() {
  return <group position={[-1.15, 0, -0.8]}>
    {[0.32, 1.12, 1.92].map((y) => <mesh key={y} position={[0, y, 0]}><boxGeometry args={[1.45, 0.1, 3.8]} /><meshStandardMaterial color="#eef0e9" /></mesh>)}
    {[-0.67, 0.67].map((x) => <mesh key={x} position={[x, 1.1, 0]}><boxGeometry args={[0.1, 2.1, 3.8]} /><meshStandardMaterial color="#c7d2d0" /></mesh>)}
    {[-1.35, -0.45, 0.45, 1.35].map((z, index) => <group key={z} position={[0, 0, z]}>
      <mesh position={[-0.35, 0.72, 0]}><boxGeometry args={[0.38, 0.58, 0.42]} /><meshStandardMaterial color={["#d4df79", "#f0aa8b", "#8ec9dd", "#e6c771"][index]} /></mesh>
      <mesh position={[0.35, 1.5, 0]}><cylinderGeometry args={[0.18, 0.18, 0.48, 16]} /><meshStandardMaterial color={["#8fc3a2", "#d99aab", "#e0b773", "#87adc9"][index]} /></mesh>
    </group>)}
  </group>;
}

function FridgeWall() {
  return <group position={[-4.35, 1.65, -0.55]} rotation={[0, Math.PI / 2, 0]}>
    {[-2.1, 0, 2.1].map((x, index) => <group key={x} position={[x, 0, 0]}>
      <mesh><boxGeometry args={[1.95, 3.3, 0.48]} /><meshStandardMaterial color="#dfe9e8" /></mesh>
      <mesh position={[0, 0, 0.25]}><boxGeometry args={[1.72, 2.88, 0.035]} /><meshStandardMaterial color="#7bb4c5" transparent opacity={0.5} /></mesh>
      {[0.65, 0, -0.65].map((y) => <mesh key={y} position={[0, y, 0.29]}><boxGeometry args={[1.55, 0.055, 0.04]} /><meshBasicMaterial color={index === 1 ? "#fff0a8" : "#eefbff"} /></mesh>)}
    </group>)}
  </group>;
}

function Cashier({ onProfile }: { onProfile: () => void }) {
  return <InteractiveGroup position={[3.55, 0, -2.52]} scale={0.86} onClick={(event) => { event.stopPropagation(); onProfile(); }}>
    <mesh position={[0, 2.4, 0]}><sphereGeometry args={[0.34, 24, 18]} /><meshStandardMaterial color={cashierStyle.skin} /></mesh>
    <mesh position={[0, 2.62, -0.02]} scale={[1.06, 0.58, 1.02]}><sphereGeometry args={[0.34, 24, 18]} /><meshStandardMaterial color={cashierStyle.hair} /></mesh>
    <mesh position={[0, 1.65, 0]}><capsuleGeometry args={[0.43, 0.72, 6, 16]} /><meshStandardMaterial color={cashierStyle.shirt} /></mesh>
    <mesh position={[0, 1.55, 0.29]}><boxGeometry args={[0.64, 0.75, 0.06]} /><meshStandardMaterial color={cashierStyle.apron} /></mesh>
    <mesh position={[0, 1.78, 0.33]}><circleGeometry args={[0.11, 24]} /><meshStandardMaterial color={cashierStyle.accent} /></mesh>
  </InteractiveGroup>;
}

function Checkout({ onCheckout }: { onCheckout: () => void }) {
  return <InteractiveGroup position={[2.45, 0, -1.58]} onClick={(event) => { event.stopPropagation(); onCheckout(); }}>
    <mesh position={[0, 0.65, 0]}><boxGeometry args={[3.55, 1.28, 1.15]} /><meshStandardMaterial color="#d5c49f" /></mesh>
    <mesh position={[0, 0.73, 0.582]}><boxGeometry args={[3.2, 0.24, 0.035]} /><meshStandardMaterial color="#58a4c7" /></mesh>
    <mesh position={[0, 1.32, 0]}><boxGeometry args={[3.72, 0.12, 1.28]} /><meshStandardMaterial color="#f3f1e7" /></mesh>
    <mesh position={[0.8, 1.64, 0]} rotation={[0, -0.15, 0]}><boxGeometry args={[0.62, 0.58, 0.35]} /><meshStandardMaterial color="#304147" /></mesh>
    <mesh position={[-0.65, 1.44, 0.05]}><boxGeometry args={[0.6, 0.1, 0.72]} /><meshStandardMaterial color="#fff8cc" /></mesh>
    <mesh position={[-1.25, 1.68, 0]}><boxGeometry args={[0.58, 0.62, 0.5]} /><meshStandardMaterial color="#e88c62" emissive="#ffbf7b" emissiveIntensity={0.12} /></mesh>
  </InteractiveGroup>;
}

function StoreWorld({ mode, onEnter, onSelect, onCheckout, onProfile }: { mode: SceneMode; onEnter: () => void; onSelect: (item: Project) => void; onCheckout: () => void; onProfile: () => void }) {
  return <group position={[0, -0.45, 0]}>
    <mesh position={[0, -0.05, -0.4]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[11, 9]} /><meshStandardMaterial color="#f0eee4" roughness={0.9} /></mesh>
    <mesh position={[0, 2.6, -4.05]}><boxGeometry args={[9, 5.3, 0.18]} /><meshStandardMaterial color="#edf1e8" /></mesh>
    <mesh position={[-4.42, 2.6, -0.45]}><boxGeometry args={[0.18, 5.3, 7.3]} /><meshStandardMaterial color="#e5ece9" /></mesh>
    <mesh position={[4.42, 2.6, -0.45]}><boxGeometry args={[0.18, 5.3, 7.3]} /><meshStandardMaterial color="#e5ece9" /></mesh>
    <mesh position={[0, 5.22, -0.45]}><boxGeometry args={[9, 0.18, 7.3]} /><meshStandardMaterial color="#f6f4ec" /></mesh>
    <FridgeWall /><CenterAisle /><ProjectWall onSelect={onSelect} /><Cashier onProfile={onProfile} /><Checkout onCheckout={onCheckout} />

    <mesh position={[0, 4.6, 3.18]}><boxGeometry args={[8.65, 1.18, 0.22]} /><meshStandardMaterial color="#4e9fc6" /></mesh>
    <mesh position={[0, 5.17, 3.31]}><boxGeometry args={[8.65, 0.09, 0.035]} /><meshStandardMaterial color="#fffdf3" emissive="#ffffff" emissiveIntensity={0.2} /></mesh>
    <mesh position={[0, 4.03, 3.31]}><boxGeometry args={[8.65, 0.11, 0.035]} /><meshStandardMaterial color="#fffdf3" emissive="#ffffff" emissiveIntensity={0.16} /></mesh>
    <mesh position={[0, 4.6, 3.31]}><boxGeometry args={[4.8, 0.42, 0.035]} /><meshStandardMaterial color="#fffdf3" emissive="#fff7d3" emissiveIntensity={0.28} /></mesh>
    <mesh position={[0, 4.6, 3.335]}><boxGeometry args={[2.2, 0.07, 0.012]} /><meshStandardMaterial color="#4e9fc6" /></mesh>
    {[-3.75, 3.75].map((x) => <group key={`sign-${x}`} position={[x, 4.6, 3.335]}>
      <mesh><circleGeometry args={[0.4, 32]} /><meshStandardMaterial color="#fffdf3" emissive="#fffdf3" emissiveIntensity={0.12} /></mesh>
      <mesh position={[0, 0, 0.012]}><ringGeometry args={[0.2, 0.29, 32]} /><meshStandardMaterial color="#4e9fc6" /></mesh>
    </group>)}
    <mesh position={[0, 3.91, 3.43]}><boxGeometry args={[3.05, 0.08, 0.82]} /><meshStandardMaterial color="#e8eee9" /></mesh>
    {[-3.15, 3.15].map((x) => <mesh key={x} position={[x, 2.15, 3.14]}><boxGeometry args={[2.05, 3.65, 0.08]} /><meshStandardMaterial color="#8ac3d5" transparent opacity={0.44} /></mesh>)}
    <group position={[-3.15, 1.75, 3.205]}>
      <mesh><boxGeometry args={[0.78, 1.05, 0.035]} /><meshStandardMaterial color="#f2d06f" /></mesh>
      <mesh position={[0, 0.28, 0.022]}><boxGeometry args={[0.52, 0.08, 0.012]} /><meshStandardMaterial color="#fffdf3" /></mesh>
    </group>
    <group position={[3.15, 1.75, 3.205]}>
      <mesh><boxGeometry args={[0.78, 1.05, 0.035]} /><meshStandardMaterial color="#e98267" /></mesh>
      <mesh position={[0, 0.28, 0.022]}><boxGeometry args={[0.52, 0.08, 0.012]} /><meshStandardMaterial color="#fffdf3" /></mesh>
    </group>
    <SlidingDoors open={mode !== "outside"} />
    {mode === "outside" && <mesh position={[0, -0.08, 6.3]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[16, 7]} /><meshStandardMaterial color="#384a4c" /></mesh>}
    <InteractiveGroup position={[0, 1.9, 3.28]} scale={1.08} onClick={(event) => { event.stopPropagation(); onEnter(); }}>
      <mesh><boxGeometry args={[2.35, 3.65, 0.09]} /><meshBasicMaterial transparent opacity={0.001} /></mesh>
    </InteractiveGroup>
    {[-3.25, 0, 3.25].map((x) => <pointLight key={x} position={[x, 4.55, -0.5]} intensity={5.5} distance={6.5} color="#fff4ca" />)}
  </group>;
}

function StoreCanvas(props: { mode: SceneMode; onEnter: () => void; onSelect: (item: Project) => void; onCheckout: () => void; onProfile: () => void }) {
  return <Canvas camera={{ fov: 31, near: 0.1, far: 80 }} dpr={[1, 1.4]} gl={{ antialias: true }}>
    <color attach="background" args={[props.mode === "outside" ? "#dce7e5" : "#d9e7e6"]} />
    <ambientLight intensity={1.45} /><directionalLight position={[4, 9, 8]} intensity={1.7} color="#fff1c9" />
    <CameraRig mode={props.mode} /><StoreWorld {...props} />
  </Canvas>;
}

function ProfileModal({ onClose }: { onClose: () => void }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="个人简介">
    <button className="modal-close" onClick={onClose} aria-label="关闭个人简介"><X size={19} /></button>
    <article className="profile-card">
      <header className="profile-intro">
        <div className="profile-avatar" role="img" aria-label="参考图中的黑发墨镜店员头像" />
        <div><small>STORE STAFF / DESIGNER</small><h2>周成一</h2><p>UI 设计师 · 深圳</p></div>
      </header>
      <section className="profile-about"><UserRound size={19} /><div><small>ABOUT</small><h3>自我介绍</h3><p>拥有一年半 UI 设计工作经验，熟悉 C 端与 B 端界面设计，也有网页和小程序项目经验，擅长分析用户心理。负责过 SaaS 系统核心模块，能独立完成从 0 到 1 的中小型项目搭建。熟练使用 Figma 绘制视觉稿，并使用 AE 制作界面动效。热爱互联网行业，关注国内外设计趋势。</p></div></section>
      <div className="profile-columns">
        <section><GraduationCap size={19} /><div><small>EDUCATION</small><h3>教育经历</h3><p><b>2021.09 — 2025.06</b><br />湖北文理学院理工学院<br />视觉传达设计 · 本科</p></div></section>
        <section><BriefcaseBusiness size={19} /><div><small>EXPERIENCE</small><h3>工作经历</h3><p><b>2025.11 — 2026.03</b><br />盯链创投(深圳)有限公司<br />UI 设计师 · 深圳</p><p><b>2024.07 — 2025.06</b><br />武汉嘉赞设计咨询有限公司<br />UI 设计师 · 武汉</p></div></section>
      </div>
      <footer><span>周成一 · UI DESIGNER</span><button onClick={onClose}>继续逛店</button></footer>
    </article>
  </div>;
}

function ContactReceipt({ onClose }: { onClose: () => void }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="联系方式"><button className="modal-close" onClick={onClose}><X size={19} /></button>
    <article className="receipt"><ReceiptText size={26} /><small>CHECKOUT / CONTACT</small><h2>谢谢光临</h2><p>欢迎来信聊聊你的项目。</p><a href="mailto:17771730581@163.com"><Mail size={16} /> 17771730581@163.com</a><a href="tel:17771730581"><Phone size={16} /> 17771730581</a><span><MapPin size={16} /> 深圳</span></article>
  </div>;
}

function SeasonPicker({ season, onChange }: { season: Season; onChange: (season: Season) => void }) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = seasons.find((option) => option.id === season)!;

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return <div className="season-picker" ref={pickerRef}>
    <button ref={triggerRef} type="button" className="nav-button season-trigger" aria-label={`季节环境：${current.name}，展开选择`} aria-expanded={open} aria-controls="season-options" onClick={() => setOpen((value) => !value)}>
      <current.Icon size={15} aria-hidden="true" /><span>季节 · {current.name}</span><ChevronDown size={13} className={open ? "chevron-open" : ""} aria-hidden="true" />
    </button>
    {open && <div id="season-options" className="season-options" role="group" aria-label="选择店外季节环境">
      {seasons.map(({ id, name, detail, Icon }) => <button key={id} type="button" className={`season-option ${season === id ? "selected" : ""}`} aria-pressed={season === id} onClick={() => { onChange(id); setOpen(false); }}>
        <Icon size={17} aria-hidden="true" /><span><strong>{name}</strong><small>{detail}</small></span>{season === id && <Check size={15} aria-hidden="true" />}
      </button>)}
    </div>}
  </div>;
}

function MusicControl({ enabled, title, onToggle }: { enabled: boolean; title: string; onToggle: () => void }) {
  return <button type="button" className={`music-toggle ${enabled ? "is-on" : "is-off"}`} title={`当前曲目：${title}`} aria-label={enabled ? "关闭背景音乐" : "开启背景音乐"} aria-pressed={enabled} onClick={onToggle}>
    <Music size={16} aria-hidden="true" />
  </button>;
}

function MobileViewNotice({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    const desktop = window.matchMedia("(min-width: 721px)");
    const onResize = () => { if (desktop.matches) onClose(); };
    desktop.addEventListener("change", onResize);
    return () => { desktop.removeEventListener("change", onResize); dialog?.close(); };
  }, [onClose]);
  return <dialog ref={dialogRef} className="mobile-view-notice" aria-labelledby="mobile-notice-title" aria-describedby="mobile-notice-description" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="mobile-notice-icon"><Monitor size={28} aria-hidden="true" /></div>
    <span className="mobile-notice-kicker">MONDAY MART 24</span>
    <h2 id="mobile-notice-title">电脑端体验更佳</h2>
    <p id="mobile-notice-description">推荐使用 PC 端查看网页，<br />以获得更完整的场景与更好的交互体验。</p>
    <button type="button" onClick={onClose}>继续手机浏览 <span aria-hidden="true">→</span></button>
  </dialog>;
}

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [mobileNoticeOpen, setMobileNoticeOpen] = useState(false);
  const [loadingStarted, setLoadingStarted] = useState(false);
  const [loadingFinishing, setLoadingFinishing] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState<0 | 1 | 2 | 3>(0);
  const [preloadStage, setPreloadStage] = useState<0 | 1 | 2>(0);
  const [mode, setMode] = useState<SceneMode>("outside");
  const [season, setSeason] = useState<Season>("spring");
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [resetViewKey, setResetViewKey] = useState(0);
  const [entryResetting, setEntryResetting] = useState(false);
  const [selected, setSelected] = useState<Project | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const audioRefs = useRef<Partial<Record<Season, HTMLAudioElement>>>({});
  const ambienceRef = useRef<SeasonAmbience | null>(null);
  const activeSeasonRef = useRef<Season>(season);
  const playbackTimeRef = useRef(0);
  const musicStartedRef = useRef(false);
  const musicEnabledRef = useRef(false);
  const entryRequestedRef = useRef(false);

  useEffect(() => {
    if (loading || mobileNoticeOpen || mode !== "outside" || entryResetting || selected || contactOpen || profileOpen) return;

    const idleDelay = 10_000;
    const pressedPointers = new Set<number>();
    let lastActivity = performance.now();
    let timer: number | undefined;
    const clearTimer = () => {
      window.clearTimeout(timer);
      timer = undefined;
    };
    const checkIdle = () => {
      timer = undefined;
      if (document.hidden || pressedPointers.size || entryRequestedRef.current) return;
      const remaining = idleDelay - (performance.now() - lastActivity);
      if (remaining > 0) timer = window.setTimeout(checkIdle, remaining);
      else setResetViewKey((value) => value + 1);
    };
    const recordActivity = () => {
      lastActivity = performance.now();
      // Keep a single timer while pointer events arrive, rather than
      // allocating a timeout on every mouse-move event.
      if (timer === undefined && !document.hidden && !pressedPointers.size) {
        timer = window.setTimeout(checkIdle, idleDelay);
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      pressedPointers.add(event.pointerId);
      clearTimer();
      recordActivity();
    };
    const onPointerUp = (event: PointerEvent) => {
      pressedPointers.delete(event.pointerId);
      recordActivity();
    };
    const pause = () => { clearTimer(); pressedPointers.clear(); };
    const onWindowBlur = (event: FocusEvent) => { if (event.target === window) pause(); };
    const onVisibilityChange = () => {
      if (document.hidden) pause();
      else recordActivity();
    };
    const activityEvents = ["pointermove", "wheel", "keydown", "scroll", "focus"] as const;
    const options = { capture: true, passive: true };
    for (const event of activityEvents) window.addEventListener(event, recordActivity, options);
    window.addEventListener("pointerdown", onPointerDown, options);
    window.addEventListener("pointerup", onPointerUp, options);
    window.addEventListener("pointercancel", onPointerUp, options);
    window.addEventListener("blur", onWindowBlur, options);
    document.addEventListener("visibilitychange", onVisibilityChange);
    recordActivity();

    return () => {
      clearTimer();
      for (const event of activityEvents) window.removeEventListener(event, recordActivity, options);
      window.removeEventListener("pointerdown", onPointerDown, options);
      window.removeEventListener("pointerup", onPointerUp, options);
      window.removeEventListener("pointercancel", onPointerUp, options);
      window.removeEventListener("blur", onWindowBlur, options);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [loading, mobileNoticeOpen, mode, entryResetting, selected, contactOpen, profileOpen]);

  useEffect(() => {
    const timers: number[] = [];
    const frame = requestAnimationFrame(() => {
      setLoadingStarted(true);
      // Render the exterior first, then warm the interior assets underneath
      // the fixed five-second loader. Copy changes at each 25% mark.
      timers.push(window.setTimeout(() => setPreloadStage(1), 650));
      timers.push(window.setTimeout(() => setLoadingMessageIndex(1), 1250));
      timers.push(window.setTimeout(() => setPreloadStage(2), 1650));
      timers.push(window.setTimeout(() => setLoadingMessageIndex(2), 2500));
      timers.push(window.setTimeout(() => setLoadingMessageIndex(3), 3750));
      timers.push(window.setTimeout(() => setLoadingFinishing(true), 5000));
      timers.push(window.setTimeout(() => {
        setLoading(false);
        if (window.matchMedia("(max-width: 720px)").matches) setMobileNoticeOpen(true);
      }, 5200));
    });
    return () => {
      cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const playSeasonTrack = (targetSeason: Season, time = playbackTimeRef.current) => {
    const audio = audioRefs.current[targetSeason];
    if (!audio) return;
    const seek = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) audio.currentTime = time % audio.duration;
      else audio.currentTime = time;
    };
    if (audio.readyState >= 1) seek();
    else audio.addEventListener("loadedmetadata", seek, { once: true });
    audio.volume = 0.2;
    audio.muted = !musicEnabledRef.current;
    audio.play().catch(() => {
      if (musicEnabledRef.current) {
        musicEnabledRef.current = false;
        setMusicEnabled(false);
        ambienceRef.current?.setEnabled(false);
      }
    });
  };

  const toggleMusic = () => {
    const audio = audioRefs.current[activeSeasonRef.current];
    if (!audio) return;
    if (musicEnabledRef.current) {
      musicEnabledRef.current = false;
      setMusicEnabled(false);
      audio.muted = true;
      ambienceRef.current?.setEnabled(false);
      return;
    }
    musicEnabledRef.current = true;
    setMusicEnabled(true);
    musicStartedRef.current = true;
    audio.muted = false;
    if (audio.paused) playSeasonTrack(activeSeasonRef.current, audio.currentTime || playbackTimeRef.current);
    if (!ambienceRef.current) ambienceRef.current = new SeasonAmbience(activeSeasonRef.current, mode === "inside");
    void ambienceRef.current.resume();
    ambienceRef.current.setEnabled(true);
  };

  const changeSeason = (nextSeason: Season) => {
    if (nextSeason === activeSeasonRef.current) return;
    const currentAudio = audioRefs.current[activeSeasonRef.current];
    if (currentAudio) {
      playbackTimeRef.current = currentAudio.currentTime;
      currentAudio.pause();
    }
    activeSeasonRef.current = nextSeason;
    setSeason(nextSeason);
    ambienceRef.current?.setSeason(nextSeason);
    if (musicStartedRef.current) playSeasonTrack(nextSeason, playbackTimeRef.current);
    else {
      const nextAudio = audioRefs.current[nextSeason];
      if (nextAudio && nextAudio.readyState >= 1) nextAudio.currentTime = playbackTimeRef.current % nextAudio.duration;
    }
  };

  useEffect(() => { ambienceRef.current?.setInside(mode === "inside"); }, [mode]);
  useEffect(() => () => { ambienceRef.current?.dispose(); ambienceRef.current = null; }, []);

  const enterStore = () => {
    if (mode !== "outside" || entryRequestedRef.current) return;
    entryRequestedRef.current = true;
    setEntryResetting(true);
    setResetViewKey((value) => value + 1);
  };
  const finishEntryReset = () => {
    if (!entryRequestedRef.current) return false;
    entryRequestedRef.current = false;
    setEntryResetting(false);
    setMode("entering");
    return true;
  };
  const returnOutside = () => {
    entryRequestedRef.current = false;
    setEntryResetting(false);
    setMode("outside");
  };
  return <main className="site-shell">
    {seasons.map(({ id }) => <audio key={id} ref={(node) => { if (node) audioRefs.current[id] = node; }} src={seasonTracks[id].src} preload="none" loop onTimeUpdate={(event) => { if (id === activeSeasonRef.current) playbackTimeRef.current = event.currentTarget.currentTime; }} />)}
    <nav className={`topbar ${mode} ${season}`}><button className="brand" onClick={returnOutside}><span>24</span><strong>MONDAY MART</strong></button><div className="nav-actions"><SeasonPicker season={season} onChange={changeSeason} /><MusicControl enabled={musicEnabled} title={seasonTracks[season].title} onToggle={toggleMusic} />{mode === "outside" && <button type="button" className="nav-button reset-trigger" aria-label="复位店外镜头" disabled={entryResetting} onClick={() => setResetViewKey((value) => value + 1)}><RotateCcw size={15} aria-hidden="true" /> 复位</button>}{mode === "inside" && <button className="nav-button ghost" onClick={returnOutside}><ArrowLeft size={15} /> 店外</button>}<a className="nav-button" href="/zhou-chengyi-resume.pdf" download="周成一-UI设计师-简历.pdf"><Download size={15} /> 简历</a></div></nav>
    <section className={`scene-wrap ${mode}`} aria-label="3D 便利店作品集">
      <div className="scene-viewport">
      <RainyStoreScene mode={mode} season={season} resetViewKey={resetViewKey} preloadStage={preloadStage} onEnter={enterStore} onViewReset={finishEntryReset} onEntered={() => setMode((current) => current === "entering" ? "inside" : current)} onLightningFlash={() => ambienceRef.current?.playThunder()} onSelect={(project) => { if (mode === "inside") setSelected(project); }} onCheckout={() => { if (mode === "inside") setContactOpen(true); }} onProfile={() => { if (mode === "inside") setProfileOpen(true); }} projects={projects} />
      </div>
      <div className={`minimal-prompt ${mode} ${season}`}>
        {mode === "outside" && <><span>PORTFOLIO CONVENIENCE STORE</span><button onClick={enterStore} disabled={entryResetting}>{entryResetting ? "正在调整视角" : "进入便利店"} <b>→</b></button></>}
        {mode === "entering" && <span className="entering-status"><i /> 正在推门进入</span>}
        {mode === "inside" && <span className="inside-hint"><MousePointer2 size={14} /> 点击店员看简介 · 点击展品看作品 · 点击收银台查看联系方式</span>}
      </div>
    </section>
    {selected && <ProjectImageViewer key={selected.id} project={selected} onClose={() => setSelected(null)} />}{contactOpen && <ContactReceipt onClose={() => setContactOpen(false)} />}{profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
    {mobileNoticeOpen && <MobileViewNotice onClose={() => setMobileNoticeOpen(false)} />}
    {loading && <div className={`entry-loader ${loadingFinishing ? "finishing" : ""}`} role="status" aria-label="正在准备便利店场景" aria-live="polite">
      <div className="entry-loader-content">
        <span className="entry-loader-kicker">PORTFOLIO CONVENIENCE STORE</span>
        <strong>MONDAY MART <span>24</span></strong>
        <p>{loadingMessages[loadingMessageIndex]}</p>
        <div className="entry-loader-track" aria-hidden="true"><i className={loadingStarted ? "started" : ""} /></div>
      </div>
    </div>}
  </main>;
}
