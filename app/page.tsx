"use client";

import { ArrowLeft, BriefcaseBusiness, Check, ChevronDown, CloudRain, Download, GraduationCap, Leaf, Mail, MapPin, Monitor, MousePointer2, Music, Phone, ReceiptText, RotateCcw, Snowflake, Sun, UserRound, X } from "lucide-react";
import { lazy, Suspense, Component, type ReactNode, useEffect, useRef, useState } from "react";
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
const RainyStoreScene = lazy(() => import("@/components/RainyStoreScene"));
const ProjectImageViewer = lazy(() => import("@/components/ProjectImageViewer"));
const mobileNoticeQuery = "(max-width: 720px)";

class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

const resumeUrl = import.meta.env.VITE_RESUME_PDF_URL ?? "/zhou-chengyi-resume.pdf";
let resumeDownload: Promise<void> | undefined;

function downloadResume() {
  return resumeDownload ??= (async () => {
    const response = await fetch(resumeUrl, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error("PDF unavailable");
    const pdf = await response.blob();
    if (await pdf.slice(0, 5).text() !== "%PDF-") throw new Error("Invalid PDF");
    const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "周成一-UI设计师-简历.pdf";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  })().finally(() => { resumeDownload = undefined; });
}

function LoadingProfileModal({ onClose, status, ready }: { onClose: () => void; status: string; ready: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [download, setDownload] = useState("");
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  const startDownload = async () => {
    setDownload("正在请求简历…");
    try {
      await downloadResume();
      setDownload("已交给浏览器处理，请查看下载记录。");
    } catch {
      setDownload("简历暂时无法下载，请重试。");
    }
  };
  return <dialog ref={ref} className="modal-backdrop resume-dialog" aria-label="个人简介"
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <article className="resume-card">
      <header className="resume-header">
        <div><small>MONDAY MART / ABOUT</small><h2>关于我</h2></div>
        <div className="resume-actions">
          {resumeUrl ? <button disabled={download === "正在请求简历…"} onClick={startDownload}>
            <Download size={17} aria-hidden="true" /> 下载简历 PDF
          </button> : <span>简历 PDF 待提供</span>}
          <button autoFocus onClick={onClose} aria-label="关闭个人简介"><X size={19} /></button>
        </div>
      </header>
      {download && <p className="resume-feedback" role="status">{download}</p>}
      <section className="profile-about">
        <h3>个人介绍</h3>
        <p className="profile-identity">周成一 · UI 设计师 · 深圳</p>
        <ProfileIntroduction />
      </section>
      <ProfileHistory />
      <footer>
        <span className={ready ? "is-ready" : undefined} role="status">
          {ready && <Check size={16} aria-hidden="true" />}
          {ready ? "作品集已准备就绪" : status}
        </span>
        {ready && <button onClick={onClose}>关闭后进入作品集 <span aria-hidden="true">→</span></button>}
      </footer>
    </article>
  </dialog>;
}

function ProfileIntroduction() {
  return <p>拥有一年半 UI 设计工作经验，熟悉 C 端与 B 端界面设计，也有网页和小程序项目经验，擅长分析用户心理。负责过 SaaS 系统核心模块，能独立完成从 0 到 1 的中小型项目搭建。熟练使用 Figma 绘制视觉稿，并使用 AE 制作界面动效。热爱互联网行业，关注国内外设计趋势。</p>;
}

function ProfileHistory() {
  return <div className="profile-columns">
    <section><GraduationCap size={19} aria-hidden="true" /><div><small>EDUCATION</small><h3>教育经历</h3><p><b>2021.09 — 2025.06</b><br />湖北文理学院理工学院<br />视觉传达设计 · 本科</p></div></section>
    <section><BriefcaseBusiness size={19} aria-hidden="true" /><div><small>EXPERIENCE</small><h3>工作经历</h3><p><b>2025.11 — 2026.03</b><br />盯链创投(深圳)有限公司<br />UI 设计师 · 深圳</p><p><b>2024.07 — 2025.06</b><br />武汉嘉赞设计咨询有限公司<br />UI 设计师 · 武汉</p></div></section>
  </div>;
}

function StoreProfileModal({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return <dialog ref={ref} className="modal-backdrop resume-dialog store-profile-dialog" aria-labelledby="store-profile-title"
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="store-profile-panel">
      <button autoFocus type="button" className="modal-close" onClick={onClose} aria-label="关闭个人简介"><X size={19} /></button>
      <article className="store-profile-card">
        <header className="profile-intro">
          <div className="profile-avatar" role="img" aria-label="店员头像" />
          <div><small>STORE STAFF / DESIGNER</small><h2 id="store-profile-title">周成一</h2><p>UI 设计师 · 深圳</p></div>
        </header>
        <section className="profile-about">
          <UserRound size={19} aria-hidden="true" />
          <div><small>ABOUT</small><h3>自我介绍</h3><ProfileIntroduction /></div>
        </section>
        <ProfileHistory />
        <footer><span>周成一 · UI DESIGNER</span><button type="button" onClick={onClose}>继续逛店</button></footer>
      </article>
    </div>
  </dialog>;
}

function MobileViewNotice({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return <dialog ref={ref} className="mobile-view-notice" aria-labelledby="mobile-notice-title" aria-describedby="mobile-notice-description"
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="mobile-notice-icon"><Monitor size={28} aria-hidden="true" /></div>
    <span className="mobile-notice-kicker">MONDAY MART 24</span>
    <h2 id="mobile-notice-title">电脑端体验更佳</h2>
    <p id="mobile-notice-description">推荐使用 PC 端查看网页，<br />以获得更完整的场景与更好的交互体验。</p>
    <button autoFocus type="button" onClick={onClose}>继续手机浏览 <span aria-hidden="true">→</span></button>
  </dialog>;
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

export default function Home() {
  const [exterior, setExterior] = useState<"pending" | "ready" | "failed">("pending");
  const simulateLoading = import.meta.env.MODE === "preview" &&
    new URLSearchParams(window.location.search).get("simulateLoading") === "10s";
  const [sceneReady, setSceneReady] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [showLoader, setShowLoader] = useState(true);
  const [mobileNoticePending, setMobileNoticePending] = useState(false);
  const [previewElapsed, setPreviewElapsed] = useState(false);
  const [offerProfile, setOfferProfile] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [interiorReady, setInteriorReady] = useState(false);
  const loading = exterior !== "ready";
  const mobileNoticeOpen = !loading && !introOpen && mobileNoticePending;
  const storeBlocked = loading || showLoader || introOpen || mobileNoticePending;
  const storefrontProgress = loading ? loadingProgress : 100;
  const [mode, setMode] = useState<SceneMode>("outside");
  const [season, setSeason] = useState<Season>("spring");
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [resetViewKey, setResetViewKey] = useState(0);
  const [entryResetting, setEntryResetting] = useState(false);
  const [selected, setSelected] = useState<Project | null>(null);
  const [projectError, setProjectError] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileTrigger = useRef<HTMLButtonElement>(null);
  const entryButton = useRef<HTMLButtonElement>(null);
  const restoreEntryFocus = useRef(false);
  useEffect(() => {
    if (!restoreEntryFocus.current || introOpen || (!loading && storeBlocked)) return;
    restoreEntryFocus.current = false;
    (loading ? profileTrigger : entryButton).current?.focus();
  }, [introOpen, loading, storeBlocked]);
  const audioRefs = useRef<Partial<Record<Season, HTMLAudioElement>>>({});
  const ambienceRef = useRef<SeasonAmbience | null>(null);
  const activeSeasonRef = useRef<Season>(season);
  const playbackTimeRef = useRef(0);
  const musicStartedRef = useRef(false);
  const musicEnabledRef = useRef(false);
  const entryRequestedRef = useRef(false);

  useEffect(() => {
    if (storeBlocked || mode !== "outside" || entryResetting || selected || contactOpen || profileOpen) return;

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
  }, [storeBlocked, mode, entryResetting, selected, contactOpen, profileOpen]);

  useEffect(() => {
    if (!simulateLoading) return;
    const timer = window.setTimeout(() => {
      performance.mark("monday:simulation-10s");
      setPreviewElapsed(true);
    }, 10000);
    return () => clearTimeout(timer);
  }, [simulateLoading]);

  useEffect(() => {
    if (sceneReady && (!simulateLoading || previewElapsed)) {
      setExterior((current) => current === "pending" ? "ready" : current);
    }
  }, [sceneReady, simulateLoading, previewElapsed]);

  useEffect(() => {
    if (exterior !== "ready") return;
    const finish = window.setTimeout(() => {
      setMobileNoticePending(window.matchMedia(mobileNoticeQuery).matches);
      setShowLoader(false);
    }, 200);
    return () => clearTimeout(finish);
  }, [exterior]);

  useEffect(() => {
    if (!mobileNoticePending) return;
    const narrowScreen = window.matchMedia(mobileNoticeQuery);
    const dismissOnDesktop = () => {
      if (!narrowScreen.matches) {
        restoreEntryFocus.current = true;
        setMobileNoticePending(false);
      }
    };
    dismissOnDesktop();
    narrowScreen.addEventListener("change", dismissOnDesktop);
    return () => narrowScreen.removeEventListener("change", dismissOnDesktop);
  }, [mobileNoticePending]);

  useEffect(() => {
    if (exterior !== "pending") return;
    const offer = window.setTimeout(() => setOfferProfile(true), 2000);
    const deadline = window.setTimeout(() => setExterior("failed"), 30000);
    return () => { clearTimeout(offer); clearTimeout(deadline); };
  }, [exterior]);

  useEffect(() => {
    if (!entryResetting || interiorReady || exterior !== "ready") return;
    const timeout = window.setTimeout(() => setExterior("failed"), 30000);
    return () => clearTimeout(timeout);
  }, [entryResetting, interiorReady, exterior]);

  useEffect(() => {
    if (entryResetting && interiorReady) setResetViewKey((value) => value + 1);
  }, [entryResetting, interiorReady]);

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
    if (storeBlocked || mode !== "outside" || entryRequestedRef.current) return;
    entryRequestedRef.current = true;
    setEntryResetting(true);
  };
  const finishEntryReset = () => {
    if (!entryRequestedRef.current) return false;
    entryRequestedRef.current = false;
    setEntryResetting(false);
    setMode(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "inside" : "entering");
    return true;
  };
  const returnOutside = () => {
    entryRequestedRef.current = false;
    setEntryResetting(false);
    setProjectError(false);
    setMode("outside");
  };
  return <main className="site-shell">
    {seasons.map(({ id }) => <audio key={id} ref={(node) => { if (node) audioRefs.current[id] = node; }} src={seasonTracks[id].src} preload="none" loop onTimeUpdate={(event) => { if (id === activeSeasonRef.current) playbackTimeRef.current = event.currentTarget.currentTime; }} />)}
    <nav inert={storeBlocked} className={`topbar ${mode} ${season}`}><button className="brand" onClick={returnOutside}><span>24</span><strong>MONDAY MART</strong></button><div className="nav-actions"><SeasonPicker season={season} onChange={changeSeason} /><MusicControl enabled={musicEnabled} title={seasonTracks[season].title} onToggle={toggleMusic} />{mode === "outside" && <button type="button" className="nav-button reset-trigger" aria-label="复位店外镜头" disabled={entryResetting} onClick={() => setResetViewKey((value) => value + 1)}><RotateCcw size={15} aria-hidden="true" /> 复位</button>}{mode === "inside" && <button className="nav-button ghost" onClick={returnOutside}><ArrowLeft size={15} /> 店外</button>}<a className="nav-button" href="/zhou-chengyi-resume.pdf" download="周成一-UI设计师-简历.pdf"><Download size={15} /> 简历</a></div></nav>
    <section inert={storeBlocked} className={`scene-wrap ${mode}`} aria-label="3D 便利店作品集">
      <div className="scene-viewport">
      {exterior !== "failed" && <SceneBoundary onError={() => setExterior("failed")}>
        <Suspense fallback={null}><RainyStoreScene onExteriorProgress={setLoadingProgress} onExteriorReady={() => { performance.mark("monday:exterior-ready"); setSceneReady(true); }}
          onInteriorReady={() => { performance.mark("monday:interior-ready"); setInteriorReady(true); }}
          mode={mode} season={season} resetViewKey={resetViewKey} onEnter={enterStore} onViewReset={finishEntryReset} onEntered={() => setMode((current) => current === "entering" ? "inside" : current)} onLightningFlash={() => ambienceRef.current?.playThunder()}
          onSelect={(project) => { if (mode === "inside") { setProjectError(false); setSelected(project); } }}
          onCheckout={() => { if (mode === "inside") setContactOpen(true); }} onProfile={() => { if (mode === "inside") setProfileOpen(true); }} projects={projects} /></Suspense>
      </SceneBoundary>}
      </div>
      <div className={`minimal-prompt ${mode} ${season}`}>
        {mode === "outside" && <><span>PORTFOLIO CONVENIENCE STORE</span><button ref={entryButton} onClick={enterStore} disabled={entryResetting}>{entryResetting ? "正在准备店内" : "进入便利店"} <b>→</b></button></>}
        {mode === "entering" && <span className="entering-status"><i /> 正在推门进入</span>}
        {mode === "inside" && <span className="inside-hint"><MousePointer2 size={14} /> 点击店员看简介 · 点击展品看作品 · 点击收银台查看联系方式</span>}
      </div>
    </section>
    {projectError && <p className="work-loading" role="alert">作品暂时无法打开，请重新点击展品。 <button type="button" onClick={() => setProjectError(false)}>关闭</button></p>}
    {selected && <SceneBoundary key={selected.id} onError={() => { setSelected(null); setProjectError(true); }}>
      <Suspense fallback={<div className="work-loading" role="status">正在打开作品…</div>}>
        <ProjectImageViewer project={selected} onClose={() => setSelected(null)} />
      </Suspense></SceneBoundary>}{contactOpen && <ContactReceipt onClose={() => setContactOpen(false)} />}{profileOpen && <StoreProfileModal onClose={() => setProfileOpen(false)} />}
    {(loading || showLoader) && <div className={`entry-loader${loading ? "" : " finishing"}`} inert={!loading}>
      <div className="entry-loader-content">
        <span className="entry-loader-kicker">PORTFOLIO CONVENIENCE STORE</span>
        <strong>MONDAY MART <span>24</span></strong>
        <p role="status">{exterior === "failed" ? "3D 场景暂时无法加载" : "正在点亮店面"}</p>
        {exterior !== "failed" && <div className="entry-loader-track" role="progressbar" aria-label="店面加载进度" aria-valuenow={storefrontProgress}>
          <i style={{ width: `${storefrontProgress}%` }} />
        </div>}
        {(offerProfile || exterior === "failed") && <div className={exterior === "failed" ? undefined : "entry-loader-help"}>
          <p>加载需要一点时间，先了解一下我？</p>
          <button className="entry-profile-trigger" ref={profileTrigger} onClick={() => { restoreEntryFocus.current = true; setIntroOpen(true); }}>了解我的经历</button>
        </div>}
        {exterior === "failed" && <p><button type="button" onClick={() => window.location.reload()}>重试 3D 场景</button></p>}
      </div>
    </div>}
    {mobileNoticeOpen && <MobileViewNotice onClose={() => {
      restoreEntryFocus.current = true;
      setMobileNoticePending(false);
    }} />}
    {introOpen && <LoadingProfileModal ready={exterior === "ready"} onClose={() => setIntroOpen(false)}
      status={exterior === "ready" ? "场景已准备好，关闭后即可开始探索。" : exterior === "failed" ? "场景加载失败，关闭后可重试。" : "作品集仍在准备中，你可以继续阅读。"} />}
  </main>;
}
