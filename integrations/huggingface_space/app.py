"""A Hugging Face Space for the luck check. The checking is in check(), with no Gradio in it."""
import csv
import importlib.util
import io
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _client():
    """The validate client: beside this file in a Space, one folder up in the repository."""
    for base in (HERE, HERE.parent):
        path = base / "canli_validate" / "__init__.py"
        if path.exists():
            spec = importlib.util.spec_from_file_location("canli_validate_for_space", path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return module
    raise ImportError("canli_validate/ is missing: copy it beside app.py")


validate_returns = _client().validate_returns


def read_returns(text: str) -> list[float]:
    """Returns from the last column of a CSV. A header and blank cells are skipped."""
    out = []
    rows = list(csv.reader(io.StringIO(text)))
    for i, row in enumerate(rows):
        if not row or not row[-1].strip():
            continue
        try:
            out.append(float(row[-1]))
        except ValueError:
            if i > 0:
                raise ValueError(f"Row {i + 1}: {row[-1][:30]!r} is not a number.") from None
    if len(out) < 20:
        raise ValueError(f"{len(out)} returns is too few: send at least 20.")
    return out


def check(text: str, trials: int, periods_per_year: int = 252) -> str:
    if int(trials) < 2:
        raise ValueError("Count every variant you tried, including this one: at least 2.")
    envelope = validate_returns(read_returns(text), periods_per_year, int(trials), key=os.environ.get("CANLI_KEY"), label="huggingface-space")
    data = envelope["data"]
    lines = [f"**Probability this Sharpe beats the best that luck gives across {int(trials)} tries: {100 * data['result']['deflated_sharpe_ratio']:.1f}%**", "", data.get("plain_reading", ""), ""]
    lines += [f"- {limit}" for limit in envelope.get("limits", [])]
    return "\n".join(lines)


def run(file_path, trials):
    if not file_path:
        return "Upload a CSV of returns first."
    try:
        return check(Path(file_path).read_text(), trials)
    except Exception as err:  # shown to the person using the page
        return f"This could not be checked: {err}"


if __name__ == "__main__":
    import gradio as gr

    gr.Interface(
        fn=run,
        inputs=[gr.File(label="CSV of daily returns", type="filepath", file_types=[".csv"]), gr.Number(label="Variants you tried", value=10, precision=0, minimum=2)],
        outputs=gr.Markdown(),
        title="Luck check",
        description="How likely is it that this backtest beats what luck alone gives across that many tries?",
        flagging_mode="never",
    ).launch()
