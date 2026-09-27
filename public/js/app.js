(() => {
  const page = document.getElementById('page');
  const boot = document.getElementById('boot');
  const bootBar = document.getElementById('bootBar');
  const bootStatus = document.getElementById('bootStatus');
  const transition = document.getElementById('transition');
  const transitionStatus = document.getElementById('transitionStatus');
  const clock = document.getElementById('clock');

  const state = {
    route: location.pathname || '/',
    navigating: false,
    visitorRegion: 'UNKNOWN',
    visitorCoordinates: null,
    lastSeen: '--:--:--',
    traceId: null
  };


  const esc = (s = '') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const text = (s = '') => esc(s).replace(/\n/g, '<br>');
  const nowTime = () => new Date().toLocaleTimeString([], { hour12:false });

  function updateClock() { clock.textContent = nowTime(); state.lastSeen = clock.textContent; }
  updateClock(); setInterval(updateClock, 1000);

  function activeNav() {
    const current = state.route === '/' ? 'entry' : state.route.slice(1);
    document.querySelectorAll('[data-page]').forEach(el => el.classList.toggle('active', el.dataset.page === current));
  }

  function effect(kind = 'hit') {
    const layer = document.querySelector('.signal-layer');
    const line = document.querySelector('.signal-line');
    layer.className = `signal-layer ${kind}`;
    line.classList.remove('run'); void line.offsetWidth; line.classList.add('run');
    if (kind === 'hard') {
      document.body.classList.remove('glitch-burst'); void document.body.offsetWidth; document.body.classList.add('glitch-burst');
      setTimeout(() => document.body.classList.remove('glitch-burst'), 500);
    }
  }

  function horror(message) {
    let box = document.querySelector('.horror-pop');
    if (!box) { box = document.createElement('div'); box.className = 'horror-pop'; document.body.appendChild(box); }
    box.textContent = message;
    box.classList.remove('show'); void box.offsetWidth; box.classList.add('show');
  }

  function toast(message) {
    let box = document.querySelector('.toast');
    if (!box) { box = document.createElement('div'); box.className = 'toast'; document.body.appendChild(box); }
    box.textContent = message;
    box.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => box.classList.remove('show'), 2400);
  }

  function glitchText() {
    const list = [...document.querySelectorAll('[data-glitch]')];
    if (!list.length) return;
    const el = list[Math.floor(Math.random() * list.length)];
    const original = el.textContent;
    if (!original.trim()) return;
    const chars = '#!?%/\\<>_';
    el.classList.add('glitching');
    el.textContent = [...original].map(ch => ch === ' ' || Math.random() > .82 ? ch : chars[Math.floor(Math.random()*chars.length)]).join('');
    setTimeout(() => { el.textContent = original; el.classList.remove('glitching'); }, 120 + Math.random()*220);
  }

  function randomDisturb() {
    const delay = 4200 + Math.random() * 10800;
    setTimeout(() => {
      if (document.hidden) { randomDisturb(); return; }
      const r = Math.random();
      effect(r < .34 ? 'hit' : r < .72 ? 'flash' : 'hard');
      if (Math.random() < .72) glitchText();
      if (Math.random() < .22) {
        const lines = [
          'THE PAGE WAS QUIET BEFORE YOU CAME.',
          'YOU WERE NOT THE FIRST VISITOR.',
          'SOMEONE CHANGED THIS BEFORE.',
          'DO NOT EXPECT THE NEXT NOTE TO BE KIND.',
          'THE CLOCK IS NOT PART OF THE STORY.',
          'YOU ARE STILL READING.',
          'THERE IS NO REPLY HERE.',
          'THIS WAS NEVER FINISHED.',
          'DO NOT MAKE A HABIT OF THIS.',
          'THE SCREEN DID THAT BEFORE.',
          'SOMETHING WAS LEFT OPEN.',
          'STOP LOOKING FOR AN EXPLANATION.'
        ];
        horror(lines[Math.floor(Math.random() * lines.length)]);
      }
      randomDisturb();
    }, delay);
  }

  async function getVisitorRegion() {
    try {
      if (!navigator.geolocation) throw new Error('no geolocation');
      const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, {enableHighAccuracy:true,timeout:7000,maximumAge:120000}));
      state.visitorCoordinates={latitude:position.coords.latitude,longitude:position.coords.longitude};
      const response=await fetch('/api/region',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(state.visitorCoordinates)});
      const data=await response.json();
      if(!response.ok||!data.ok) throw new Error('precise lookup failed');
      state.visitorRegion=data.region||'UNKNOWN';
    } catch {
      state.visitorCoordinates=null;
      try{const response=await fetch('/api/visitor',{cache:'no-store'});const data=await response.json();state.visitorRegion=data.region||'UNKNOWN';}catch{state.visitorRegion='UNKNOWN';}
    }
  }

  function visitSession(){
    try{return sessionStorage.getItem('beforeYouVisitId')||(()=>{const id=crypto.randomUUID();sessionStorage.setItem('beforeYouVisitId',id);return id;})();}
    catch{return Math.random().toString(36).slice(2)+Date.now().toString(36);}
  }

  async function logVisit(){
    try{await fetch('/api/visit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:visitSession(),path:state.route,latitude:state.visitorCoordinates?.latitude,longitude:state.visitorCoordinates?.longitude})});}catch{}
  }

  async function getTrace(id=null,exclude=null){
    const qs=id?`?id=${encodeURIComponent(id)}`:exclude?`?exclude=${encodeURIComponent(exclude)}`:'';
    const response=await fetch(`/api/found${qs}`,{cache:'no-store'});
    const data=await response.json();
    if(!response.ok||!data.ok) throw new Error(data?.error||'Nothing genuine has been found.');
    return data.trace;
  }


  function entryView(){
    return `<section class="page__grid">
      <aside class="rail"><div class="rail__head">FILE 01 / ENTRY</div><p>an old page. still open.</p><div class="rail__rule"></div>
        <div class="rail__row"><span>INDEX</span><b>OPEN</b></div><div class="rail__row"><span>ACCOUNTS</span><b>NONE</b></div><div class="rail__row"><span>REPLIES</span><b>NONE</b></div><div class="rail__row"><span>STATUS</span><b>ONLINE</b></div>
        <div class="rail__rule"></div><p class="red-copy">nothing here asks your name.</p>
      </aside>
      <section class="center entry">
        <div class="center__micro"><span data-glitch>BEFORE YOU / ENTRY</span><span>01 / 03</span></div>
        <div class="entry__hero">
          <div class="scribble scribble--a">read first.</div><div class="scribble scribble--b">someone was here.</div>
          <div class="entry__stack">
            <div class="entry__kicker">someone was here before you</div>
            <h1 class="entry__title" data-glitch>BEFORE <span>YOU</span></h1>
            <p class="entry__sub">a stranger left something here for the next stranger.</p>
            <p class="entry__line"><span>read it.</span> <b>then leave something of your own.</b></p>
            <button id="enterButton" class="enter" type="button">ENTER <span>→</span></button>
            <div class="enter__hint">the page will open slowly.</div>
          </div>
        </div>
        <div class="entry__lower">
          <div class="statbox"><small>ACCESS</small><strong>PUBLIC</strong></div>
          <div class="statbox"><small>LAST KNOWN REGION</small><strong id="entryRegion">${esc(state.visitorRegion)}</strong></div>
          <div class="statbox"><small>LAST SEEN</small><strong id="entrySeen">${esc(state.lastSeen)}</strong></div>
        </div>
      </section>
      <aside class="rail rail--right"><div class="rail__head">ABOUT</div><p>People leave notes here. Some are ordinary. Some are not.</p><div class="rail__rule"></div>
        <div class="rail__head">LAST KNOWN REGION</div><p id="regionPanel">${esc(state.visitorRegion)}</p><p>LAST SEEN: ${esc(state.lastSeen)}</p><p class="small-copy">region is approximate unless browser location permission was granted.</p>
      </aside>
    </section>`;
  }


  function foundView(trace, own = false) {
    const stamp = new Date(trace.createdAt || Date.now()).toLocaleTimeString([], {hour12:false});
    return `<section class="page__grid found-mode">
      <aside class="rail"><div class="rail__head">FILE 02 / FOUND</div><p>something was left here. it is not an archive.</p><div class="rail__rule"></div>
        <div class="rail__row"><span>STATE</span><b>${own?'YOURS':'OPEN'}</b></div><div class="rail__row"><span>ARCHIVE</span><b>NONE</b></div><div class="rail__row"><span>REPLY</span><b>NONE</b></div><div class="rail__row"><span>SIZE</span><b>${String(trace.text.length).padStart(5,'0')} CHR</b></div>
        <div class="rail__rule"></div><p class="red-copy">the note stays until you ask for another.</p>
      </aside>

      <section class="center found">
        <div class="center__micro"><span data-glitch>FILE 02 / FOUND</span><span>02 / 03</span></div>
        <div class="found__head"><div><h1>FOUND</h1><p>${own?'you left this here. this is the first thing you see after passing it.':'someone left this before you. read it before deciding what to leave.'}</p></div><div class="micro-stamp">${own?'YOU LEFT THIS HERE':'UNSORTED MATERIAL'} / ${esc(stamp)}</div></div>
        <div class="found__body">
          <div class="found__note-wrap">
            <div class="blood-scratch" aria-hidden="true"></div>
            <div class="scribble scribble--found-a">it was not empty.</div>
            <article class="trace-sheet ${own?'is-own':''}" id="traceSheet" aria-label="Found note">
              <div class="trace-sheet__bar"><span>${own?'YOU LEFT THIS HERE':'FOUND // UNSORTED MATERIAL'}</span><span>${esc(stamp)}</span></div>
              <div class="trace-sheet__message" id="traceText" tabindex="0">${text(trace.text)}</div>
              <div class="trace-sheet__foot"><span>PLAIN TEXT / ${String(trace.text.length).padStart(5,'0')} CHR</span><span class="trace-sheet__stamp">${own?'PASSED':'PRESENT'}</span></div>
            </article>
          </div>
          <div class="found__controls"><span class="control-label">found controls</span><button id="refreshFound" class="refresh-button" type="button">NEW NOTE ↻</button><a href="/leave" class="action-link" data-nav>LEAVE SOMETHING →</a></div>
        </div>
        <div class="found__foot"><span data-glitch>${own?'your note is here first. refresh when you are ready to see what comes next.':'the note stays. refresh when you want another one.'}</span><span>NO FADE / REFRESH TO REPLACE</span></div>
      </section>

      <aside class="rail rail--right"><div class="rail__head">DOCUMENT NOTES</div><p>Some messages are ordinary. Some are funny. Some are not.</p><div class="rail__rule"></div><p>Nothing on this page is a conversation.</p><p class="red-copy">do not assume the next note will be like this one.</p></aside>
    </section>`;
  }

  function leaveView() {
    return `<section class="page__grid">
      <aside class="rail"><div class="rail__head">FILE 03 / LEAVE</div><p>write something that can survive without your name attached to it.</p><div class="rail__rule"></div>
        <div class="rail__row"><span>NAME</span><b>NOT ASKED</b></div><div class="rail__row"><span>EMAIL</span><b>NOT ASKED</b></div><div class="rail__row"><span>LINKS</span><b>NO</b></div><div class="rail__row"><span>MAX</span><b>10,000</b></div>
        <div class="rail__rule"></div><p class="red-copy">once passed, you do not get it back from this page.</p>
      </aside>
      <section class="center leave">
        <div class="center__micro"><span data-glitch>FILE 03 / LEAVE</span><span>03 / 03</span></div>
        <div class="leave__head"><div><h1>LEAVE</h1><p>funny, boring, personal, strange. no name. no reply.</p></div><div class="micro-stamp">PLAIN TEXT / 10,000 MAX</div></div>
        <div class="leave__body">
          <section class="leave__composer" aria-label="Leave a note"><div class="composer__bar"><span>UNSORTED NOTE / 03</span><span id="charCount">0 / 10000</span></div><textarea id="noteInput" class="note-input" maxlength="10000" placeholder="write something here...\n\nanything worth leaving behind." spellcheck="true"></textarea><div class="composer__foot"><span>NO LINKS / NO PROMO / NO NAME</span><button id="passButton" class="pass-button" type="button">PASS →</button></div></section>
          <aside class="leave__aside"><div class="aside-title">BEFORE YOU / NOTICE</div><p><b>No profile.</b> Nothing here asks for your name.</p><p><b>Write normally.</b> A joke is fine. A confession is fine. A strange sentence is fine.</p><p><b>After PASS.</b> You are taken to FOUND and see your own note first.</p><p class="red-copy"><b>Then refresh.</b> The next note is someone else's.</p></aside>
        </div>
        <div class="leave__foot"><span id="leaveStatus">READY TO PASS</span><span>BEFORE YOU // NO PUBLIC REPLIES</span></div>
      </section>
      <aside class="rail rail--right"><div class="rail__head">LAST LINE</div><p>the next person will not know who wrote it.</p><div class="rail__rule"></div><p>that is the point.</p><div class="rail__rule"></div><p class="red-copy">do not write your name.</p></aside>
    </section>`;
  }

  async function render(route, options = {}) {
    state.route = route; activeNav();
    if (route === '/') {
      page.innerHTML = entryView(); bindEntry();
    } else if (route === '/found') {
      let trace;
      try { trace = await getTrace(options.id || null, options.id ? null : state.traceId); }
      catch (error) { page.innerHTML = foundEmptyView(error.message); bindFoundEmpty(); page.classList.add('page-enter'); return; }
      state.traceId = trace.id;
      page.innerHTML = foundView(trace, Boolean(options.own));
      bindFound(Boolean(options.own));
    } else if (route === '/leave') {
      page.innerHTML = leaveView(); bindLeave();
    } else { location.href = '/404'; return; }
    page.classList.remove('page-enter'); void page.offsetWidth; page.classList.add('page-enter');
  }

  function bindEntry() {
    const button = document.getElementById('enterButton');
    if (!button) return;
    button.addEventListener('click', async () => {
      button.disabled = true;
      if (window.beforeYouAudio) await window.beforeYouAudio.start();
      await navigate('/found');
    });
  }

  function foundEmptyView(message){return `<section class="page__grid"><aside class="rail"><div class="rail__head">FILE 02 / FOUND</div><p>there is nothing genuine here yet.</p></aside><section class="center found"><div class="center__micro"><span>FILE 02 / FOUND</span><span>02 / 03</span></div><div class="empty-found"><p class="empty-found__code">NO MATERIAL FOUND</p><h1>Nothing was left.</h1><p>${esc(message||'No genuine note is available yet.')}</p><div><a class="action-link" href="/leave" data-nav>LEAVE THE FIRST NOTE →</a></div></div></section><aside class="rail rail--right"><div class="rail__head">STATUS</div><p>waiting for a real note.</p></aside></section>`;}
  function bindFoundEmpty(){}

  function bindFound(own) {
    const refresh = document.getElementById('refreshFound');
    if (!refresh) return;
    refresh.addEventListener('click', async () => {
      refresh.disabled = true;
      effect('hard');
      document.body.classList.add('changing-note');
      await new Promise(resolve => setTimeout(resolve, 620));
      const trace = await getTrace(null, state.traceId);
      state.traceId = trace.id;
      page.innerHTML = foundView(trace, false);
      bindFound(false);
      page.classList.remove('page-enter'); void page.offsetWidth; page.classList.add('page-enter');
      document.body.classList.remove('changing-note');
      horror('ANOTHER NOTE / SAME PLACE');
    });
    setTimeout(() => effect(own ? 'hard' : 'hit'), 900);
  }

  function bindLeave() {
    const input = document.getElementById('noteInput');
    const count = document.getElementById('charCount');
    const button = document.getElementById('passButton');
    const status = document.getElementById('leaveStatus');
    if (!input || !count || !button) return;
    const update = () => count.textContent = `${input.value.length} / 10000`;
    input.addEventListener('input', update); update();
    input.focus({preventScroll:true});
    button.addEventListener('click', async () => {
      const message = input.value.trim();
      if (!message) { toast('write something first.'); return; }
      button.disabled = true; input.disabled = true; status.textContent = 'PASSING // PLEASE WAIT'; effect('hard');
      try {
        const response = await fetch('/api/trace', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({message})});
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data?.error || 'The note could not be passed.');
        try { sessionStorage.setItem('beforeYouOwnTrace', data.trace.id); } catch {}
        status.textContent = 'PASSED // OPENING FOUND';
        await navigate('/found', {id:data.trace.id, own:true});
      } catch (error) {
        input.disabled = false; button.disabled = false; status.textContent = 'PASS FAILED'; toast(error.message || 'the note did not make it through.');
      }
    });
  }

  async function navigate(target, options = {}) {
    if (state.navigating) return;
    state.navigating = true;
    transitionStatus.textContent = target === '/leave' ? 'opening leave file...' : target === '/found' ? 'loading found material...' : 'returning to entry...';
    transition.classList.add('is-active'); effect('flash');
    await new Promise(resolve => setTimeout(resolve, target === '/found' && options.own ? 900 : 680));
    const query = options.id ? `?id=${encodeURIComponent(options.id)}` : '';
    history.pushState({}, '', target + query);
    await render(target, options);
    await new Promise(resolve => setTimeout(resolve, 120));
    transition.classList.remove('is-active'); page.focus({preventScroll:true}); state.navigating = false;
  }

  document.addEventListener('click', event => {
    const link = event.target.closest('[data-nav]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('http')) return;
    event.preventDefault();
    if (href !== state.route && !state.navigating) navigate(href);
  });
  window.addEventListener('popstate', () => render(location.pathname));

  function protect() {
    const editable = target => target && ['TEXTAREA','INPUT','BUTTON'].includes(target.tagName);
    document.addEventListener('contextmenu', e => { if (!editable(e.target)) e.preventDefault(); });
    document.addEventListener('copy', e => { if (!editable(e.target)) { e.preventDefault(); horror('COPYING IS DISABLED HERE.'); } });
    document.addEventListener('cut', e => { if (!editable(e.target)) e.preventDefault(); });
    document.addEventListener('dragstart', e => { if (!editable(e.target)) e.preventDefault(); });
    document.addEventListener('keydown', e => {
      if (editable(e.target)) return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && ['c','s','u','p'].includes(key)) { e.preventDefault(); horror('THIS PAGE DOES NOT WANT TO BE COPIED.'); }
      if (e.key === 'F12' || ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i','j','c'].includes(key))) { e.preventDefault(); horror('NO-ONE NEEDS TO SEE THE BACK OF THIS PAGE.'); }
    });
    window.addEventListener('beforeprint', () => document.body.classList.add('print-block'));
  }

  async function bootSequence() {
    const steps = ['checking the old header...', 'opening the index...', 'reading unsorted material...', 'checking the connection...', 'done.'];
    for (let i=0;i<steps.length;i++) {
      bootStatus.textContent = steps[i]; bootBar.style.width = `${((i+1)/steps.length)*100}%`;
      await new Promise(resolve => setTimeout(resolve, 160 + Math.random()*120));
    }
    await new Promise(resolve => setTimeout(resolve, 220)); boot.classList.add('is-done');
  }

  async function init() {
    protect(); randomDisturb();
    const route = ['/', '/found', '/leave'].includes(location.pathname) ? location.pathname : '/';
    state.route = route;
    const ownId = new URL(location.href).searchParams.get('id');
    const own = route === '/found' && (() => { try { return sessionStorage.getItem('beforeYouOwnTrace') === ownId; } catch { return false; } })();
    const regionPromise = getVisitorRegion();
    await bootSequence();
    await render(route, {id:ownId, own});
    regionPromise.finally(() => {
      const region = document.getElementById('entryRegion');
      const panel = document.getElementById('regionPanel');
      const seen = document.getElementById('entrySeen');
      if (region) region.textContent = state.visitorRegion;
      if (panel) panel.textContent = `REGION: ${state.visitorRegion}`;
      if (seen) seen.textContent = state.lastSeen;
      logVisit();
    });
  }

  init();
})();
