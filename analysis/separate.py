"""Stem separation with Demucs (htdemucs) -> analysis/stems/{vocals,drums,bass,other}.wav

    uv run python separate.py
"""
import os
import pathlib
import sys

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import librosa
import numpy as np
import soundfile as sf
import torch
from demucs.apply import apply_model
from demucs.pretrained import get_model

ROOT = pathlib.Path(__file__).resolve().parent.parent
AUDIO = ROOT / "audio" / "Tahimik.mp3"
OUT = ROOT / "analysis" / "stems"


def run(model, x, device):
    with torch.no_grad():
        return apply_model(model, x[None], device=device, shifts=1, split=True,
                           overlap=0.25, progress=True)[0]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    model = get_model("htdemucs")
    model.eval()
    wav, _ = librosa.load(AUDIO, sr=model.samplerate, mono=False)
    if wav.ndim == 1:
        wav = np.stack([wav, wav])
    x = torch.from_numpy(wav).float()
    ref = x.mean(0)
    mean, std = ref.mean(), ref.std()
    x = (x - mean) / std

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    try:
        sources = run(model, x, device)
    except Exception as e:  # some ops are flaky on MPS; CPU always works
        print(f"[separate] {device} failed ({e}); retrying on cpu", file=sys.stderr)
        sources = run(model, x, "cpu")
    sources = sources * std + mean

    for name, src in zip(model.sources, sources):
        path = OUT / f"{name}.wav"
        sf.write(path, src.cpu().numpy().T, model.samplerate, subtype="PCM_16")
        print("wrote", path.relative_to(ROOT))


if __name__ == "__main__":
    main()
