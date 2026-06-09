#!/usr/bin/env python3
import json
import math
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter


COLORS = {
    "blue": "#1976d2",
    "green": "#00796b",
    "dark_green": "#2e7d32",
    "purple": "#8e24aa",
    "orange": "#ef6c00",
    "red": "#c62828",
    "brown": "#6d4c41",
    "grid": "#e8eef2",
    "text": "#263238",
    "muted": "#607d8b",
}


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: render_long_horizon_figures.py <data.json> <output-dir>")
    data_path = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)
    data = json.loads(data_path.read_text())

    plt.rcParams.update(
        {
            "font.family": "DejaVu Sans",
            "axes.edgecolor": "#b0bec5",
            "axes.labelcolor": COLORS["muted"],
            "xtick.color": COLORS["text"],
            "ytick.color": COLORS["muted"],
            "axes.titlecolor": COLORS["text"],
            "figure.facecolor": "white",
            "axes.facecolor": "white",
            "svg.fonttype": "none",
        }
    )

    render_prefix_cache(data, out_dir / "inferoa-prefix-cache-stability.svg")
    render_token_savings(data, out_dir / "inferoa-long-horizon-token-savings.svg")
    render_mega_projection(data, out_dir / "inferoa-mega-loop-projection.svg")
    render_compression_continuity(data, out_dir / "inferoa-compression-continuity.svg")
    render_optimization_surfaces(data, out_dir / "inferoa-optimization-surfaces.svg")
    render_real_provider(data, out_dir / "inferoa-real-provider-cache-probe.svg")


def render_prefix_cache(data: dict, path: Path) -> None:
    rows = data["simulator"]
    labels = [row["label"].replace(" x ", "\nx ") for row in rows]
    x = list(range(len(rows)))
    cache = [row["steady_state_cache_hit_pct"] for row in rows]
    epoch = [row["prompt_epoch_stability_pct"] for row in rows]
    tool_schema = [row["tool_schema_stability_pct"] for row in rows]

    fig, ax = plt.subplots(figsize=(9.8, 5.2), constrained_layout=True)
    ax.plot(x, cache, marker="o", linewidth=2.8, color=COLORS["blue"], label="simulated prefix-cache hit")
    ax.plot(x, epoch, marker="s", linewidth=2.2, linestyle="--", color=COLORS["dark_green"], label="prompt epoch stability")
    ax.plot(x, tool_schema, marker="^", linewidth=2.0, linestyle=":", color=COLORS["purple"], label="tool schema stability")
    ax.set_title("Prefix cache stays stable as loops and turns grow", loc="left", fontsize=15, fontweight="bold", pad=12)
    ax.set_ylabel("Steady-state hit rate / stability (%)")
    ax.set_ylim(0, 105)
    ax.set_xticks(x, labels)
    ax.grid(axis="y", color=COLORS["grid"], linewidth=0.8)
    ax.legend(loc="lower center", bbox_to_anchor=(0.55, 0.05), frameon=False, ncols=3)
    ax.text(
        0,
        -0.2,
        "Local Runtime simulator; warmup request excluded. cache_salt was stable at 100% in all measured profiles.",
        transform=ax.transAxes,
        fontsize=9,
        color=COLORS["muted"],
    )
    save(fig, path)


def render_token_savings(data: dict, path: Path) -> None:
    rows = [row for row in data["simulator"] if "turns" not in row["label"]]
    labels = [row["label"] for row in rows]
    series = [
        ("raw transcript", [row["raw_transcript_baseline_prompt_tokens"] for row in rows], COLORS["brown"]),
        ("Inferoa prompt", [row["prompt_tokens"] for row in rows], COLORS["green"]),
        ("cache-adjusted prefill", [row["cache_adjusted_prefill_tokens"] for row in rows], COLORS["blue"]),
    ]
    grouped_bar_chart(
        path,
        labels,
        series,
        title="Longer loops amplify context and cache savings",
        ylabel="Input tokens / cache-adjusted prefill work",
        note=f"Measured Runtime simulator. Cached prefix counts as {data['scaled_projection']['cache_discount_factor'] * 100:.0f}% prefill work.",
        log_scale=False,
        figsize=(10.4, 5.4),
    )


def render_mega_projection(data: dict, path: Path) -> None:
    measured = next(row for row in data["simulator"] if row["label"] == "64 loops")
    projected = data["scaled_projection"]["rows"]
    rows = [measured] + projected
    labels = [row["label"].replace(" projected", "").replace(" x ", "\nx ") for row in rows]
    series = [
        ("raw transcript", [row["raw_transcript_baseline_prompt_tokens"] for row in rows], COLORS["brown"]),
        ("Inferoa prompt", [row["prompt_tokens"] for row in rows], COLORS["green"]),
        ("cache-adjusted prefill", [row["cache_adjusted_prefill_tokens"] for row in rows], COLORS["blue"]),
    ]
    grouped_bar_chart(
        path,
        labels,
        series,
        title="10k-loop projection: savings compound over long sessions",
        ylabel="Input-token-equivalent work (log scale)",
        note="Projection calibrated from measured 64-loop tail slope. One normalized cost unit = 1M input-token-equivalent tokens.",
        log_scale=True,
        figsize=(11.6, 5.8),
    )


def render_compression_continuity(data: dict, path: Path) -> None:
    row = data["compression_continuity"]
    samples = row["turn_samples"]
    turns = [sample["turn"] for sample in samples]
    hit = [sample.get("cache_hit_pct") or 0 for sample in samples]
    continuity = [100 if sample.get("continuity_marker_present") else 0 for sample in samples]
    archive = [100 if sample.get("archive_reference_present") else 0 for sample in samples]

    fig, ax = plt.subplots(figsize=(10.4, 5.4), constrained_layout=True)
    ax.plot(turns, hit, marker="o", linewidth=2.8, color=COLORS["blue"], label="interactive cache hit")
    ax.plot(turns, continuity, marker="s", linewidth=2.2, linestyle="--", color=COLORS["green"], label="continuity marker present")
    ax.plot(turns, archive, marker="^", linewidth=2.0, linestyle=":", color=COLORS["purple"], label="archive reference present")
    ax.set_title("Compression cycles preserve continuity and recover cache", loc="left", fontsize=15, fontweight="bold", pad=12)
    ax.set_ylabel("Cache hit / continuity (%)")
    ax.set_xlabel("Turn")
    ax.set_ylim(0, 105)
    ax.grid(axis="y", color=COLORS["grid"], linewidth=0.8)
    ax.legend(loc="lower right", frameon=False)
    ax.text(
        0,
        -0.22,
        (
            f"{row['turns']} measured turns with compression every {row['compression_cycle_length_turns']} turns. "
            f"Continuity marker: {row['continuity_ok_pct']:.1f}%; archive reference: {row['archive_reference_pct']:.1f}%.\n"
            f"1k-turn projected cache-adjusted work: {row['projected_1000_turns']['normalized_cache_adjusted_cost_units']:.2f}M-token units."
        ),
        transform=ax.transAxes,
        fontsize=9,
        color=COLORS["muted"],
    )
    save(fig, path)


def render_optimization_surfaces(data: dict, path: Path) -> None:
    summary = data["summary"]
    prefix_cache_discount_pct = (1 - data["scaled_projection"]["cache_discount_factor"]) * 100
    values = [
        ("Prefix cache cached-token discount", prefix_cache_discount_pct, COLORS["blue"]),
        ("CodeGraph context reduced", summary["codegraph_context_savings_pct"], COLORS["green"]),
        ("RTK tool output reduced", summary["rtk_savings_pct"], COLORS["purple"]),
    ]

    fig, ax = plt.subplots(figsize=(9.8, 4.8), constrained_layout=True)
    labels = [item[0] for item in values]
    widths = [item[1] for item in values]
    y = list(range(len(values)))
    bars = ax.barh(y, widths, color=[item[2] for item in values], height=0.58)
    ax.set_title("Tokenmaxxing reduces token pressure", loc="left", fontsize=15, fontweight="bold", pad=12)
    ax.set_xlabel("Token reduction / cached-token discount (%)")
    ax.set_xlim(0, 100)
    ax.set_yticks(y, labels)
    ax.invert_yaxis()
    ax.grid(axis="x", color=COLORS["grid"], linewidth=0.8)
    ax.bar_label(bars, labels=[f"{value:.1f}%" for value in widths], padding=4, color=COLORS["text"], fontsize=10)
    ax.text(
        0,
        -0.2,
        "Sources: prefix-cache cost model, CodeGraph projection, and RTK records.",
        transform=ax.transAxes,
        fontsize=9,
        color=COLORS["muted"],
    )
    save(fig, path)


def render_real_provider(data: dict, path: Path) -> None:
    probe = data["real_provider_probe"]
    fig, ax = plt.subplots(figsize=(8.8, 4.8), constrained_layout=True)
    ax.set_title("DeepSeek v4 Pro exposes cached-token evidence after warmup", loc="left", fontsize=15, fontweight="bold", pad=12)
    ax.set_ylabel("Cached prompt tokens / prompt tokens (%)")
    ax.set_ylim(0, 105)
    ax.grid(axis="y", color=COLORS["grid"], linewidth=0.8)
    if probe["status"] == "ok":
        rows = probe["usages"]
        x = list(range(1, len(rows) + 1))
        y = [row.get("cache_hit_pct") or 0 for row in rows]
        ax.plot(x, y, marker="o", linewidth=2.8, color=COLORS["blue"])
        ax.set_xticks(x, [f"req {value}" for value in x])
        ax.annotate("warmup", xy=(x[0], y[0]), xytext=(x[0] + 0.25, 16), arrowprops={"arrowstyle": "->", "color": COLORS["muted"]}, color=COLORS["muted"], fontsize=9)
        steady = sum(y[1:]) / max(1, len(y) - 1)
        ax.text(0.98, 0.08, f"steady state {steady:.1f}%", transform=ax.transAxes, ha="right", fontsize=11, color=COLORS["text"])
        ax.text(
            0,
            -0.2,
            f"DeepSeek v4 Pro probe. Fresh probe id; stable cache_salt inside the run.",
            transform=ax.transAxes,
            fontsize=9,
            color=COLORS["muted"],
        )
    else:
        ax.text(0.5, 0.5, f"Real provider probe {probe['status']}", transform=ax.transAxes, ha="center", va="center", fontsize=14, color=COLORS["muted"])
        ax.set_xticks([])
    save(fig, path)


def grouped_bar_chart(path: Path, labels: list[str], series: list[tuple[str, list[float], str]], title: str, ylabel: str, note: str, log_scale: bool, figsize: tuple[float, float]) -> None:
    fig, ax = plt.subplots(figsize=figsize, constrained_layout=True)
    x = list(range(len(labels)))
    width = min(0.22, 0.75 / len(series))
    offsets = [(index - (len(series) - 1) / 2) * width * 1.15 for index in range(len(series))]
    for offset, (name, values, color) in zip(offsets, series):
        ax.bar([value + offset for value in x], values, width, label=name, color=color)
    ax.set_title(title, loc="left", fontsize=15, fontweight="bold", pad=12)
    ax.set_ylabel(ylabel)
    ax.set_xticks(x, labels)
    ax.margins(x=0.08)
    ax.yaxis.set_major_formatter(FuncFormatter(lambda value, _: format_tokens(value)))
    if log_scale:
        ax.set_yscale("log")
        ax.set_ylim(bottom=max(1, min(min(values) for _, values, _ in series) * 0.55))
    else:
        ax.set_ylim(top=max(max(values) for _, values, _ in series) * 1.16)
    ax.grid(axis="y", color=COLORS["grid"], linewidth=0.8, which="both")
    ax.legend(loc="upper left", frameon=False, ncols=min(3, len(series)))
    ax.text(0, -0.2, note, transform=ax.transAxes, fontsize=9, color=COLORS["muted"])
    save(fig, path)


def save(fig: plt.Figure, path: Path) -> None:
    fig.savefig(path, format="svg", bbox_inches="tight", pad_inches=0.16)
    plt.close(fig)


def format_tokens(value: float) -> str:
    if not math.isfinite(value):
        return ""
    value = abs(value)
    if value >= 1_000_000_000:
        return f"{value / 1_000_000_000:.1f}B"
    if value >= 1_000_000:
        return f"{value / 1_000_000:.1f}M"
    if value >= 10_000:
        return f"{value / 1_000:.0f}k"
    if value >= 1_000:
        return f"{value / 1_000:.1f}k"
    return f"{value:.0f}"


def percent(numerator: float, denominator: float) -> float:
    return numerator / denominator * 100 if denominator else 0.0


if __name__ == "__main__":
    main()
