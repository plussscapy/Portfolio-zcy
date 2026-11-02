# 店员手套光标预览

Preview: http://127.0.0.1:5173/?cursor=glove

The normal URL retains the existing cursor. The preview is local and has not been published.

## Assets

- `glove-default.png`: default pointing gesture, 1254 × 1254 RGBA.
- `glove-hover.png`: open pinch, 1254 × 1254 RGBA.
- `glove-click.png`: closed pinch and blue feedback ticks, 1254 × 1254 RGBA.

Generated with the built-in ImageGen tool using the approved board. Current revision: `?cursor=glove&revision=native-hd`, visibly labeled `40px · 高清原生版`.

Only native CSS cursors are used. There is no following image, popover or extra visible cursor layer. Source images are downsampled at screen density (80px at DPR 2, 120px at DPR 3) with high-quality smoothing. CSS cursor `image-set(... 2x)` / `3x` retains a 40px logical size. A 1x native image is the compatibility fallback. Hotspots: default (7,6), hover (7,5), click (10,11). Pause restores ordinary browser cursors.

Earlier transparent-cursor overlay revisions and 40px-only raster revisions are superseded.

## Final prompt set

Default:

> Create ONE isolated mouse cursor PNG on a genuinely transparent background, using ONLY the LEFT DEFAULT pointing glove in the provided concept sheet. Faithfully match the rounded cream white glove, dark forest teal thick outline, blue cuff with small gold button, two dark stitched marks on back. Same right glove seen from back, extended index pointing diagonally UPPER LEFT, thumb on left and other fingers tucked, cuff lower right. Long straight index finger as in LEFT column, not the bent open pinch of middle column. Soft dimensional cartoon shading simplified for small cursor sizes, crisp clean silhouette. Center the whole glove on square canvas with about 10% padding, occupy 80% canvas. No label, no title, no other states, no tiny duplicate, no text, no background, no floor, no cast shadow. One glove only. Preserve reference identity.

Hover/click shared prompt template (substitute the column and pose below):

> Create ONE isolated production mouse cursor asset on a genuinely transparent background using the provided concept sheet as the visual identity reference. Reproduce only the {COLUMN} cashier glove from the reference. Cream white glove, thick dark forest-teal outline, sky blue cuff and small gold button, two dark stitched marks. Same right hand, back of glove facing camera, finger points upper left and cuff bottom right. Pose: {POSE}. Faithfully preserve illustration silhouette and identity, simplify painterly shading for readability at 40px, crisp edges, soft dimensional cartoon icon. Entire glove visible, large centered at about 80 percent of square canvas with a clean margin all around. No sheet, no panels, no text, no letters, no cursor arrows, no backdrop, no drop shadow. Output only one glove with transparent background.

- Hover COLUMN: `MIDDLE HOVER open pinch`. POSE: `index and thumb form a gently open pinch, ready to pick up a product`.
- Click COLUMN: `RIGHT CLICK closed pinch`. POSE: `index and thumb touch in a gentle closed pinch, two small sky blue feedback ticks near upper left fingertip`.
