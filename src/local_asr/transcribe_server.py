import os
import tempfile
from datetime import timedelta
from pathlib import Path
from typing import Any, Dict, List

import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response
from transformers import pipeline
import srt

# pip install fastapi uvicorn transformers torch srt
# nếu thiếu ffmpeg để đọc mp4:
# sudo apt-get install ffmpeg


app = FastAPI(title="Whisper Large V3 Turbo SRT Server")


device = "cuda:0" if torch.cuda.is_available() else "cpu"

pipe = pipeline(
    "automatic-speech-recognition",
    model="openai/whisper-large-v3-turbo",
    chunk_length_s=30,
    device=device,
)


def _build_segments(input_path: str) -> List[Dict[str, Any]]:
    result = pipe(input_path, return_timestamps=True, batch_size=8)
    segments = result.get("chunks")

    if segments is None:
        raise RuntimeError(
            "Không tìm thấy segments nào, có thể file quá ngắn hoặc không có tiếng.",
        )

    items: List[Dict[str, Any]] = []
    index = 1

    for seg in segments:
        timestamp = seg.get("timestamp")
        if timestamp is None:
            continue

        start_sec = timestamp[0]
        end_sec = timestamp[1]

        if start_sec is None:
            continue

        if end_sec is None:
            end_sec = start_sec + 2.0

        text = (seg.get("text") or "").strip()
        if not text:
            continue

        items.append(
            {
                "id": index,
                "start": float(start_sec),
                "end": float(end_sec),
                "text": text,
            },
        )
        index += 1

    if not items:
        raise RuntimeError("Không tạo được phụ đề nào từ file đầu vào.")

    return items


def _segments_to_srt(segments: List[Dict[str, Any]]) -> str:
    subs = []
    for seg in segments:
        start = timedelta(seconds=float(seg["start"]))
        end = timedelta(seconds=float(seg["end"]))
        subs.append(srt.Subtitle(int(seg["id"]), start, end, str(seg["text"])))
    return srt.compose(subs)


def _run_transcription(input_path: str) -> str:
    segments = _build_segments(input_path)
    return _segments_to_srt(segments)


def _segments_to_response(segments: List[Dict[str, Any]]) -> Dict[str, Any]:
    full_text = " ".join(str(seg["text"]).strip() for seg in segments).strip()
    return {
        "text": full_text,
        "segments": segments,
    }


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "device": device}


@app.post("/transcribe")
def transcribe(file: UploadFile = File(...)) -> Response:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Thiếu tên file upload.")

    suffix = Path(file.filename).suffix or ".mp4"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp_path = tmp.name

    try:
        content = file.file.read()

        if not content:
            raise HTTPException(status_code=400, detail="File upload rỗng.")

        tmp.write(content)
        tmp.close()

        try:
            srt_content = _run_transcription(tmp_path)
        except RuntimeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        base_name = Path(file.filename).stem or "transcript"
        headers = {
            "Content-Disposition": f'attachment; filename="{base_name}.srt"',
        }

        return Response(
            content=srt_content,
            media_type="application/x-subrip",
            headers=headers,
        )
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


@app.post("/transcribe-json")
def transcribe_json(file: UploadFile = File(...)) -> Dict[str, Any]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Thiếu tên file upload.")

    suffix = Path(file.filename).suffix or ".mp4"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp_path = tmp.name

    try:
        content = file.file.read()

        if not content:
            raise HTTPException(status_code=400, detail="File upload rỗng.")

        tmp.write(content)
        tmp.close()

        try:
            segments = _build_segments(tmp_path)
        except RuntimeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        return _segments_to_response(segments)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

