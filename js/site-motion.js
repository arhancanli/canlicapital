// One motion language. Native scrolling, complete HTML and a still reduced-motion view.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);
const main=document.querySelector('main');
if(main&&!document.documentElement.dataset.designMotion){
 document.documentElement.dataset.designMotion='ready';
 const media=gsap.matchMedia();
 media.add('(prefers-reduced-motion: no-preference)',()=>{
  const progress=document.createElement('div');progress.className='cc-reading-progress';progress.setAttribute('aria-hidden','true');document.body.append(progress);
  gsap.fromTo(progress,{scaleX:0},{scaleX:1,ease:'none',scrollTrigger:{start:0,end:'max',scrub:.2}});
  const title=main.querySelector('h1');if(title)gsap.from(title,{y:24,duration:1.05,ease:'power3.out',clearProps:'transform'});
  const prism=main.querySelector('.home-prism img');if(prism)gsap.to(prism,{yPercent:14,rotationY:7,rotationX:-4,ease:'none',scrollTrigger:{trigger:'.cinema-hero',start:'top top',end:'bottom top',scrub:.8}});
  const chapters=[...main.querySelectorAll('section')].filter(s=>s.querySelector('h2')&&!s.parentElement.closest('section')&&!s.classList.contains('evidence-core'));
  for(const chapter of chapters){
   const heading=chapter.querySelector('h2');
   gsap.from(heading,{y:26,duration:.9,ease:'power3.out',immediateRender:false,clearProps:'transform',scrollTrigger:{trigger:heading,start:'top 92%',toggleActions:'play none none none'}});
   if(document.body.classList.contains('canli-home')){
    const copy=chapter.querySelector('.home-editorial>div,.record-chapter__copy p,.developer-chapter__copy p');
    if(copy)gsap.from(copy,{y:14,duration:.8,ease:'power2.out',immediateRender:false,clearProps:'transform',scrollTrigger:{trigger:copy,start:'top 93%'}});
   }
  }
  // Draw the plotted source path once as it enters view. No animated counters:
  // the values are always the exact published values, even during the reveal.
  const paths=main.querySelectorAll('#equity-path,[data-draw-path]');
  for(const path of paths){if(typeof path.getTotalLength!=='function')continue;const length=path.getTotalLength();if(!Number.isFinite(length)||length<=0)continue;
   gsap.fromTo(path,{strokeDasharray:length,strokeDashoffset:length},{strokeDashoffset:0,duration:1.6,ease:'power2.inOut',clearProps:'strokeDasharray,strokeDashoffset',scrollTrigger:{trigger:path.closest('figure')||path,start:'top 88%',once:true}});
  }
  const wordmark=document.querySelector('.cc-footer__wordmark');if(wordmark)gsap.fromTo(wordmark,{yPercent:18},{yPercent:0,ease:'none',scrollTrigger:{trigger:wordmark,start:'top bottom',end:'bottom bottom',scrub:.5}});
  const menu=document.querySelector('.cc-shell__index');const onToggle=()=>{if(menu.open)gsap.fromTo(menu.querySelector('.cc-shell__panel'),{y:-12},{y:0,duration:.25,ease:'power2.out',clearProps:'transform',overwrite:true});};menu?.addEventListener('toggle',onToggle);
  const refresh=()=>ScrollTrigger.refresh();window.addEventListener('load',refresh);
  return()=>{progress.remove();menu?.removeEventListener('toggle',onToggle);window.removeEventListener('load',refresh);};
 });
}
