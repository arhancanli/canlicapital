"""Separate Decimal accounting reference for standards/trade-journal/EXPORT.md.

Uses the existing independent Python byte/signature verifier, then reads authored JSON
numbers as Decimal and reconstructs selected cash, holdings, fees, returns, turnover and
drawdown. It does not import or invoke JavaScript accounting, and is not external review.

  python recompute_export.py JOURNALS_DIR OUTPUT.json.gz
"""
import gzip
import hashlib
import json
import pathlib
import sys
from datetime import datetime, timezone
from decimal import Decimal, localcontext
from verify_journal import verify as verify_integrity

ZERO=Decimal(0)
def digest(data):
    return 'sha256:'+hashlib.sha256(data).hexdigest()
def number(value):
    return float(value)
def utc_bucket(ts, frequency):
    t=datetime.fromisoformat(ts.replace('Z','+00:00'))
    seconds=(t-datetime(1970,1,1,tzinfo=timezone.utc)).total_seconds()
    if frequency=='DAILY':return int(seconds//86400)
    if frequency=='HOURLY':return int(seconds//3600)
    if frequency=='WEEKLY':return int((seconds/86400+3)//7)
    if frequency=='MONTHLY':return t.year*12+t.month
    return None

def recompute(data, options):
    integrity=verify_integrity(data)
    if not integrity['valid']:raise ValueError(f"Python integrity failed: {integrity}")
    lines=data.rstrip(b'\n').split(b'\n')
    entries=[json.loads(line,parse_float=Decimal,parse_int=Decimal)['entry'] for line in lines]
    start,end=options['from'],options['to']
    account=entries[0]['payload']['account']
    cash=account['initial_cash']
    holdings={p['symbol']:p['qty'] for p in account['initial_positions']}
    opening=cash+sum((p['qty']*p['price'] for p in account['initial_positions']),ZERO)
    previous=peak=equity=opening
    if opening<=0:raise ValueError('Nonpositive opening equity')
    patches={}
    for e in entries[1:end+1]:
        if e['kind']=='correction':
            seq=int(e['payload']['corrects_seq'])
            patches[seq]={**patches.get(seq,entries[seq]['payload']),**e['payload']['replacement']}
    total_fees=traded=interval_traded=ZERO
    fills=0;max_drawdown=ZERO;last_observed=entries[0]['ts'];rows=[]
    regular=account['frequency']!='IRREGULAR'
    for e in entries[1:end+1]:
        seq=int(e['seq']);p=patches.get(seq,e['payload']);kind=e['kind']
        if kind=='fill':
            signed_qty=p['qty']*(1 if p['side']=='buy' else -1)
            notional=signed_qty*p['price']
            cash-=notional+p['fee']
            holdings[p['symbol']]=holdings.get(p['symbol'],ZERO)+signed_qty
            if seq>start:
                total_fees+=p['fee'];traded+=abs(notional);interval_traded+=abs(notional);fills+=1
        elif kind=='mark':
            observed=p.get('observed_at',e['ts'])
            equity=cash+sum((qty*p['marks'][symbol] for symbol,qty in holdings.items() if qty),ZERO)
            if seq<start:
                previous=equity;last_observed=observed;continue
            if seq==start:
                opening=previous=peak=equity;last_observed=observed;continue
            if regular and utc_bucket(observed,account['frequency'])-utc_bucket(last_observed,account['frequency'])!=1:regular=False
            peak=max(peak,equity)
            max_drawdown=max(max_drawdown,1-equity/peak)
            rows.append({'seq':seq,'ts':observed,'equity':number(equity),'return':number(equity/previous-1) if previous>0 else None,'turnover':number(interval_traded/previous) if previous>0 else None})
            previous=equity;interval_traded=ZERO;last_observed=observed
    if not rows:raise ValueError('No selected observations')
    annual_turnover=None
    if regular and all(r['turnover'] is not None for r in rows):
        # Exact interval fractions are already represented as float in rows. This deliberate
        # independent summation checks the contract's published finite ratios, not JS amounts.
        annual_turnover=sum(r['turnover'] for r in rows)/len(rows)*number(account['periods_per_year'])
    return {'journal_sha256':digest(data),'head':digest(lines[end]),'entry_range':{'from':start,'to':end},'frequency':account['frequency'] if regular else 'IRREGULAR','metrics':{'opening_equity':number(opening),'closing_equity':number(equity),'fees_usd':number(total_fees),'traded_notional_usd':number(traded),'fill_count':fills,'cumulative_return':number(equity/opening-1),'max_drawdown':number(max_drawdown),'turnover_annualised':annual_turnover,'undefined_returns':sum(r['return'] is None for r in rows)},'series':rows}

def main():
    folder=pathlib.Path(sys.argv[1]);cases=json.loads((folder/'cases.json').read_text())
    answers={}
    with localcontext() as context:
        context.prec=100
        for case in cases:answers[case['name']]=recompute((folder/(case['name']+'.jsonl')).read_bytes(),case['options'])
    record={'schema':'canli.journal-export-python-reference.v1','case_count':len(cases),'reference':'Python independent byte/signature verifier plus Decimal accounting; synthetic cases, not external review','cases':answers}
    raw=(json.dumps(record,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n').encode()
    pathlib.Path(sys.argv[2]).write_bytes(gzip.compress(raw,mtime=0))
    print(json.dumps({'cases':len(cases),'integrity_verified':len(answers),'output_bytes':pathlib.Path(sys.argv[2]).stat().st_size}))
if __name__=='__main__':main()
