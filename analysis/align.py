"""Word + character level lyric timings -> data/lyrics.json

The LRC only gives line starts (Subtitle Edit, roughly +-0.3 s). Each line window is
force-aligned against the Demucs vocal stem with torchaudio's MMS_FA (multilingual
wav2vec2 CTC; Tagalog is plain Latin script, so no romanisation step is needed).
CTC gives character *onsets*; word ends are extended through held notes using the
vocal envelope, so karaoke wipes last as long as the singer holds the word.

    uv run python align.py              # MMS forced alignment (downloads ~1.2 GB once)
    uv run python align.py --heuristic  # syllable-weighted fallback, no model
"""
import argparse
import json
import pathlib
import re
import unicodedata

import librosa
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
LRC = ROOT / "lyrics" / "Tahimik.lrc"
VOCALS = ROOT / "analysis" / "stems" / "vocals.wav"
OUT = ROOT / "data" / "lyrics.json"

SR = 16000
PAD_BEFORE = 0.45  # LRC stamps can be a little late
PAD_AFTER = 0.35
ENV_HZ = 100


def parse_lrc(path):
    stamps = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\[(\d+):(\d+(?:\.\d+)?)\](.*)$", raw.strip())
        if m:
            stamps.append((int(m[1]) * 60 + float(m[2]), m[3].strip()))
    lines = []
    for i, (t, text) in enumerate(stamps):
        if not text:
            continue
        end = stamps[i + 1][0] if i + 1 < len(stamps) else t + 4.0
        echo = text.startswith("(") and text.endswith(")")
        text = text.strip("()") if echo else text
        # every apostrophe in these lyrics is an elision (’di, ’yung, nama’y): U+2019
        text = re.sub(r"[‘'`]", "’", text)
        lines.append({"text": text, "lrc": [round(t, 3), round(end, 3)], "echo": echo})
    return lines


def akey(word):
    s = unicodedata.normalize("NFKD", word.lower())
    return "".join(c for c in s if "a" <= c <= "z")


def is_letter(ch):
    return bool(akey(ch))


def vocal_envelope(y):
    hop = SR // ENV_HZ
    rms = librosa.feature.rms(y=y, frame_length=hop * 4, hop_length=hop, center=True)[0]
    db = 20 * np.log10(rms + 1e-9)
    hi = np.percentile(db, 99)
    return np.clip((db - (hi - 40)) / 40, 0, 1)


def extend_holds(words, env, limit_end):
    """push each word's end through its held vowel, stopping before the next word"""
    for k, w in enumerate(words):
        nxt = words[k + 1]["start"] if k + 1 < len(words) else limit_end
        i0 = int(w["start"] * ENV_HZ)
        i1 = max(i0 + 1, int(w["end"] * ENV_HZ))
        peak = env[i0:i1 + 1].max() if i1 > i0 else env[i0]
        i = i1
        stop = int((nxt - 0.03) * ENV_HZ)
        while i < stop and i < len(env) and env[i] > 0.55 * peak:
            i += 1
        w["end"] = max(w["end"], min(i / ENV_HZ, nxt - 0.02))
        w["end"] = max(w["end"], w["start"] + 0.08)


def char_times(display, onsets, end):
    """per display glyph start times; non-letters inherit the previous letter's end"""
    out, j = [], 0
    for ch in display:
        if is_letter(ch) and j < len(onsets):
            out.append(onsets[j])
            j += 1
        else:
            nxt = onsets[j] if j < len(onsets) else end
            out.append(nxt if not out else max(out[-1], min(nxt, end)))
    return out


def align_mms(lines, vocals, env):
    import torch
    import torchaudio

    bundle = torchaudio.pipelines.MMS_FA
    model = bundle.get_model()
    model.eval()
    tokenizer = bundle.get_tokenizer()
    aligner = bundle.get_aligner()
    dur = len(vocals) / SR

    for li, line in enumerate(lines):
        a = max(0.0, line["lrc"][0] - PAD_BEFORE)
        b = min(dur, line["lrc"][1] + PAD_AFTER)
        if li + 1 < len(lines):  # never reach into the next line's first word
            b = min(b, lines[li + 1]["lrc"][0] + 0.05)
        seg = torch.from_numpy(vocals[int(a * SR):int(b * SR)]).float()[None]
        with torch.inference_mode():
            emission, _ = model(seg)
        spf = seg.shape[1] / emission.shape[1] / SR
        display = line["text"].split()
        keys = ["*"] + [akey(w) for w in display] + ["*"]
        spans = aligner(emission[0], tokenizer(keys))[1:-1]
        words, scores = [], []
        for disp, sp in zip(display, spans):
            onsets = [round(a + s.start * spf, 3) for s in sp]
            end = round(a + sp[-1].end * spf, 3)
            scores += [float(s.score) for s in sp]
            words.append({"w": disp, "start": onsets[0], "end": end, "_on": onsets})
        extend_holds(words, env, b)
        for w in words:
            w["end"] = round(w["end"], 3)
            w["c"] = char_times(w["w"], w.pop("_on"), w["end"])
        line["words"] = words
        line["score"] = round(float(np.mean(scores)), 3)
    return "mms_fa"


def syllables(word):
    return max(1, len(re.findall(r"[aeiou]+", akey(word))))


def align_heuristic(lines, env):
    for line in lines:
        s, e = line["lrc"]
        # sung end: last loud-enough vocal frame before the next stamp
        i0, i1 = int(s * ENV_HZ), int(e * ENV_HZ)
        loud = np.nonzero(env[i0:i1] > 0.35)[0]
        end = s + (loud[-1] + 1) / ENV_HZ if len(loud) else e
        display = line["text"].split()
        weights = np.array([syllables(w) for w in display], float)
        edges = s + np.concatenate([[0], np.cumsum(weights)]) / weights.sum() * (end - s)
        words = []
        for k, w in enumerate(display):
            ws, we = float(edges[k]), float(edges[k + 1])
            n = max(1, len(w))
            onsets = [round(ws + (we - ws) * i / n, 3) for i in range(n)]
            words.append({"w": w, "start": round(ws, 3), "end": round(we - 0.02, 3), "c": onsets})
        line["words"] = words
    return "heuristic"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--heuristic", action="store_true")
    args = ap.parse_args()

    lines = parse_lrc(LRC)
    vocals, _ = librosa.load(VOCALS, sr=SR, mono=True)
    env = vocal_envelope(vocals)
    method = align_heuristic(lines, env) if args.heuristic else align_mms(lines, vocals, env)

    for i, line in enumerate(lines):
        line["i"] = i
        line["start"] = line["words"][0]["start"]
        line["end"] = line["words"][-1]["end"]

    print(f"method: {method}")
    for line in lines:
        d = line["start"] - line["lrc"][0]
        flag = "  <-- check" if abs(d) > 0.5 or line.get("score", 1) < 0.25 else ""
        ws = " ".join(f"{w['w']}@{w['start']:.2f}" for w in line["words"])
        print(f"{line['lrc'][0]:7.2f} Δ{d:+.2f} s{line.get('score', 0):.2f} | {ws}{flag}")

    keys = ["i", "text", "start", "end", "lrc", "echo", "score", "words"]
    data = {"source": "lyrics/Tahimik.lrc", "method": method,
            "lines": [{k: l[k] for k in keys if k in l} for l in lines]}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1))
    print("wrote", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
