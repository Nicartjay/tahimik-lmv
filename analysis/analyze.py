"""Audio analysis -> data/audio.json

Tempo + a DP-tracked, locally smoothed beat grid (the song drifts ~92 → ~90 BPM),
downbeats, onset events per stem (kick / snare / hat / vocal) and 0..255 loudness
envelopes sampled at ENV_FPS.

    uv run python analyze.py
"""
import json
import pathlib

import librosa
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
AUDIO = ROOT / "audio" / "Tahimik.mp3"
STEMS = ROOT / "analysis" / "stems"
OUT = ROOT / "data" / "audio.json"

SR = 24000
ENV_FPS = 60
HOP = SR // ENV_FPS  # 400 samples -> exactly 60 envelope frames / s
NFFT = 2048


def load(path):
    y, _ = librosa.load(path, sr=SR, mono=True)
    return y


def spec(y):
    return np.abs(librosa.stft(y, n_fft=NFFT, hop_length=HOP, center=True))


def band(S, lo, hi):
    f = librosa.fft_frequencies(sr=SR, n_fft=NFFT)
    m = (f >= lo) & (f < hi)
    return np.sqrt((S[m] ** 2).sum(0))


def to_unit(e, floor_pct=5, ceil_pct=99.5, floor_db=-60):
    """log-compress an energy curve and map its useful range onto 0..1"""
    db = 20 * np.log10(e + 1e-9)
    hi = np.percentile(db, ceil_pct)
    lo = max(np.percentile(db, floor_pct), hi + floor_db)
    return np.clip((db - lo) / (hi - lo + 1e-9), 0, 1)


def smooth(v, attack=0.6, release=0.12):
    """one-pole follower: fast up, slow down (per 60 Hz frame)"""
    out = np.empty_like(v)
    acc = 0.0
    for i, x in enumerate(v):
        k = attack if x > acc else release
        acc += (x - acc) * k
        out[i] = acc
    return out


def q(v):
    return [int(round(x * 255)) for x in np.clip(v, 0, 1)]


def onsets(env, delta, wait_s=0.07):
    env = env / (env.max() + 1e-9)
    fr = librosa.onset.onset_detect(onset_envelope=env, sr=SR, hop_length=HOP, units="frames",
                                    delta=delta, wait=int(wait_s * ENV_FPS), backtrack=False)
    return [round(float(i) / ENV_FPS, 3) for i in fr]


def band_onset_env(S, lo, hi):
    f = librosa.fft_frequencies(sr=SR, n_fft=NFFT)
    m = (f >= lo) & (f < hi)
    return librosa.onset.onset_strength(S=librosa.amplitude_to_db(S[m], ref=np.max), sr=SR,
                                        hop_length=HOP, aggregate=np.mean)


def beat_grid(mix, drums, dur):
    """Beats that follow the song's tempo drift (92.4 BPM -> ~90 after the bridge).

    DP beat tracking on a high-resolution onset curve, then each beat time is replaced
    by a local linear fit over its +-12 neighbours (outliers rejected), which removes
    tracker jitter without accumulating drift. Extended to cover the whole song."""
    hop = 120
    o = librosa.onset.onset_strength(y=mix, sr=SR, hop_length=hop)
    od = librosa.onset.onset_strength(y=drums, sr=SR, hop_length=hop)
    env = o / o.max() + od / od.max()
    _, raw = librosa.beat.beat_track(onset_envelope=env, sr=SR, hop_length=hop, start_bpm=91,
                                     tightness=1600, units="time")
    idx = np.arange(len(raw), dtype=float)
    keep = np.ones(len(raw), bool)
    for _ in range(3):
        fit = np.empty(len(raw))
        for i in range(len(raw)):
            sel = keep & (np.abs(idx - i) <= 12)
            A = np.stack([np.ones(sel.sum()), idx[sel] - i], 1)
            fit[i] = np.linalg.lstsq(A, raw[sel], rcond=None)[0][0]
        keep = np.abs(raw - fit) < 0.035
    resid = float(np.median(np.abs(raw - fit)[keep]))
    head, tail = fit[1] - fit[0], fit[-1] - fit[-2]
    pre = fit[0] - head * np.arange(int(fit[0] / head) + 1, 0, -1)
    post = fit[-1] + tail * np.arange(1, int((dur - fit[-1]) / tail) + 1)
    grid = np.concatenate([pre[pre >= 0], fit, post])
    bpm = float(60 / np.median(np.diff(fit)))
    return bpm, grid, resid


def main():
    mix = load(AUDIO)
    dur = len(mix) / SR
    stems = {n: load(STEMS / f"{n}.wav") for n in ("vocals", "drums", "bass", "other")}
    n = int(np.ceil(dur * ENV_FPS)) + 1

    def fit(v):
        v = np.asarray(v)[:n]
        return np.pad(v, (0, n - len(v)))

    Smix = spec(mix)
    Sdr = spec(stems["drums"])
    env = {
        "rms": to_unit(band(Smix, 20, 12000)),
        "low": to_unit(band(Smix, 20, 150)),
        "mid": to_unit(band(Smix, 150, 2000)),
        "high": to_unit(band(Smix, 4000, 12000)),
    }
    for name, y in stems.items():
        env[name] = to_unit(band(spec(y), 60, 10000), floor_db=-45)
    env = {k: fit(smooth(v)) for k, v in env.items()}

    bpm, grid, resid = beat_grid(mix, stems["drums"], dur)

    kick_env = band_onset_env(Sdr, 25, 140)
    snare_env = band_onset_env(Sdr, 180, 3000)
    hat_env = band_onset_env(Sdr, 7000, 12000)
    voc_env = librosa.onset.onset_strength(y=stems["vocals"], sr=SR, hop_length=HOP)
    events = {
        "kick": onsets(kick_env, 0.12, 0.09),
        "snare": onsets(snare_env, 0.12, 0.09),
        "hat": onsets(hat_env, 0.10, 0.05),
        "vocal": onsets(voc_env, 0.10, 0.08),
    }

    # downbeat phase: the beat-in-bar with the most kick energy
    def at(curve, times):
        i = np.clip(np.round(np.asarray(times) * ENV_FPS).astype(int), 0, len(curve) - 1)
        return curve[i]

    kick_n = kick_env / (kick_env.max() + 1e-9)
    snare_n = snare_env / (snare_env.max() + 1e-9)
    K = [float(at(kick_n, grid[p::4]).mean()) for p in range(4)]
    S = [float(at(snare_n, grid[p::4]).mean()) for p in range(4)]
    scores = [K[p] + K[(p + 2) % 4] - S[p] - S[(p + 2) % 4] + S[(p + 1) % 4] + S[(p + 3) % 4]
              - K[(p + 1) % 4] - K[(p + 3) % 4] + 0.5 * (K[p] - K[(p + 2) % 4]) for p in range(4)]
    phase = int(np.argmax(scores))
    downbeats = grid[phase::4]

    data = {
        "file": "audio/Tahimik.mp3",
        "duration": round(dur, 3),
        "bpm": round(bpm, 3),
        "gridResidual": round(resid, 4),
        "beats": [round(float(t), 3) for t in grid],
        "downbeats": [round(float(t), 3) for t in downbeats],
        "downbeatPhaseScores": [round(s, 3) for s in scores],
        "events": events,
        "envFps": ENV_FPS,
        "env": {k: q(v) for k, v in env.items()},
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, separators=(",", ":")))
    print(f"bpm {bpm:.2f} (median)  beat fit residual {resid * 1000:.1f} ms  beats {len(grid)}  "
          f"downbeat phase {phase} {scores}")
    print({k: len(v) for k, v in events.items()})
    print("wrote", OUT.relative_to(ROOT), f"{OUT.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
