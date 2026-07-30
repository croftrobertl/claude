#!/usr/bin/env python3
"""Convert one original iPhone photo/video into the site's self-hosted web
derivatives, matching the format the existing 2,031 items already use.

  photo  ->  <out>/<key>-full.jpg   (long edge <= 2048, quality 88)
             <out>/<key>-thumb.jpg  (short edge = 256, quality 80)
  video  ->  <out>/<key>-hd.mp4     (H.264, fit within 1280, +faststart, AAC)
             <out>/<key>-poster.jpg (first frame, same dims)

HEIC is read via pillow-heif; MOV/MP4 via ffmpeg. EXIF orientation is baked in
for photos; ffmpeg autorotates video by its display matrix (default).

Usage: python3 ingest_convert.py <original> <key> <photo|video> <out_dir>
"""
import sys, os, subprocess
from PIL import Image, ImageOps
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except Exception:
    pass

FULL_MAX = 2048   # long edge cap for -full.jpg
THUMB_MIN = 256   # short edge for -thumb.jpg
VID_MAX = 1280    # long edge cap for -hd.mp4

def convert_photo(src, key, out):
    im = Image.open(src)
    im = ImageOps.exif_transpose(im)          # bake rotation
    if im.mode not in ("RGB", "L"):
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1] if im.mode in ("RGBA", "LA", "P") else None)
        im = bg
    elif im.mode == "L":
        im = im.convert("RGB")
    w, h = im.size
    # full: cap long edge at 2048, never upscale
    scale = min(1.0, FULL_MAX / max(w, h))
    full = im if scale == 1.0 else im.resize((round(w*scale), round(h*scale)), Image.LANCZOS)
    fp = os.path.join(out, f"{key}-full.jpg")
    full.save(fp, "JPEG", quality=88, optimize=True, progressive=True)
    # thumb: short edge = 256 (from the full-size, never upscale)
    fw, fh = full.size
    ts = min(1.0, THUMB_MIN / min(fw, fh))
    thumb = full if ts == 1.0 else full.resize((max(1, round(fw*ts)), max(1, round(fh*ts))), Image.LANCZOS)
    tp = os.path.join(out, f"{key}-thumb.jpg")
    thumb.save(tp, "JPEG", quality=80, optimize=True)
    return fp, tp

MAX_MP4 = 95 * 1024 * 1024   # stay under GitHub's 100 MB per-file hard limit

def convert_video(src, key, out):
    hp = os.path.join(out, f"{key}-hd.mp4")
    pp = os.path.join(out, f"{key}-poster.jpg")
    vf = (f"scale=w='min({VID_MAX},iw)':h='min({VID_MAX},ih)'"
          f":force_original_aspect_ratio=decrease:force_divisible_by=2")
    # encode; if the result would exceed GitHub's file limit, raise CRF (and, as a
    # last resort, shrink the long edge) until it fits — long videos otherwise blow
    # past 100 MB and get the whole push rejected.
    for crf, cap in ((26, VID_MAX), (28, VID_MAX), (30, 960), (32, 720)):
        vfc = (f"scale=w='min({cap},iw)':h='min({cap},ih)'"
               f":force_original_aspect_ratio=decrease:force_divisible_by=2")
        subprocess.run([
            "ffmpeg", "-y", "-loglevel", "error", "-i", src,
            "-vf", vfc, "-c:v", "libx264", "-preset", "veryfast", "-crf", str(crf),
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart", hp,
        ], check=True)
        if os.path.getsize(hp) <= MAX_MP4:
            break
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", hp,
        "-frames:v", "1", "-q:v", "3", pp,
    ], check=True)
    return hp, pp

if __name__ == "__main__":
    src, key, kind, out = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
    os.makedirs(out, exist_ok=True)
    a, b = (convert_photo if kind == "photo" else convert_video)(src, key, out)
    print("wrote", os.path.basename(a), os.path.basename(b))
