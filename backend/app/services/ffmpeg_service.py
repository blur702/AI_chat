"""FFmpeg service for media probing, thumbnail extraction, and video rendering."""

import asyncio
import base64
import json
import logging
import os
import shutil
import tempfile
from html import escape as html_escape
from typing import Any, Dict, List, Optional
from uuid import UUID

logger = logging.getLogger(__name__)

STUDIO_MEDIA_DIR = os.getenv("STUDIO_MEDIA_DIR", "/data/studio_media")


def _ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


async def _run_command(cmd: List[str], timeout: int = 60) -> tuple[int, str, str]:
    """Run a subprocess command asynchronously."""
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.communicate()
        raise TimeoutError(f"Command timed out after {timeout}s: {' '.join(cmd)}")
    return proc.returncode, stdout.decode(errors="replace"), stderr.decode(errors="replace")


async def probe_media(file_path: str) -> Dict[str, Any]:
    """Extract metadata from a media file using ffprobe.

    Returns a dict with keys: duration, width, height, codec, bitrate, etc.
    """
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        file_path,
    ]
    returncode, stdout, stderr = await _run_command(cmd)
    if returncode != 0:
        logger.warning("ffprobe failed for %s: %s", file_path, stderr)
        return {}

    try:
        data = json.loads(stdout)
    except json.JSONDecodeError:
        logger.warning("ffprobe returned invalid JSON for %s", file_path)
        return {}

    result: Dict[str, Any] = {}
    fmt = data.get("format", {})
    result["duration"] = float(fmt.get("duration", 0))
    result["bitrate"] = int(fmt.get("bit_rate", 0)) if fmt.get("bit_rate") else None
    result["format_name"] = fmt.get("format_name")

    for stream in data.get("streams", []):
        codec_type = stream.get("codec_type")
        if codec_type == "video" and "width" not in result:
            result["width"] = stream.get("width")
            result["height"] = stream.get("height")
            result["video_codec"] = stream.get("codec_name")
            result["fps"] = _parse_fps(stream.get("r_frame_rate", "0/1"))
        elif codec_type == "audio" and "audio_codec" not in result:
            result["audio_codec"] = stream.get("codec_name")
            result["sample_rate"] = int(stream.get("sample_rate", 0)) if stream.get("sample_rate") else None
            result["channels"] = stream.get("channels")

    return result


def _parse_fps(r_frame_rate: str) -> Optional[float]:
    """Parse ffprobe r_frame_rate like '30/1' or '24000/1001'."""
    try:
        num, den = r_frame_rate.split("/")
        return round(int(num) / int(den), 3) if int(den) != 0 else None
    except (ValueError, ZeroDivisionError):
        return None


async def extract_thumbnail(
    file_path: str,
    output_path: str,
    timestamp: float = 1.0,
    width: int = 320,
) -> bool:
    """Extract a thumbnail frame from a video file."""
    _ensure_dir(os.path.dirname(output_path))
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(timestamp),
        "-i", file_path,
        "-vframes", "1",
        "-vf", f"scale={width}:-1",
        output_path,
    ]
    returncode, _, stderr = await _run_command(cmd, timeout=30)
    if returncode != 0:
        logger.warning("Thumbnail extraction failed: %s", stderr)
        return False
    return os.path.isfile(output_path)


def get_media_type(mime_type: str) -> str:
    """Determine media_type from MIME type string."""
    if mime_type.startswith("video/"):
        return "video"
    elif mime_type.startswith("audio/"):
        return "audio"
    elif mime_type.startswith("image/"):
        return "image"
    return "video"  # fallback


def get_project_media_dir(project_id: str, asset_id: str) -> str:
    """Get the storage directory for a media asset."""
    path = os.path.join(STUDIO_MEDIA_DIR, project_id, asset_id)
    _ensure_dir(path)
    return path


def get_export_dir(project_id: str, export_id: str) -> str:
    """Get the storage directory for an export output."""
    path = os.path.join(STUDIO_MEDIA_DIR, project_id, "exports", export_id)
    _ensure_dir(path)
    return path


async def render_timeline(
    timeline_data: Dict[str, Any],
    project_id: str,
    export_id: str,
    settings: Dict[str, Any],
    progress_callback=None,
) -> str:
    """Render a timeline to an MP4 file using FFmpeg.

    Returns the path to the rendered file.
    """
    width = settings.get("width", 1920)
    height = settings.get("height", 1080)
    fps = settings.get("fps", 30)
    bg_color = settings.get("background_color", "#000000").lstrip("#")

    export_dir = get_export_dir(project_id, export_id)
    output_path = os.path.join(export_dir, "output.mp4")

    tracks = timeline_data.get("tracks", [])

    # Compute total duration from clips
    total_duration = 0.0
    for track in tracks:
        for clip in track.get("clips", []):
            clip_end = clip.get("start_time", 0) + clip.get("duration", 0)
            total_duration = max(total_duration, clip_end)

    if total_duration <= 0:
        total_duration = 5.0  # minimum 5s for empty timelines

    # Build FFmpeg filter complex
    inputs: List[str] = []
    filter_parts: List[str] = []
    overlay_chain = ""
    input_idx = 0

    # Start with background color
    inputs.extend([
        "-f", "lavfi",
        "-i", f"color=c=0x{bg_color}:s={width}x{height}:d={total_duration}:r={fps}",
    ])
    current_video = f"[{input_idx}:v]"
    input_idx += 1

    # Silence for base audio
    inputs.extend([
        "-f", "lavfi",
        "-i", f"anullsrc=r=44100:cl=stereo:d={total_duration}",
    ])
    audio_streams: List[str] = []
    base_audio_idx = input_idx
    input_idx += 1

    # Process tracks in order
    for track in sorted(tracks, key=lambda t: t.get("order", 0)):
        track_type = track.get("type", "video")
        if track.get("muted") or not track.get("visible", True):
            continue

        for clip in track.get("clips", []):
            clip_type = clip.get("type", track_type)
            start_time = clip.get("start_time", 0)
            duration = clip.get("duration", 0)
            props = clip.get("properties", {})

            if clip_type == "video" and clip.get("media_asset_id"):
                # Find media file path
                asset_dir = os.path.join(
                    STUDIO_MEDIA_DIR, project_id, clip["media_asset_id"]
                )
                media_files = []
                if os.path.isdir(asset_dir):
                    media_files = [
                        f for f in os.listdir(asset_dir)
                        if not f.endswith(".thumb.jpg")
                    ]
                if not media_files:
                    continue

                media_path = os.path.join(asset_dir, media_files[0])
                trim_start = clip.get("trim_start", 0)

                inputs.extend(["-ss", str(trim_start), "-t", str(duration), "-i", media_path])

                scale = props.get("scale", {})
                sx = scale.get("x", 1.0)
                sy = scale.get("y", 1.0)
                scaled_w = int(width * sx)
                scaled_h = int(height * sy)

                pos = props.get("position", {})
                ox = int(pos.get("x", 0) * width)
                oy = int(pos.get("y", 0) * height)

                opacity = props.get("opacity", 1.0)

                vid_label = f"v{input_idx}"
                filter_parts.append(
                    f"[{input_idx}:v]scale={scaled_w}:{scaled_h},format=rgba,"
                    f"colorchannelmixer=aa={opacity}[{vid_label}]"
                )

                out_label = f"ov{input_idx}"
                filter_parts.append(
                    f"{current_video}[{vid_label}]overlay={ox}:{oy}:"
                    f"enable='between(t,{start_time},{start_time + duration})'[{out_label}]"
                )
                current_video = f"[{out_label}]"

                # Add audio from video if not muted
                volume = props.get("volume", 1.0)
                if volume > 0:
                    a_label = f"a{input_idx}"
                    filter_parts.append(
                        f"[{input_idx}:a]volume={volume},adelay={int(start_time * 1000)}|{int(start_time * 1000)}[{a_label}]"
                    )
                    audio_streams.append(f"[{a_label}]")

                input_idx += 1

            elif clip_type == "audio" and clip.get("media_asset_id"):
                asset_dir = os.path.join(
                    STUDIO_MEDIA_DIR, project_id, clip["media_asset_id"]
                )
                media_files = []
                if os.path.isdir(asset_dir):
                    media_files = [
                        f for f in os.listdir(asset_dir)
                        if not f.endswith(".thumb.jpg")
                    ]
                if not media_files:
                    continue

                media_path = os.path.join(asset_dir, media_files[0])
                trim_start = clip.get("trim_start", 0)

                inputs.extend(["-ss", str(trim_start), "-t", str(duration), "-i", media_path])

                volume = props.get("volume", 1.0)
                a_label = f"a{input_idx}"
                filter_parts.append(
                    f"[{input_idx}:a]volume={volume},adelay={int(start_time * 1000)}|{int(start_time * 1000)}[{a_label}]"
                )
                audio_streams.append(f"[{a_label}]")
                input_idx += 1

            elif clip_type == "text":
                text = props.get("text", "")
                if not text:
                    continue
                font_size = props.get("font_size", 48)
                color = props.get("color", "#FFFFFF").lstrip("#")
                pos = props.get("position", {})
                # Position as fraction → pixel
                tx = pos.get("x", 0.5)
                ty = pos.get("y", 0.5)

                # Escape text for drawtext filter
                escaped_text = text.replace("\\", "\\\\").replace("'", "\\'").replace(":", "\\:")

                out_label = f"txt{input_idx}"
                filter_parts.append(
                    f"{current_video}drawtext=text='{escaped_text}':"
                    f"fontsize={font_size}:fontcolor=0x{color}:"
                    f"x=(w*{tx})-(tw/2):y=(h*{ty})-(th/2):"
                    f"enable='between(t,{start_time},{start_time + duration})'[{out_label}]"
                )
                current_video = f"[{out_label}]"
                input_idx += 1

            elif clip_type == "subtitle":
                text = props.get("subtitle_text", "")
                if not text:
                    continue
                font_size = props.get("font_size", 24)
                color = props.get("color", "#FFFFFF").lstrip("#")
                bg_opacity = props.get("background_opacity", 0.5)
                style = props.get("subtitle_style", "bottom-center")

                # Position
                if style == "bottom-center":
                    x_expr = "(w-tw)/2"
                    y_expr = f"h-h*0.08-th"
                elif style == "top-center":
                    x_expr = "(w-tw)/2"
                    y_expr = f"h*0.08"
                else:
                    pos = props.get("position", {})
                    tx = pos.get("x", 0.5)
                    ty = pos.get("y", 0.9)
                    x_expr = f"(w*{tx})-(tw/2)"
                    y_expr = f"(h*{ty})-(th/2)"

                escaped_text = text.replace("\\", "\\\\").replace("'", "\\'").replace(":", "\\:")

                # Box background (black with configurable opacity)
                box_opacity = min(1.0, max(0.0, bg_opacity))

                out_label = f"sub{input_idx}"
                filter_parts.append(
                    f"{current_video}drawtext=text='{escaped_text}':"
                    f"fontsize={font_size}:fontcolor=0x{color}:"
                    f"x={x_expr}:y={y_expr}:"
                    f"box=1:boxcolor=black@{box_opacity}:boxborderw=6:"
                    f"enable='between(t,{start_time},{start_time + duration})'[{out_label}]"
                )
                current_video = f"[{out_label}]"
                input_idx += 1

            elif clip_type == "image" and clip.get("media_asset_id"):
                asset_dir = os.path.join(
                    STUDIO_MEDIA_DIR, project_id, clip["media_asset_id"]
                )
                media_files = []
                if os.path.isdir(asset_dir):
                    media_files = [
                        f for f in os.listdir(asset_dir)
                        if not f.endswith(".thumb.jpg")
                    ]
                if not media_files:
                    continue

                media_path = os.path.join(asset_dir, media_files[0])
                inputs.extend(["-i", media_path])

                pos = props.get("position", {})
                ox = int(pos.get("x", 0) * width)
                oy = int(pos.get("y", 0) * height)
                opacity = props.get("opacity", 1.0)

                img_label = f"img{input_idx}"
                filter_parts.append(
                    f"[{input_idx}:v]format=rgba,colorchannelmixer=aa={opacity}[{img_label}]"
                )
                out_label = f"oi{input_idx}"
                filter_parts.append(
                    f"{current_video}[{img_label}]overlay={ox}:{oy}:"
                    f"enable='between(t,{start_time},{start_time + duration})'[{out_label}]"
                )
                current_video = f"[{out_label}]"
                input_idx += 1

    # Final video output
    final_video = current_video

    # Mix audio streams
    if audio_streams:
        all_audio = f"[{base_audio_idx}:a]" + "".join(audio_streams)
        filter_parts.append(
            f"{all_audio}amix=inputs={len(audio_streams) + 1}:duration=longest[aout]"
        )
        final_audio = "[aout]"
    else:
        final_audio = f"[{base_audio_idx}:a]"

    filter_complex = ";".join(filter_parts) if filter_parts else None

    cmd = ["ffmpeg", "-y"]
    cmd.extend(inputs)

    if filter_complex:
        cmd.extend(["-filter_complex", filter_complex])
        # Map the final labeled streams
        # Strip brackets for -map
        cmd.extend(["-map", final_video.strip("[]") if final_video.startswith("[") else final_video])
        cmd.extend(["-map", final_audio.strip("[]") if final_audio.startswith("[") else final_audio])
    else:
        cmd.extend(["-map", "0:v", "-map", "1:a"])

    cmd.extend([
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "23",
        "-c:a", "aac",
        "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-t", str(total_duration),
        output_path,
    ])

    logger.info("Running FFmpeg export: %s", " ".join(cmd))

    if progress_callback:
        await progress_callback(10)

    returncode, stdout, stderr = await _run_command(cmd, timeout=600)

    if progress_callback:
        await progress_callback(90)

    if returncode != 0:
        logger.error("FFmpeg export failed: %s", stderr)
        raise RuntimeError(f"FFmpeg export failed: {stderr[-500:]}")

    if not os.path.isfile(output_path):
        raise RuntimeError("FFmpeg produced no output file")

    file_size = os.path.getsize(output_path)
    logger.info("Export complete: %s (%d bytes)", output_path, file_size)

    if progress_callback:
        await progress_callback(100)

    return output_path


async def generate_interactive_html(
    timeline_data: Dict[str, Any],
    project_id: str,
    export_id: str,
    settings: Dict[str, Any],
    progress_callback=None,
) -> str:
    """Generate an interactive HTML page with timed overlays and clickable links.

    First renders the video track to MP4 via FFmpeg, then wraps it in a
    self-contained HTML page with JavaScript-driven timed overlays for text,
    subtitle, and link elements.

    Returns the path to the generated HTML file.
    """
    export_dir = get_export_dir(project_id, export_id)
    html_path = os.path.join(export_dir, "interactive.html")

    width = settings.get("width", 1920)
    height = settings.get("height", 1080)

    tracks = timeline_data.get("tracks", [])

    # Compute total duration
    total_duration = 0.0
    for track in tracks:
        for clip in track.get("clips", []):
            clip_end = clip.get("start_time", 0) + clip.get("duration", 0)
            total_duration = max(total_duration, clip_end)
    if total_duration <= 0:
        total_duration = 5.0

    if progress_callback:
        await progress_callback(5)

    # First, render video/audio/image tracks to an MP4 (no text/subtitle — those become HTML overlays)
    video_path = os.path.join(export_dir, "video.mp4")
    has_media = any(
        clip.get("type", track.get("type")) in ("video", "audio", "image")
        for track in tracks
        for clip in track.get("clips", [])
    )

    if has_media:
        # Build a stripped timeline with only media tracks for FFmpeg
        media_timeline = {
            **timeline_data,
            "tracks": [
                {
                    **track,
                    "clips": [
                        c for c in track.get("clips", [])
                        if c.get("type", track.get("type")) in ("video", "audio", "image")
                    ],
                }
                for track in tracks
                if track.get("type") in ("video", "audio", "image")
            ],
        }
        await render_timeline(
            timeline_data=media_timeline,
            project_id=project_id,
            export_id=export_id,
            settings=settings,
            progress_callback=None,
        )
        # render_timeline outputs to output.mp4 — rename to video.mp4
        rendered_mp4 = os.path.join(export_dir, "output.mp4")
        if os.path.isfile(rendered_mp4):
            os.rename(rendered_mp4, video_path)

    if progress_callback:
        await progress_callback(60)

    # Collect overlay clips (text, subtitle, and any clip with a url property)
    overlays: List[Dict[str, Any]] = []
    for track in sorted(tracks, key=lambda t: t.get("order", 0)):
        if not track.get("visible", True):
            continue
        for clip in track.get("clips", []):
            clip_type = clip.get("type", track.get("type"))
            props = clip.get("properties", {})
            start = clip.get("start_time", 0)
            dur = clip.get("duration", 0)

            overlay: Dict[str, Any] = {
                "type": clip_type,
                "start": start,
                "end": start + dur,
                "props": props,
            }

            if clip_type in ("text", "subtitle") or props.get("url"):
                overlays.append(overlay)

    # Encode video as base64 data URI for self-contained HTML
    video_b64 = ""
    if os.path.isfile(video_path):
        with open(video_path, "rb") as f:
            video_b64 = base64.b64encode(f.read()).decode("ascii")

    if progress_callback:
        await progress_callback(80)

    # Generate HTML
    overlays_json = json.dumps(overlays)

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Interactive Video</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ background: #000; display: flex; justify-content: center; align-items: center; min-height: 100vh; font-family: Inter, system-ui, sans-serif; }}
  .player {{ position: relative; width: 100%; max-width: {width}px; aspect-ratio: {width}/{height}; background: #000; overflow: hidden; }}
  video {{ width: 100%; height: 100%; object-fit: contain; }}
  .overlay {{ position: absolute; pointer-events: none; opacity: 0; transition: opacity 0.15s; }}
  .overlay.active {{ opacity: 1; }}
  .overlay a {{ pointer-events: auto; color: inherit; text-decoration: underline; cursor: pointer; }}
  .overlay.clickable {{ pointer-events: auto; cursor: pointer; }}
  .subtitle-bar {{ display: inline-block; padding: 4px 16px; border-radius: 4px; }}
  .controls {{ position: absolute; bottom: 0; left: 0; right: 0; padding: 8px 12px; background: linear-gradient(transparent, rgba(0,0,0,0.7)); display: flex; align-items: center; gap: 8px; }}
  .controls button {{ background: none; border: none; color: #fff; cursor: pointer; font-size: 18px; }}
  .controls input[type=range] {{ flex: 1; accent-color: #3b82f6; }}
  .controls .time {{ color: #fff; font-size: 12px; white-space: nowrap; }}
</style>
</head>
<body>
<div class="player" id="player">
  {"<video id='vid' preload='auto' src='data:video/mp4;base64," + video_b64 + "'></video>" if video_b64 else "<div style='width:100%;height:100%;background:#111'></div>"}
  <div id="overlays"></div>
  <div class="controls">
    <button id="playBtn">&#9654;</button>
    <input type="range" id="scrubber" min="0" max="{total_duration}" step="0.1" value="0">
    <span class="time" id="timeDisplay">0:00 / {int(total_duration // 60)}:{int(total_duration % 60):02d}</span>
  </div>
</div>
<script>
(function() {{
  const overlays = {overlays_json};
  const vid = document.getElementById('vid');
  const container = document.getElementById('overlays');
  const playBtn = document.getElementById('playBtn');
  const scrubber = document.getElementById('scrubber');
  const timeDisplay = document.getElementById('timeDisplay');
  const totalDur = {total_duration};

  // Create overlay elements
  const els = overlays.map(ov => {{
    const div = document.createElement('div');
    div.className = 'overlay';
    const p = ov.props;

    if (ov.type === 'text') {{
      div.style.left = ((p.position?.x ?? 0.5) * 100) + '%';
      div.style.top = ((p.position?.y ?? 0.5) * 100) + '%';
      div.style.transform = 'translate(-50%, -50%)';
      div.style.fontFamily = p.font_family || 'Inter, sans-serif';
      div.style.fontSize = (p.font_size || 48) + 'px';
      div.style.color = p.color || '#FFFFFF';
      div.style.textShadow = '0 2px 4px rgba(0,0,0,0.5)';
      div.style.textAlign = 'center';
      div.style.whiteSpace = 'pre-wrap';

      if (p.url) {{
        div.classList.add('clickable');
        const a = document.createElement('a');
        a.href = p.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = p.link_label || p.text || 'Link';
        div.appendChild(a);
      }} else {{
        div.textContent = p.text || '';
      }}
    }} else if (ov.type === 'subtitle') {{
      const style = p.subtitle_style || 'bottom-center';
      div.style.width = '100%';
      div.style.display = 'flex';
      div.style.justifyContent = 'center';
      if (style === 'bottom-center') {{
        div.style.bottom = '8%';
        div.style.left = '0';
      }} else if (style === 'top-center') {{
        div.style.top = '8%';
        div.style.left = '0';
      }} else {{
        div.style.left = ((p.position?.x ?? 0.5) * 100) + '%';
        div.style.top = ((p.position?.y ?? 0.9) * 100) + '%';
        div.style.transform = 'translate(-50%, -50%)';
        div.style.width = 'auto';
      }}

      const span = document.createElement('span');
      span.className = 'subtitle-bar';
      span.textContent = p.subtitle_text || '';
      span.style.fontFamily = p.font_family || 'Inter, sans-serif';
      span.style.fontSize = (p.font_size || 24) + 'px';
      span.style.color = p.color || '#FFFFFF';
      const bgOp = p.background_opacity ?? 0.5;
      span.style.backgroundColor = 'rgba(0,0,0,' + bgOp + ')';
      div.appendChild(span);
    }} else {{
      // Any visual clip with a URL — render as clickable hotspot
      if (p.url) {{
        div.classList.add('clickable');
        div.style.left = ((p.position?.x ?? 0) * 100) + '%';
        div.style.top = ((p.position?.y ?? 0) * 100) + '%';
        div.style.padding = '8px 16px';
        div.style.background = 'rgba(59,130,246,0.3)';
        div.style.borderRadius = '6px';
        div.style.border = '1px solid rgba(59,130,246,0.5)';
        const a = document.createElement('a');
        a.href = p.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = p.link_label || 'Click here';
        a.style.color = '#fff';
        a.style.fontSize = '16px';
        div.appendChild(a);
      }}
    }}

    container.appendChild(div);
    return {{ el: div, start: ov.start, end: ov.end }};
  }});

  function updateOverlays(t) {{
    els.forEach(o => {{
      o.el.classList.toggle('active', t >= o.start && t < o.end);
    }});
  }}

  function formatTime(s) {{
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m + ':' + String(sec).padStart(2, '0');
  }}

  if (vid) {{
    vid.addEventListener('timeupdate', () => {{
      const t = vid.currentTime;
      updateOverlays(t);
      scrubber.value = t;
      timeDisplay.textContent = formatTime(t) + ' / ' + formatTime(totalDur);
    }});

    playBtn.addEventListener('click', () => {{
      if (vid.paused) {{ vid.play(); playBtn.textContent = '\\u23F8'; }}
      else {{ vid.pause(); playBtn.textContent = '\\u25B6'; }}
    }});

    scrubber.addEventListener('input', () => {{
      vid.currentTime = parseFloat(scrubber.value);
      updateOverlays(vid.currentTime);
    }});

    vid.addEventListener('ended', () => {{ playBtn.textContent = '\\u25B6'; }});
  }}
}})();
</script>
</body>
</html>"""

    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html_content)

    if progress_callback:
        await progress_callback(100)

    # Clean up intermediate video file
    if os.path.isfile(video_path):
        os.remove(video_path)

    logger.info("Interactive HTML export complete: %s", html_path)
    return html_path


async def transcribe_audio(file_path: str) -> List[Dict[str, Any]]:
    """Transcribe audio from a media file using Whisper.

    Extracts audio to a temporary WAV file, then runs whisper CLI to produce
    timestamped subtitle segments.

    Returns a list of dicts with keys: start_time, end_time, text.
    """
    # Extract audio to temp WAV for Whisper
    with tempfile.TemporaryDirectory() as tmpdir:
        wav_path = os.path.join(tmpdir, "audio.wav")
        cmd = [
            "ffmpeg", "-y",
            "-i", file_path,
            "-vn",  # no video
            "-acodec", "pcm_s16le",
            "-ar", "16000",  # 16kHz mono for Whisper
            "-ac", "1",
            wav_path,
        ]
        returncode, _, stderr = await _run_command(cmd, timeout=120)
        if returncode != 0:
            raise RuntimeError(f"Audio extraction failed: {stderr[-300:]}")

        # Run Whisper CLI
        output_json = os.path.join(tmpdir, "audio.json")
        whisper_cmd = [
            "whisper",
            wav_path,
            "--model", os.getenv("WHISPER_MODEL", "base"),
            "--output_format", "json",
            "--output_dir", tmpdir,
            "--language", os.getenv("WHISPER_LANGUAGE", "en"),
        ]

        returncode, stdout, stderr = await _run_command(whisper_cmd, timeout=600)
        if returncode != 0:
            raise RuntimeError(f"Whisper transcription failed: {stderr[-300:]}")

        # Parse Whisper JSON output
        if not os.path.isfile(output_json):
            raise RuntimeError("Whisper produced no output file")

        with open(output_json, "r", encoding="utf-8") as f:
            whisper_data = json.load(f)

        segments: List[Dict[str, Any]] = []
        for seg in whisper_data.get("segments", []):
            segments.append({
                "start_time": round(seg.get("start", 0), 3),
                "end_time": round(seg.get("end", 0), 3),
                "text": seg.get("text", "").strip(),
            })

        logger.info("Transcribed %d segments from %s", len(segments), file_path)
        return segments
