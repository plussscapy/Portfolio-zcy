"use client";

import { useState } from "react";
import "./character-review.css";

type View = "portrait" | "front";

export default function CharacterReview() {
  const [view, setView] = useState<View>("portrait");
  const portrait = view === "portrait";
  return <main className="character-review">
    <header className="character-review-header">
      <div><p>MONDAY / CHARACTER STUDY</p><h1>店员形象对照</h1></div>
      <a href="/">回到便利店 ↗</a>
    </header>
    <div className="character-review-toolbar">
      <div className="character-review-tabs" aria-label="查看角度">
        <button aria-pressed={portrait} onClick={() => setView("portrait")}>脸部近景</button>
        <button aria-pressed={!portrait} onClick={() => setView("front")}>全身正面</button>
      </div>
    </div>
    <div className="character-review-grid">
      <section className="character-review-panel">
        <h2><span>01</span> 修改前 <small>GLB 模型渲染</small></h2>
        <div className="character-review-visual">
          <img src={portrait ? "/character-review/face-before.png" : "/character-review/supplied-leftmost-front.png"}
            alt={portrait ? "修改前模型的脸部特写" : "修改前模型的全身正面"} width={720} height={900} />
        </div>
      </section>
      <section className="character-review-panel">
        <h2><span>02</span> 修改后 <small>透明 2D 人物贴片</small></h2>
        <div className="character-review-visual">
          {portrait ? <svg viewBox="275 5 500 620" role="img" aria-label="替换后人物的清晰脸部特写">
            <image href="/cashier-front-sprite.png" width="1024" height="1536" />
          </svg> : <img src="/cashier-front-sprite.png" alt="替换后人物的全身正面" width={1024} height={1536} />}
        </div>
      </section>
    </div>
    <footer>右侧为便利店当前使用的人物贴片。透明底图保留了参考图的发型、墨镜和服装细节。</footer>
  </main>;
}
