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
| `app/page.tsx` | 作品集页面、音乐与页面交互 |
| `lib/projects.json` | 作品入口信息及按顺序展示的图片清单 |
| `components/ProjectImageViewer.tsx` | 图片作品详情、原图查看及竖向阅读进度 |
| `components/project-image-viewer.css` | 图片详情边距、首尾圆角及响应式样式 |
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

- 修改作品入口及详情图片顺序：`lib/projects.json`。每件作品的 `images` 数组按展示顺序排列，数量不限；每张图片有稳定的 `id`、原图路径、尺寸和说明文字。
- 当前四个作品暂共用 AFTER HOURS 概念示例，每个入口展示 20 张；内容由 5 张原始 PNG 组成并重复排列，仅用于样式验证。原图位于 `public/projects/after-hours/`，没有转换格式或重新压缩。替换真实作品时按实际图片填写清单；支持不同高度的长图。
- 作品仍按原来的包装卡片 → 展开弹窗面板方式显示，保留背景遮罩、面板尺寸、开启动画和关闭后返回店内的逻辑。只将面板内部替换为图片详情，保持上下滚动；电脑端在面板内左右 36px，手机端（宽度不超过 767px）左右 24px；首图上角、尾图下角各 8px 圆角。右侧显示当前页、100px 竖向进度线和总页数。
- 本地可直接打开 `/project-preview` 检查同一个作品详情组件，附加 `?project=project-2` 等参数可选择作品；关闭后返回便利店。测试版的选图工具没有接入正式访客界面，后台上传与发布尚未实现。
- 修改作品封面：`public/project-gift-front-01.png` 至 `04.png`。
- 更新简历：替换 `public/zhou-chengyi-resume.pdf`。
- 修改场景、动画：`components/RainyStoreScene.tsx`。
- 音乐来源与使用说明：`public/audio/README.md`。

## 发布到阿里云

自动发布配置位于 `.github/workflows/deploy-aliyun.yml`：推送到 `main` 分支，或在 GitHub Actions 中手动运行 **Deploy to Alibaba Cloud OSS**，会安装依赖、构建网站、上传运行文件并验证线上首页和版本标记。

发布使用 GitHub OIDC 与阿里云 RAM 临时身份，无需保存长期 AccessKey。仅 `plussscapy/Portfolio-zcy` 的 `main` 分支可承担发布角色；权限仅为当前网站 OSS 对象的读取与写入。具体权限与信任条件保存在 `deploy/oss-policy.json`、`deploy/oidc-trust.json`。

发布先上传资源，再更新首页和 `_deployment.json` 版本标记。旧哈希资源会保留，避免已经打开的页面受影响。构建失败不会更新网站；上传失败会在 Actions 中显示失败原因，修复后可重新运行。若需要恢复历史版本，可在对应历史成功发布记录中重新运行任务。

手动发布步骤：

1. 执行 `npm ci` 和 `npm run build`。
2. 将 `dist/` **内部文件**上传到网站现有 OSS 空间，保持 `index.html` 在空间根目录。
3. 先上传新资源，最后更新 `index.html`；保留旧版带哈希的资源，避免已打开的页面加载失败。
4. 保持首页和错误文档均为 `index.html`，错误文档响应码为 `200`，以支持直接打开 `/character-review`。
5. 验证首页、进店与返回、作品详情、音乐及简历下载。

自动发布记录：[GitHub Actions](https://github.com/plussscapy/Portfolio-zcy/actions)。公开版本标记：`https://zhouchengyi.art/_deployment.json`。RAM 角色、身份提供商和权限策略的名称见工作流及 `deploy/` 配置；修改仓库名称或默认分支时，需同步更新信任条件。

## 仓库范围

本仓库从现有阿里云发布版本对应的 React/Vite 源码整理而来。网站运行资源与素材来源说明已保留；本地依赖、构建产物、Blender 工程及备份、部署截图、历史压缩包和凭据不纳入版本管理。

现有作品、简历和第三方素材的权利归各自权利人；本仓库未授予额外的开源使用许可。
