import { enhanceResearchLibrary } from './research-library-search.js';
const archive=document.querySelector('#researchLibrary');
if(archive)enhanceResearchLibrary(archive,document.querySelector('#researchLibraryList'));
const list=document.querySelector('.measure__cards,.research-library--hub');
if(list){
 const items=[...list.children];
 const toolbar=document.createElement('div');toolbar.className='hub-search';
 const label=document.createElement('label');label.htmlFor='hub-query';label.textContent='Find a document on this page';
 const input=document.createElement('input');input.id='hub-query';input.type='search';input.placeholder='Search titles and descriptions';
 const clear=document.createElement('button');clear.type='button';clear.textContent='Clear search';
 const status=document.createElement('p');status.setAttribute('role','status');
 toolbar.append(label,input,clear,status);list.before(toolbar);
 function filter(){const terms=input.value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);let count=0;for(const item of items){item.hidden=!terms.every(t=>item.textContent.toLocaleLowerCase().includes(t));if(!item.hidden)count++;}status.textContent=count?`${count} of ${items.length} documents`:'No matching documents. Try a different title or clear your search.';clear.hidden=!input.value;}
 input.addEventListener('input',filter);clear.addEventListener('click',()=>{input.value='';filter();input.focus();});filter();
}
