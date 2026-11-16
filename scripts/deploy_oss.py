"""Publish only the Vite build, then verify the public website."""

import argparse
import gzip
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import re
import time
from urllib.request import Request, urlopen

BUCKET = "monday-mart-zhouchengyi-art"
ENDPOINT = "https://oss-cn-hongkong.aliyuncs.com"
SITE = "https://zhouchengyi.art"
DIST = Path(__file__).resolve().parents[1] / "dist"


def compressible(key):
    return ((key.startswith("assets/") and Path(key).suffix in {".js", ".css"})
            or (key.startswith("models/common-v4/") and key.endswith(".glb")))


def encoded_object(path):
    key = path.relative_to(DIST).as_posix()
    headers = headers_for(key)
    if not compressible(key):
        return None, headers
    headers["Content-Encoding"] = "gzip"
    return gzip.compress(path.read_bytes(), compresslevel=6, mtime=0), headers


def build_files():
    files = sorted(p for p in DIST.rglob("*") if p.is_file())
    index = DIST / "index.html"
    if not index.is_file() or not list((DIST / "assets").glob("*.js")):
        raise RuntimeError("Run npm run build before deployment")
    for p in files:
        if p.is_symlink() or p.name.startswith(".") or p.suffix in {".tsx", ".ts", ".blend", ".blend1", ".map"}:
            raise RuntimeError(f"Unexpected development file in build: {p}")
    for ref in re.findall(r'(?:src|href)=["\'](/[^"\']+)["\']', index.read_text()):
        if not (DIST / ref.lstrip("/")).is_file():
            raise RuntimeError(f"Missing entry asset: {ref}")
    # Hosting configuration and asset documentation are not website resources.
    return [p for p in files if p.name != "_redirects" and p.suffix.lower() != ".md"]


def headers_for(key):
    content_type = {
        ".js": "text/javascript", ".css": "text/css", ".html": "text/html; charset=utf-8",
        ".glb": "model/gltf-binary", ".wasm": "application/wasm", ".cur": "image/x-icon",
    }.get(Path(key).suffix, mimetypes.guess_type(key)[0] or "application/octet-stream")
    cache = "public, max-age=31536000, immutable" if key.startswith("assets/") else "public, max-age=300"
    if key in {"index.html", "_deployment.json"}:
        cache = "no-cache, max-age=0, must-revalidate"
    return {"Content-Type": content_type, "Cache-Control": cache}


def read_public(key, commit, gzip_required=False):
    headers = {"Cache-Control": "no-cache"}
    if gzip_required:
        headers["Accept-Encoding"] = "gzip"
    req = Request(f"{SITE}/{key}?deployment={commit}", headers=headers)
    with urlopen(req, timeout=30) as response:
        content = response.read()
        if response.headers.get("Content-Encoding") == "gzip":
            return gzip.decompress(content)
        if gzip_required:
            raise RuntimeError(f"Public asset {key} was not transferred with gzip")
        return content


def verify_transfer(commit, index):
    entry_assets = re.findall(r'["\']/(assets/[^"\']+\.(?:js|css))["\']', index.read_text())
    for key in [*entry_assets, "models/common-v4/facade.glb"]:
        if read_public(key, commit, gzip_required=True) != (DIST / key).read_bytes():
            raise RuntimeError(f"Public asset {key} does not match the build")


def verify_site(commit, expected_index):
    # Retries also accommodate a short delay from a domain cache.
    for attempt in range(6):
        try:
            if read_public("", commit) != expected_index:
                raise RuntimeError("Public homepage does not match this build")
            if json.loads(read_public("_deployment.json", commit))["commit"] != commit:
                raise RuntimeError("Public deployment version does not match")
            print(f"Verified {SITE}/ at {commit}")
            return
        except Exception:
            if attempt == 5:
                raise
            time.sleep(5)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    files = build_files()
    if args.dry_run:
        print(f"Build validated: {len(files)} website files, {sum(p.stat().st_size for p in files):,} bytes")
        encoded = [(p.stat().st_size, len(encoded_object(p)[0]))
                   for p in files if compressible(p.relative_to(DIST).as_posix())]
        print(f"Transfer gzip: {sum(raw for raw, _ in encoded):,} → {sum(gz for _, gz in encoded):,} bytes")
        return
    import oss2
    commit = os.environ["GITHUB_SHA"]
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise RuntimeError("Invalid GitHub commit")
    auth = oss2.StsAuth(os.environ["ALIBABA_CLOUD_ACCESS_KEY_ID"],
                        os.environ["ALIBABA_CLOUD_ACCESS_KEY_SECRET"],
                        os.environ["ALIBABA_CLOUD_SECURITY_TOKEN"])
    bucket = oss2.Bucket(auth, ENDPOINT, BUCKET, connect_timeout=60)
    index = DIST / "index.html"
    for p in files:
        if p == index:
            continue
        key = p.relative_to(DIST).as_posix()
        content, headers = encoded_object(p)
        if content is None:
            bucket.put_object_from_file(key, str(p), headers=headers)
        else:
            bucket.put_object(key, content, headers=headers)
        print(f"Uploaded {key}")
    verify_transfer(commit, index)
    # Keep old hashed assets available for visitors with an older page open.
    bucket.put_object_from_file("index.html", str(index), headers=headers_for("index.html"))
    marker = {"commit": commit, "index_sha256": hashlib.sha256(index.read_bytes()).hexdigest()}
    bucket.put_object("_deployment.json", json.dumps(marker).encode(), headers=headers_for("_deployment.json"))
    verify_site(commit, index.read_bytes())
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a") as f:
            f.write(f"Published and verified [{SITE}]({SITE})\n\nCommit: `{commit}`\n")


if __name__ == "__main__":
    main()
