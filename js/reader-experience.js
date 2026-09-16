const index=document.querySelector('.reader-index');
if(index){
 // Native, initially closed disclosure prevents a post-paint mobile layout jump.
 const links=[...index.querySelectorAll('nav a')];
 const targets=links.map(a=>document.getElementById(a.hash.slice(1))).filter(Boolean);
 if('IntersectionObserver' in window){
  const observer=new IntersectionObserver(entries=>{
   const entry=entries.find(e=>e.isIntersecting);if(!entry)return;
   links.forEach(a=>{if(a.hash==='#'+entry.target.id)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});
  },{rootMargin:'-100px 0px -60% 0px'});
  targets.forEach(t=>observer.observe(t));
 }
}
