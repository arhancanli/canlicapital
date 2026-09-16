"""Run established read-only UI tests with new release-artifact destinations."""
import argparse,sys
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('suite',choices=['safari','shell','tools','home','home-fallbacks']);args=parser.parse_args()
file=Path({'safari':'scripts/audit-phase4-safari.py','shell':'scripts/audit-phase4-shell.py','tools':'scripts/audit-phase5-states.py','home':'scripts/audit-phase3-publication.py','home-fallbacks':'scripts/audit-phase3-fallbacks.py'}[args.suite])
source=file.read_text().replace('artifacts/qa/','artifacts/qa/phase8-release/regressions/')
sys.argv=[str(file)]+(['--origin','http://127.0.0.1:4188','--label','built'] if args.suite=='home' else [])
exec(compile(source,str(file),'exec'),{'__name__':'__main__','__file__':str(file)})
