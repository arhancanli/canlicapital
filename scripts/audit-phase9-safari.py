"""Actual Safari read-only shell checks against the approved preview."""
from pathlib import Path
source=Path('scripts/audit-phase4-safari.py').read_text().replace('http://127.0.0.1:4188','https://meridian-f3xjbosh7-arhans-projects-ac470eaa.vercel.app').replace('artifacts/qa/phase4-shell/safari','artifacts/qa/phase9-preview/safari')
exec(compile(source,'scripts/audit-phase4-safari.py','exec'),{'__name__':'__main__'})
