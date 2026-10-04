import { BRAND, FLAGSHIP, TAGLINE, STATS, FACTS } from '../config/brand.js';
for (const [selector,value] of [['[data-brand]',BRAND],['[data-flagship]',FLAGSHIP],['[data-tagline]',TAGLINE]]) document.querySelectorAll(selector).forEach(el=>{el.textContent=value;});
document.querySelectorAll('[data-fact]').forEach(el=>{const key=el.dataset.fact;if(key in FACTS)el.textContent=FACTS[key];});
const list=document.getElementById('statList');
if(list){list.replaceChildren(...STATS.map(s=>{const li=document.createElement('li');li.className='stat';const value=document.createElement('span');value.className='stat__val mono-data';value.textContent=Number(s.value).toLocaleString('en-US',{minimumFractionDigits:s.decimals||0,maximumFractionDigits:s.decimals||0})+(s.suffix||'');const label=document.createElement('span');label.className='stat__label mono-label';label.textContent=s.label;li.append(value,label);return li;}));}
