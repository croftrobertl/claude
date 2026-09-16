/* ===========================================================================
   DCC Availability Calendar — item 14 / 9, mobile carousel capture
   ---------------------------------------------------------------------------
   ONE PASTE, ONE PASS. Read-only: it measures and prints, it changes nothing.

   HOW TO RUN
   1. iPhone: Settings > Safari > Advanced > Web Inspector ON.
      Mac: Safari > Settings > Advanced > "Show features for web developers".
   2. Attach the phone by cable. On the phone, open a cottage page and open the
      photo popup — the one where the arrows show but the photo does not.
   3. Mac: Safari > Develop > [iPhone] > that page. Open the Console tab.
   4. Paste this whole file at the console prompt and press Return.
   5. It replies "sampling for 1.1s - TAP THE NEXT ARROW NOW".
      TAP THE NEXT ARROW ON THE PHONE straight away. Timing is forgiving: it
      takes six samples across 1.1s, so it brackets the transition either way.
   6. After ~1s it prints a JSON array of six frames. Copy ALL of it.
      (It is also left in window.__mphbacCapture if the copy goes wrong.)

   WHAT EACH FIELD IS FOR — so a surprise is recognisable in the moment:
     swiperElementCount > 1 or two instances  -> the two-Swiper hypothesis
     state.size / width 0                     -> initialised at zero width
     duplicates growing between frames        -> loopCreate ran more than once
     wrapper.transform stuck or NaN           -> the transition never committed
     activeSlide opacity 0 / w 0              -> the slide, not the arrows
     img.natural 0x0 or complete false        -> the photo never loaded
     img.opacity 0 with natural > 0           -> loaded but not painted
                                                 (iOS discards decoded images
                                                  under memory pressure)
   =========================================================================== */
(function(){
  function dump(){
    var sel = '.mphbac-info-body .swiper, .mphbac-info-body .elementor-main-swiper, .mphbac-info-body .swiper-container';
    var els = document.querySelectorAll(sel);
    var el = els[0];
    if (!el) return { error: 'no swiper element found', bodyPresent: !!document.querySelector('.mphbac-info-body') };
    var sw = el.swiper;
    function st(n){ if(!n) return null; var c=getComputedStyle(n); var r=n.getBoundingClientRect();
      return {opacity:c.opacity, transform:c.transform, visibility:c.visibility, display:c.display,
              w:Math.round(r.width), h:Math.round(r.height), x:Math.round(r.left), y:Math.round(r.top)}; }
    var wrap = el.querySelector('.swiper-wrapper');
    var act  = el.querySelector('.swiper-slide-active') || el.querySelector('.swiper-slide');
    var img  = act ? act.querySelector('img') : null;
    return {
      t: Math.round(performance.now()),
      swiperElementCount: els.length,
      initialized: el.className.indexOf('swiper-initialized') > -1,
      hasInstance: !!sw,
      params: sw && sw.params ? {loop:sw.params.loop, spv:sw.params.slidesPerView, effect:sw.params.effect} : null,
      state: sw ? {active:sw.activeIndex, real:sw.realIndex, slides:sw.slides?sw.slides.length:null,
                   translate:sw.translate, size:sw.size, width:sw.width, height:sw.height,
                   locked:sw.isLocked, animating:sw.animating} : null,
      slides: el.querySelectorAll('.swiper-slide').length,
      duplicates: el.querySelectorAll('.swiper-slide-duplicate').length,
      wrapper: st(wrap),
      activeSlide: st(act),
      img: img ? {opacity:getComputedStyle(img).opacity, visibility:getComputedStyle(img).visibility,
                  natural:img.naturalWidth+'x'+img.naturalHeight, complete:img.complete,
                  loading:img.loading||'', src:(img.currentSrc||img.src||'').slice(-58),
                  w:Math.round(img.getBoundingClientRect().width),
                  h:Math.round(img.getBoundingClientRect().height)} : 'NO <img> IN ACTIVE SLIDE'
    };
  }
  var frames = [];
  [0,120,250,400,700,1100].forEach(function(ms){
    setTimeout(function(){
      try { frames.push(dump()); } catch(e){ frames.push({error:String(e)}); }
      if (ms === 1100) { window.__mphbacCapture = frames; console.log(JSON.stringify(frames, null, 1)); }
    }, ms);
  });
  return 'sampling for 1.1s - TAP THE NEXT ARROW NOW';
})()
