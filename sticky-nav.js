/* Keep the basket in reach during scrolling. */
(()=>{let pending=false;const update=()=>{document.body.classList.toggle('nav-condensed',window.scrollY>80);pending=false};window.addEventListener('scroll',()=>{if(!pending){pending=true;requestAnimationFrame(update)}},{passive:true});document.addEventListener('DOMContentLoaded',update);})();
