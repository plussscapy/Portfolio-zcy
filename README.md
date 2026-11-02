# MONDAY MART · 周成一作品集

以 3D 便利店为入口的交互作品集，包含店外与店内场景、进店动画、四季氛围、背景音乐、作品详情、简历下载及店员形象对照页。

线上地址：[zhouchengyi.art](https://zhouchengyi.art/)。网站使用阿里云 OSS 静态托管。

## 本地运行

使用 Node.js 24 LTS（最低 22.13），在仓库根目录运行：

```sh
npm ci
npm run dev
```

打开终端显示的本地地址。构建与预览：

```sh
npm run build
npm run preview
```

## 项目结构

| 路径 | 内容 |
| --- | --- |
| `app/page.tsx` | 作品集页面、作品内容、音乐与页面交互 |
| `app/globals.css` | 页面样式与响应式布局 |
| `components/RainyStoreScene.tsx` | Three.js 便利店场景 |
| `components/CharacterReview.tsx` | `/character-review` 店员形象对照页 |
| `components/GloveCursorPreview.tsx` | `?cursor=glove` 手套光标预览 |
| `lib/` | 季节氛围、进店路径及展品布局配置 |
| `public/` | 图片、模型、音频、简历、PDF 与解码资源 |
| `main.tsx` | 应用入口与页面选择 |
| `vite.config.ts` | Vite 与路径别名配置 |
| `netlify.toml` | 可选的 Netlify 构建与路由配置 |

技术栈：React、TypeScript、Vite、Three.js、React Three Fiber、Tailwind CSS。

## 更新内容

- 修改作品文字：`app/page.tsx` 中的 `projects`。
- 修改作品封面：`public/project-gift-front-01.png` 至 `04.png`。
- 更新简历：替换 `public/zhou-chengyi-resume.pdf`。
- 修改场景、动画：`components/RainyStoreScene.tsx`。
- 音乐来源与使用说明：`public/audio/README.md`。

## 发布到阿里云

当前仓库用于保存源码；上传 GitHub 本身不会更新线上网站。后续可配置 GitHub Actions，在提交后自动构建并上传到现有 OSS 空间。

手动发布步骤：

1. 执行 `npm ci` 和 `npm run build`。
2. 将 `dist/` **内部文件**上传到网站现有 OSS 空间，保持 `index.html` 在空间根目录。
3. 先上传新资源，最后更新 `index.html`；保留旧版带哈希的资源，避免已打开的页面加载失败。
4. 保持首页和错误文档均为 `index.html`，错误文档响应码为 `200`，以支持直接打开 `/character-review`。
5. 验证首页、进店与返回、作品详情、音乐及简历下载。

自动部署所需的阿里云凭据应通过 GitHub Actions Secrets 配置，并只授权网站空间所需权限。

## 仓库范围

本仓库从现有阿里云发布版本对应的 React/Vite 源码整理而来。网站运行资源与素材来源说明已保留；本地依赖、构建产物、Blender 工程及备份、部署截图、历史压缩包和凭据不纳入版本管理。

现有作品、简历和第三方素材的权利归各自权利人；本仓库未授予额外的开源使用许可。
