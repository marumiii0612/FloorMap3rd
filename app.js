/* ROOMU prototype — data is entirely fictitious, browser-local and not synchronized. */
(() => {
  'use strict';

  const ROOMS = [
    {id:'101',floor:1,name:'大教室',capacity:40,people:25,uses:['study'],blocked:true},
    {id:'102',floor:1,name:'ゼミ室',capacity:16,people:2,uses:['study','lunch'],blocked:false},
    {id:'103',floor:1,name:'学生ラウンジ',capacity:24,people:20,uses:['study','lunch'],blocked:false},
    {id:'104',floor:1,name:'小教室',capacity:18,people:0,uses:['study','lunch','interview'],blocked:false},
    {id:'105',floor:1,name:'自習スペース',capacity:28,people:10,uses:['study'],blocked:false},
    {id:'106',floor:1,name:'個別ブース',capacity:6,people:1,uses:['study','interview'],blocked:false},
    {id:'201',floor:2,name:'講義室',capacity:40,people:35,uses:['study'],blocked:true},
    {id:'202',floor:2,name:'自習教室',capacity:28,people:7,uses:['study'],blocked:false},
    {id:'203',floor:2,name:'面接ブース',capacity:8,people:0,uses:['study','interview'],blocked:false},
    {id:'204',floor:2,name:'多目的教室',capacity:24,people:13,uses:['study','lunch'],blocked:false},
    {id:'205',floor:2,name:'演習室',capacity:32,people:28,uses:['study'],blocked:false},
    {id:'206',floor:2,name:'セミナー室',capacity:12,people:1,uses:['study','interview'],blocked:false},
    {id:'301',floor:3,name:'大教室',capacity:44,people:23,uses:['study'],blocked:false},
    {id:'302',floor:3,name:'個室ブース',capacity:6,people:0,uses:['study','interview'],blocked:false},
    {id:'303',floor:3,name:'グループ学習室',capacity:24,people:8,uses:['study'],blocked:false},
    {id:'304',floor:3,name:'フリースペース',capacity:20,people:15,uses:['study','lunch'],blocked:false},
    {id:'305',floor:3,name:'講義室',capacity:36,people:29,uses:['study'],blocked:true},
    {id:'306',floor:3,name:'ミーティング室',capacity:10,people:2,uses:['study','interview'],blocked:false},
  ];

  const BUILDING = {lat:35.7092851,lon:139.7200875,radiusMeters:100};
  const STORAGE_KEY = 'roomu-door-qr-session-v2';
  const SAMPLE_END_TIMES = ['10:30','12:10','14:20','16:00','17:40','19:20'];
  const USE_LABELS = {study:'自習',lunch:'昼食',interview:'オンライン面接'};
  const STATUS_LABELS = {free:'空いている',medium:'やや混雑',crowded:'混雑',blocked:'授業中（想定）'};
  const $ = (id) => document.getElementById(id);
  let selectedFloor = 1;
  let selectedFilter = 'all';
  let activeRoomId = null;
  let showQR = false;
  let reminderOpen = false;
  let geoWatchId = null;
  let geoLastUpdate = 0;
  let geoDefinitelyOutside = false;
  let gpsStatus = '位置情報：未使用';
  const initialParams = new URLSearchParams(location.search);
  let fromQR = initialParams.get('via') === 'door' && initialParams.get('action') === 'checkin';
  let scanFeedback = null;
  let toastTimer = null;
  let session = loadSession();

  function loadSession(){
    try {
      const val = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (val && ROOMS.some((r) => r.id === val.roomId) && Number.isFinite(val.startedAt)) return val;
    } catch (e) { /* A blocked storage environment can still display the demo. */ }
    return null;
  }
  function saveSession(){
    try { if (session) localStorage.setItem(STORAGE_KEY,JSON.stringify(session)); else localStorage.removeItem(STORAGE_KEY); }
    catch (e) { notifyToast('このブラウザは保存に対応していません。ページ更新時に利用状態が消える場合があります。'); }
  }
  function roomFor(id){return ROOMS.find((r) => r.id === id);}
  function occupancy(room){return Math.min(room.capacity,room.people+(session?.roomId===room.id?1:0));}
  function status(room){
    if(room.blocked) return 'blocked';
    const ratio = occupancy(room)/room.capacity;
    return ratio <= .3 ? 'free' : ratio <= .7 ? 'medium' : 'crowded';
  }
  function percent(room){return Math.round(100*occupancy(room)/room.capacity);}
  function matches(room){return selectedFilter === 'all' || room.uses.includes(selectedFilter);}
  function floorRooms(){return ROOMS.filter((r) => r.floor===selectedFloor);}
  function formatTime(ts){return new Date(ts).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'});}
  function getNextReminder(after){
    const d = new Date(after);
    for(let day=0;day<2;day++){
      for(const time of SAMPLE_END_TIMES){
        const [h,m] = time.split(':').map(Number);
        const candidate = new Date(d);
        candidate.setDate(d.getDate()+day);
        candidate.setHours(h,m-5,0,0);
        if(candidate.getTime()>after+1000) return candidate.getTime();
      }
    }
    return after+100*60*1000;
  }
  function notifyToast(msg){
    const el=$('toast');el.textContent=msg;el.hidden=false;
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,4000);
  }
  function renderMetrics(){
    const shown=floorRooms().filter(matches);
    $('availableCount').textContent=shown.filter((r)=>!r.blocked && occupancy(r)<r.capacity).length;
    $('seatsCount').textContent=shown.reduce((a,r)=>a+(r.blocked?0:r.capacity-occupancy(r)),0);
    const r=session&&roomFor(session.roomId);
    $('myStatus').textContent=r?`${r.id}教室を利用中`:'未入室';
    $('myStatusSub').textContent=r?`入室 ${formatTime(session.startedAt)} · 退室ボタンで終了`:'入室にはドアのQRコードを読み取ってください';
  }
  function renderMap(){
    $('floorTitle').textContent=`${selectedFloor}F`;
    $('floorMap').innerHTML=floorRooms().map((r)=>{
      const st=status(r);
      const dim=!matches(r)?' aria-disabled="true"':'';
      return `<button class="map-room status-${st}" type="button" data-room="${r.id}" ${dim} aria-label="${r.id}教室 ${r.name}、${STATUS_LABELS[st]}、${occupancy(r)}人 / ${r.capacity}人"><span class="room-top"><span class="room-num">${r.id}</span><span class="icon-arrow">↗</span></span><span class="room-kind">${r.name}</span><span class="room-occ">${r.blocked?'利用不可':`${occupancy(r)} / ${r.capacity} 人`}</span></button>`;
    }).join('');
    document.querySelectorAll('[data-floor]').forEach((btn)=>{
      const yes=Number(btn.dataset.floor)===selectedFloor;
      btn.classList.toggle('active',yes);btn.setAttribute('aria-pressed',String(yes));
    });
  }
  function renderList(){
    const shown=floorRooms().filter(matches);
    $('roomListCount').textContent=`${shown.length}室`;
    $('roomList').innerHTML=shown.length?shown.map((r)=>{
      const st=status(r);
      const cl=r.blocked?'blocked':percent(r)>70?'crowded':percent(r)>30?'medium':'';
      return `<button class="room-card" type="button" data-room="${r.id}" aria-label="${r.id}教室の詳細を見る"><span class="room-card-top"><span class="room-card-number">${r.id}</span><span class="room-card-indicator indicator-${st}">${STATUS_LABELS[st]}</span></span><span class="room-card-name">${r.name}</span><span class="occupancy-track"><span class="${cl}" style="width:${percent(r)}%"></span></span><span class="room-card-bottom"><span><b>${occupancy(r)}</b> / ${r.capacity} 人 ${r.blocked?'（授業中）':''}</span><span class="arrow">↗</span></span></button>`;
    }).join(''):'<div class="empty-state">この目的に対応する教室は、このフロアにはありません。別の階を選んでください。</div>';
  }
  function renderSession(){
    const el=$('sessionPanel');
    if(!session){el.innerHTML='<div class="session-empty"><div class="session-emoji">⌁</div><div><b>まだ入室していません</b><span>教室の入口にあるQRコードを読み取ると、自動で入室登録されます。</span></div></div>';return;}
    const r=roomFor(session.roomId);
    el.innerHTML=`<div class="session-live"><div class="session-details"><b>✓ QRチェックイン中</b><div class="session-room">${r.id}教室 · ${r.name}</div><span>${formatTime(session.startedAt)}に入室／次の利用確認：${formatTime(session.nextReminderAt||getNextReminder(Date.now()))}</span></div><button type="button" id="sessionCheckout">退室する ↗</button></div>`;
    $('sessionCheckout').addEventListener('click',()=>checkout('退室しました。ご利用ありがとうございました。'));
  }
  function render(){renderMetrics();renderMap();renderList();renderSession();if(activeRoomId && !$('roomModal').hidden) renderRoomBody();}
  function setFloor(f){selectedFloor=f;render();}
  function setFilter(f){selectedFilter=f;
    document.querySelectorAll('[data-filter]').forEach((btn)=>{const yes=btn.dataset.filter===f;btn.classList.toggle('active',yes);btn.setAttribute('aria-pressed',String(yes));});
    render();
  }
  function openModal(id){$(id).hidden=false;document.body.style.overflow='hidden';}
  function closeModal(id){$(id).hidden=true;if([...document.querySelectorAll('.modal-backdrop')].every((el)=>el.hidden)) document.body.style.overflow='';}
  function selectRoom(id){
    const r=roomFor(id);if(!r)return;
    activeRoomId=id;showQR=false;selectedFloor=r.floor;
    render();renderRoomBody();openModal('roomModal');
  }
  // Called only when a room-specific door QR deep link is opened.
  // Demo-only: without server-side verification, a copied link behaves exactly like a scan.
  function checkinFromDoor(id){
    const r = roomFor(id);
    if(!r) return;
    if(session?.roomId===id){
      scanFeedback={roomId:id,type:'info',message:`${id}教室はすでに入室登録されています。再読み取りしても人数は増えません。`};
      render();return;
    }
    if(r.blocked){
      scanFeedback={roomId:id,type:'error',message:'この教室は授業中（想定）のため、入室登録できません。'};
      render();return;
    }
    if(occupancy(r)>=r.capacity){
      scanFeedback={roomId:id,type:'error',message:'この教室は満員（デモ値）のため、入室登録できません。'};
      render();return;
    }
    const previous=session?.roomId;
    session={roomId:id,startedAt:Date.now(),nextReminderAt:getNextReminder(Date.now()),gpsOutsideSince:null,source:'door-qr'};
    saveSession();render();
    const msg=previous ? `${previous}教室を退室し、${id}教室にQRで入室登録しました。` : `${id}教室にQRで入室登録しました。`;
    scanFeedback={roomId:id,type:'success',message:msg+'（この端末のみ）'};
    notifyToast(msg);
  }
  function checkout(message){session=null;saveSession();render();closeModal('reminderModal');closeModal('roomModal');notifyToast(message);}
  function roomDescription(r){if(r.blocked)return '授業中を想定したサンプルです。入室できません。'; if(r.uses.includes('interview'))return '面接・オンライン会議にも対応する想定のスペースです。実際の使用可否は管理者の許可が必要です。';if(r.uses.includes('lunch'))return '昼食を取れる想定のスペースです。実際の飲食ルールを確認してください。';return '自習向けスペースを想定しています。実際の使用可否は大学の案内に従ってください。';}
  function renderRoomBody(){
    const r=roomFor(activeRoomId);if(!r)return;
    const st=status(r);
    const myRoom=session?.roomId===r.id;
    const scannedHere=fromQR && scanFeedback?.roomId===r.id;
    const feedback=scannedHere?`<div class="scan-feedback scan-${scanFeedback.type}" role="status"><b>${scanFeedback.type==='success'?'✓ QR読み取り完了':scanFeedback.type==='error'?'! 入室登録できませんでした':'✓ 登録済み'}</b><span>${scanFeedback.message}</span></div>`:'';
    $('roomModalBody').innerHTML=`<div class="room-heading"><h2 id="dialogTitle">${r.id} 教室</h2><span class="room-card-indicator indicator-${st}">${STATUS_LABELS[st]}</span></div>
      <div class="room-description">${r.floor}F · ${r.name}</div>
      ${feedback}
      <div class="stat-strip"><div><span>利用人数（デモ）</span><strong>${occupancy(r)} 人</strong></div><div><span>定員（仮）</span><strong>${r.capacity} 人</strong></div><div><span>混雑率</span><strong>${percent(r)}%</strong></div></div>
      <div class="tags">${r.uses.map((u)=>`<span>✓ ${USE_LABELS[u]}</span>`).join('')}</div>
      <p class="modal-note">${roomDescription(r)}</p>
      ${myRoom?'<div class="modal-actions"><button type="button" class="primary-btn" id="checkoutBtn">この教室から退室する</button></div>':'<div class="door-callout"><b>▦ 入室するには</b><p>教室のドアに掲示されたQRコードをスマートフォンのカメラで読み取ってください。リンクを開くと自動で入室登録されます。<strong>マップから直接入室することはできません。</strong></p></div>'}
      ${session&&!myRoom?`<p class="modal-note">現在${session.roomId}教室を利用中です。別の教室のドアQRを読み取ると、前の教室から自動退室して移動します。</p>`:''}
      <div class="qr-section"><div class="qr-title">▦ 管理者向け · ドア掲示用QRコード</div><p>このQRコードを教室の入口に印刷・掲示する想定です。読み取ってリンクを開くと<b>${r.id}教室の入室登録</b>が実行されます。</p>
      <button type="button" class="qr-toggle" id="qrToggle">${showQR?'QRコードを閉じる':'この教室のQRコードを表示'} ↗</button>
      <div class="qr-reveal" id="qrReveal" ${showQR?'':'hidden'}><canvas id="qrCanvas" width="280" height="280" aria-label="${r.id}教室のドアQRコード"></canvas><div class="qr-code-label">ROOM ${r.id} / ${r.floor}F</div><small>${location.protocol==='file:'?'このファイルをHTTPSで公開するとスマートフォンで読み取れるQRになります。':'公開URLに基づくリンクです。転送されたQRからも入室できるデモです。'}</small><button class="copy-btn" type="button" id="copyRoomLink">ドアQRのリンクをコピー</button></div>
      <a class="poster-link" href="./posters.html" target="_blank" rel="noopener">掲示用ポスターをまとめて作成・印刷 ↗</a></div>`;
    $('checkoutBtn')?.addEventListener('click',()=>checkout('退室しました。'));
    $('qrToggle').addEventListener('click',()=>{showQR=!showQR;renderRoomBody();});
    if(showQR){renderQR(r.id);$('copyRoomLink').addEventListener('click',()=>copyLink(r.id));}
  }
  function roomLink(id){const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('room',id);url.searchParams.set('via','door');url.searchParams.set('action','checkin');return url.toString();}
  function renderQR(id){
    const canvas=$('qrCanvas'); if(!canvas)return;
    if(typeof window.RoomuQR !== 'function'){canvas.replaceWith(document.createTextNode('QR生成ライブラリを読み込めませんでした。'));return;}
    try{
      const code=new window.RoomuQR(-1,1);code.addData(roomLink(id));code.make();
      const size=code.getModuleCount(),ctx=canvas.getContext('2d');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,280,280);
      const cell=232/size;ctx.fillStyle='#143b48';
      for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(code.isDark(y,x)){
        const x0=Math.round(24+x*cell),y0=Math.round(24+y*cell),x1=Math.round(24+(x+1)*cell),y1=Math.round(24+(y+1)*cell);
        ctx.fillRect(x0,y0,x1-x0,y1-y0);
      }
    } catch(e){notifyToast('QRコードの生成に失敗しました。');}
  }
  async function copyLink(id){
    try{await navigator.clipboard.writeText(roomLink(id));notifyToast('教室のURLをコピーしました。');}
    catch(e){notifyToast('コピーできませんでした。URLをブラウザのアドレス欄から共有してください。');}
  }
  function showReminder(){
    if(!session || reminderOpen) return;
    reminderOpen=true;
    const room=roomFor(session.roomId);
    $('reminderDescription').textContent=`${room.id}教室を利用中です。まだ利用している場合は継続を選んでください。`;
    openModal('reminderModal');
    if('Notification' in window && Notification.permission==='granted'){
      try{new Notification('ROOMU：まだ利用していますか？',{body:`${room.id}教室の利用継続を確認してください。`});}catch(e){}
    }
  }
  function checkReminders(){
    if(!session)return;
    if(Date.now()>=session.nextReminderAt){session.nextReminderAt=getNextReminder(Date.now()+60*1000);saveSession();renderSession();showReminder();}
  }
  function distanceMeters(lat1,lon1,lat2,lon2){
    const rad=Math.PI/180;const a=Math.sin((lat2-lat1)*rad/2)**2+Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin((lon2-lon1)*rad/2)**2;
    return 6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }
  function handleGeo(pos){
    const {latitude,longitude,accuracy}=pos.coords;
    const distance=Math.round(distanceMeters(latitude,longitude,BUILDING.lat,BUILDING.lon));
    geoLastUpdate=Date.now();
    // Avoid marking 'outside' when the reported uncertainty overlaps the 100 m geofence.
    geoDefinitelyOutside=Number.isFinite(accuracy) && accuracy<=150 && distance>BUILDING.radiusMeters+accuracy;
    const inside=Number.isFinite(accuracy) && accuracy<=150 && distance+accuracy<=BUILDING.radiusMeters;
    gpsStatus=`位置情報：建物中心から約${distance}m（測位誤差 ±${Math.round(accuracy)}m）${geoDefinitelyOutside?' / 範囲外':inside?' / 範囲内':' / 判定保留'}`;
    $('gpsStatus').textContent=gpsStatus;
    if(session){
      if(geoDefinitelyOutside && !session.gpsOutsideSince){session.gpsOutsideSince=Date.now();saveSession();notifyToast('3号館の範囲外を検知しました。30分継続すると自動退室します（画面を開いている間のみ）。');}
      if(!geoDefinitelyOutside && session.gpsOutsideSince){session.gpsOutsideSince=null;saveSession();}
      checkOutsideTimer();
    }
  }
  function checkOutsideTimer(){
    if(!session || !session.gpsOutsideSince || !geoDefinitelyOutside || Date.now()-geoLastUpdate>120000)return;
    if(Date.now()-session.gpsOutsideSince>=30*60000) checkout('GPSの範囲外が30分間続いたため、自動退室しました（デモ）。');
  }
  function startGPS(){
    if(!('geolocation' in navigator)){notifyToast('このブラウザは位置情報に対応していません。');return;}
    if(!window.isSecureContext){notifyToast('GPS利用にはHTTPSまたはlocalhostで開く必要があります。');return;}
    if(geoWatchId!==null){notifyToast('位置情報をすでに確認しています。');return;}
    gpsStatus='位置情報：許可と測位を確認中…';$('gpsStatus').textContent=gpsStatus;
    geoWatchId=navigator.geolocation.watchPosition(handleGeo,(err)=>{gpsStatus=`位置情報：取得できません（${err.code===1?'アクセスが許可されていません':'測位できませんでした'}）`;$('gpsStatus').textContent=gpsStatus;},{enableHighAccuracy:true,maximumAge:30000,timeout:15000});
  }
  function runOutsideDemo(){
    if(!session){notifyToast('まず教室に入室してください。');return;}
    // Explicit test action: simulates, but does not claim to have received, GPS observations.
    checkout('テスト完了：範囲外が30分継続した想定で自動退室しました。');closeModal('settingsModal');
  }
  function setup(){
    document.querySelectorAll('[data-floor]').forEach((b)=>b.addEventListener('click',()=>setFloor(Number(b.dataset.floor))));
    document.querySelectorAll('[data-filter]').forEach((b)=>b.addEventListener('click',()=>setFilter(b.dataset.filter)));
    document.addEventListener('click',(e)=>{const button=e.target.closest?.('[data-room]');if(button)selectRoom(button.dataset.room);});
    $('settingsBtn').addEventListener('click',()=>{ $('gpsStatus').textContent=gpsStatus;openModal('settingsModal');});
    $('closeRoom').addEventListener('click',()=>{closeModal('roomModal');fromQR=false;});
    $('closeRoom').addEventListener('click',()=>{const u=new URL(location.href);if(u.searchParams.has('room')){u.search='';history.replaceState(null,'',u.toString());}});
    $('closeSettings').addEventListener('click',()=>closeModal('settingsModal'));
    document.querySelectorAll('.modal-backdrop').forEach((backdrop)=>backdrop.addEventListener('click',(e)=>{if(e.target===backdrop && backdrop.id!=='reminderModal')closeModal(backdrop.id);}));
    document.addEventListener('keydown',(e)=>{if(e.key==='Escape'){if(!$('reminderModal').hidden)return;for(const id of ['roomModal','settingsModal'])if(!$(id).hidden)closeModal(id);}});
    $('gpsBtn').addEventListener('click',startGPS);
    $('notificationBtn').addEventListener('click',async()=>{
      if(!('Notification' in window)){$('notificationStatus').textContent='通知：このブラウザでは対応していません';return;}
      if(!window.isSecureContext){$('notificationStatus').textContent='通知：HTTPSで開いてください';return;}
      try{const p=await Notification.requestPermission();$('notificationStatus').textContent=`通知：${p==='granted'?'許可されました':p==='denied'?'拒否されています':'未許可'}`;}
      catch(e){$('notificationStatus').textContent='通知：利用できません';}
    });
    $('testOutside').addEventListener('click',runOutsideDemo);
    $('testReminder').addEventListener('click',()=>{if(!session){notifyToast('まず教室に入室してください。');return;}closeModal('settingsModal');showReminder();});
    $('resetDemo').addEventListener('click',()=>{session=null;saveSession();render();closeModal('settingsModal');notifyToast('この端末の利用記録をリセットしました。');});
    $('continueBtn').addEventListener('click',()=>{reminderOpen=false;if(session){session.nextReminderAt=getNextReminder(Date.now()+60*1000);saveSession();renderSession();}closeModal('reminderModal');notifyToast('利用を継続しました。');});
    $('leaveFromReminder').addEventListener('click',()=>{reminderOpen=false;checkout('利用を終了しました。');});
    $('helpBtn').addEventListener('click',()=>{notifyToast('①空き教室を探す → ②教室ドアのQRをスマホで読み取る → ③リンクを開くと入室登録 → ④退室ボタンで終了。');});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){checkReminders();checkOutsideTimer();}});
    window.addEventListener('storage',(e)=>{if(e.key===STORAGE_KEY){session=loadSession();render();}});
    window.setInterval(()=>{checkReminders();checkOutsideTimer();},30000);
    render();
    const queryId=new URLSearchParams(location.search).get('room');
    if(queryId && roomFor(queryId)){
      if(fromQR) checkinFromDoor(queryId);
      selectRoom(queryId);
    }
  }
  setup();
})();