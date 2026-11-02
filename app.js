/** 睡眠日誌 v1.0.3 (2026-11-02) | © 2021–2026 Dobhar-chú
 * Firebase Authentication + Firestore。睡眠・服薬の内容は localStorage に保存しない。
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, sendEmailVerification,
  sendPasswordResetEmail, reload, getIdToken,
  verifyBeforeUpdateEmail, EmailAuthProvider, reauthenticateWithCredential
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  getFirestore, doc, collection, getDoc, getDocs, setDoc, deleteDoc,
  query, where, documentId, writeBatch, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCd8IC-eFermCAQgFqW8z1qbUdZkhB3wcU',
  authDomain: 'sleep-diary-2c917.firebaseapp.com',
  projectId: 'sleep-diary-2c917',
  storageBucket: 'sleep-diary-2c917.firebasestorage.app',
  messagingSenderId: '796411304901',
  appId: '1:796411304901:web:6fe8bb6b84fb2950ffc9ac'
};
const app=initializeApp(firebaseConfig);
const auth=getAuth(app), db=getFirestore(app);
auth.languageCode='ja';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const EARLIEST='1900-01-01'; // UIの年月制限ではなく、入力の妥当性を確認するための技術的下限

const themes={
 blue:{name:'ネイビー',accent:'#49679d',soft:'#eaf0f9',sleep:'#49679d',rest:'#a6b9d9'},
 green:{name:'セージ',accent:'#56806d',soft:'#eaf4ee',sleep:'#56806d',rest:'#accdb8'},
 lavender:{name:'ラベンダー',accent:'#7b6aab',soft:'#f1ecfa',sleep:'#7b6aab',rest:'#c2b5df'},
 rose:{name:'ローズ',accent:'#a96973',soft:'#fbf0f1',sleep:'#a96973',rest:'#e7b7be'},
 sand:{name:'サンド',accent:'#9a7955',soft:'#f7f0e7',sleep:'#9a7955',rest:'#d7c0a5'},
 gray:{name:'グレー',accent:'#586d7a',soft:'#edf2f5',sleep:'#586d7a',rest:'#b0c1cb'},
 ocean:{name:'クリアブルー',accent:'#1757a6',soft:'#eaf4ff',sleep:'#1757a6',rest:'#96bee8'},
 teal:{name:'ティール',accent:'#006b66',soft:'#e6f7f4',sleep:'#006b66',rest:'#89c4bc'},
 plum:{name:'プラム',accent:'#6e3f87',soft:'#f6edfa',sleep:'#6e3f87',rest:'#c0a3d0'},
 orange:{name:'ウォームオレンジ',accent:'#98520b',soft:'#fff3e4',sleep:'#98520b',rest:'#e3b480'},
 sky:{name:'スカイ',accent:'#17648e',soft:'#ecf9ff',sleep:'#17648e',rest:'#9bcbe5'},
 monochrome:{name:'モノクロ',accent:'#333d48',soft:'#f0f2f4',sleep:'#333d48',rest:'#bac0c6'}
};
const blankSettings=()=>({name:'',habitBed:'23:00',habitWake:'07:00',theme:'blue',firstMonth:''});
function dateString(y,m,d){return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`}
function iso(d){return dateString(d.getFullYear(),d.getMonth()+1,d.getDate())}
function time(i){return `${String(Math.floor(i/2)).padStart(2,'0')}:${i%2?'30':'00'}`}
function idx(t){let a=(t||'00:00').split(':').map(Number);return a[0]*2+a[1]/30}
function monthParts(month){return month.split('-').map(Number)}
function weekday(y,m,d){return ['日','月','火','水','木','金','土'][new Date(y,m-1,d).getDay()]}
function nextDay(key){const d=new Date(`${key}T12:00:00`);d.setDate(d.getDate()+1);return iso(d)}
function freshDay(){return {slots:Array(48).fill(''),markers:[],wakeSleepiness:'',daySleepiness:'',note:'',weight:null}}
const state={month:iso(new Date()).slice(0,7),selected:iso(new Date()),settings:blankSettings(),days:{},medicines:[],loadedMonths:new Set()};
let selectedMode='sleep',analysisView='daily',currentUser=null, sessionEpoch=0, deletedMedicineIds=new Set(), busy=false, verifyTimer=null, checkingVerification=false;
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(window._toastTimer);window._toastTimer=setTimeout(()=>el.classList.remove('show'),3600)}
function notice(msg){$('#auth-notice').textContent=msg;$('#auth-notice').classList.add('show')}
function errMsg(e){
 const codes={
 'auth/invalid-credential':'メールアドレスまたはパスワードをご確認ください。',
 'auth/wrong-password':'メールアドレスまたはパスワードをご確認ください。',
 'auth/email-already-in-use':'このメールアドレスは既に登録されています。',
 'auth/invalid-email':'正しいメールアドレスを入力してください。',
 'auth/weak-password':'パスワードは6文字以上にしてください。',
 'auth/too-many-requests':'試行回数が多いため、しばらくしてからお試しください。',
 'auth/requires-recent-login':'もう一度ログインしてから操作してください。',
 'auth/unauthorized-domain':'現在ログインできません。運営者へお問い合わせください。',
 'auth/network-request-failed':'インターネット接続を確認してください。',
 'permission-denied':'記録の保存ができませんでした。ログイン状態をご確認ください。',
 'unavailable':'通信できませんでした。接続を確認して再度お試しください。'
 };
 return codes[e?.code]||'操作を完了できませんでした。再度お試しください。';
}
async function action(btn,run){if(busy)return;busy=true;const old=btn?.textContent;if(btn){btn.disabled=true;btn.textContent='処理中…'}try{await run()}catch(e){console.error('睡眠日誌操作エラー',e);toast(errMsg(e))}finally{busy=false;if(btn){btn.disabled=false;btn.textContent=old}}}
function view(which){if(which==='verify-view')startAutoVerification();else stopAutoVerification();for(const name of ['auth-view','verify-view','app-view','loading-screen'])$('#'+name).classList.toggle('site-hidden',name!==which);$('#logout-button').classList.toggle('site-hidden',which!=='app-view')}
// 外部ブラウザや別端末で認証しても、開いているアプリが自動検知する。
function stopAutoVerification(){if(verifyTimer){clearInterval(verifyTimer);verifyTimer=null}}
function startAutoVerification(){stopAutoVerification();verifyTimer=setInterval(()=>{if(document.visibilityState==='visible')refreshVerificationSilently()},4500)}
async function refreshVerificationSilently(){
 if(checkingVerification || !auth.currentUser || $('#verify-view').classList.contains('site-hidden'))return;
 checkingVerification=true;
 try{await reload(auth.currentUser);await getIdToken(auth.currentUser,true);
   if(auth.currentUser.emailVerified){stopAutoVerification();await accountState(auth.currentUser);toast('メール認証が完了しました')}}
 catch(e){console.warn('メール認証自動確認',e)}
 finally{checkingVerification=false}
}
window.addEventListener('focus',()=>{refreshVerificationSilently()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshVerificationSilently()});
function userDoc(){return doc(db,'users',currentUser.uid)}
function dayRef(key){return doc(db,'users',currentUser.uid,'days',key)}
function medRef(key){return doc(db,'users',currentUser.uid,'medications',key)}
function assertSession(){if(!currentUser||!currentUser.emailVerified)throw new Error('not signed in')}
function normalDay(key){const a=state.days[key];return a?{...freshDay(),...a,weight:validWeight(a.weight),slots:Array.from({length:48},(_,i)=>['sleep','rest'].includes(a.slots?.[i])?a.slots[i]:''),markers:(a.markers||[]).filter(x=>Number.isInteger(x.slot)&&x.slot>=0&&x.slot<48&&['med','bed','wake','meal'].includes(x.type))}:freshDay()}
function validWeight(v){return typeof v==='number'&&Number.isFinite(v)&&v>=0.1&&v<=500&&Math.abs(v*10-Math.round(v*10))<0.00001?Math.round(v*10)/10:null}
function dayData(key){return state.days[key]??(state.days[key]=freshDay())}
async function loadMonth(month){
 assertSession();if(state.loadedMonths.has(month))return;
 const uid=currentUser.uid;
 const q=query(collection(db,'users',uid,'days'),where(documentId(),'>=',`${month}-01`),where(documentId(),'<=',`${month}-31`));
 const snap=await getDocs(q);if(uid!==currentUser?.uid)return;
 snap.docs.forEach(d=>{state.days[d.id]={...freshDay(),...d.data()}});state.loadedMonths.add(month);
}
async function loadInitial(){
 assertSession();const uid=currentUser.uid;
 const [settingsSnap,medsSnap]=await Promise.all([getDoc(userDoc()),getDocs(collection(db,'users',uid,'medications'))]);
 if(uid!==currentUser?.uid)return;
 state.settings={...blankSettings(),...(settingsSnap.exists()?settingsSnap.data():{})};
 if(/^\d{4}-(0[1-9]|1[0-2])$/.test(state.settings.firstMonth||''))state.month=state.settings.firstMonth;
 state.medicines=medsSnap.docs.map(d=>({id:d.id,...d.data()}));deletedMedicineIds.clear();
 state.days={};state.loadedMonths.clear();
 await loadMonth(state.month);
 applyTheme();renderChart();renderInput();renderSettings();renderAnalysis();
}
async function persistDay(key){assertSession();const item=normalDay(key);await setDoc(dayRef(key),{...item,updatedAt:serverTimestamp()});}
async function persistSettings(){assertSession();const {name,habitBed,habitWake,theme,firstMonth}=state.settings;await setDoc(userDoc(),{name,habitBed,habitWake,theme,firstMonth,updatedAt:serverTimestamp()},{merge:true});}
async function accountState(u){
 const epoch=++sessionEpoch;
 currentUser=u;
 if(!u){view('auth-view');return}
 view('loading-screen');
 try{await reload(u);await getIdToken(u,true)}catch(e){console.warn('refresh auth',e)}
 if(epoch!==sessionEpoch)return;
 if(!u.emailVerified){$('#verify-email-value').textContent=u.email||'';view('verify-view');return}
 try{await loadInitial();if(epoch!==sessionEpoch)return;
   $('#account-email').textContent=u.email||'';view('app-view');
 }catch(e){if(epoch!==sessionEpoch)return;console.error(e);notice(errMsg(e));view('auth-view');}
}
onAuthStateChanged(auth,accountState);
function verificationActionSettings(){return {url:window.location.origin+window.location.pathname,handleCodeInApp:false}}
async function register(){const email=$('#auth-email').value.trim(),pwd=$('#auth-password').value;if(!email||pwd.length<6){notice('メールアドレスと6文字以上のパスワードを入力してください。');return}
 await action($('#register-button'),async()=>{const {user}=await createUserWithEmailAndPassword(auth,email,pwd);await sendEmailVerification(user,verificationActionSettings());notice('確認メールを送信しました。メール内のリンクで認証してください。');});}
async function login(){const email=$('#auth-email').value.trim(),pwd=$('#auth-password').value;if(!email||!pwd){notice('メールアドレスとパスワードを入力してください。');return}
 await action($('#login-button'),async()=>{await signInWithEmailAndPassword(auth,email,pwd);$('#auth-password').value='';$('#auth-notice').classList.remove('show')});}
async function passwordResetFromAuth(){const email=$('#auth-email').value.trim();if(!email){notice('先にメールアドレスを入力してください。');return}
 await action($('#reset-password-button'),async()=>{await sendPasswordResetEmail(auth,email);notice('アカウントが存在する場合、再設定用メールが送信されます。')});}
async function resendVerification(){if(!auth.currentUser)return;await action($('#resend-verified'),async()=>{await sendEmailVerification(auth.currentUser,verificationActionSettings());toast('確認メールを送信しました')});}
async function changeEmail(){const email=$('#new-email').value.trim(),pwd=$('#reconfirm-password').value;
 if(!email||!pwd){toast('新メールアドレスと現在のパスワードを入力してください');return}
 if(email===currentUser.email){toast('現在と同じメールアドレスです');return}
 await action($('#change-email'),async()=>{
   const credential=EmailAuthProvider.credential(currentUser.email,pwd);
   await reauthenticateWithCredential(currentUser,credential);
   await verifyBeforeUpdateEmail(currentUser,email);
   $('#reconfirm-password').value='';$('#new-email').value='';
   toast('新しいメールアドレスへ確認リンクを送りました。確認後に変更されます。');
 });
}
async function passwordResetSigned(){if(!currentUser?.email)return;
 await action($('#reset-signed-password'),async()=>{await sendPasswordResetEmail(auth,currentUser.email);toast('登録メールアドレスへ再設定リンクを送信しました')});}
async function reloadEmailStatus(){if(!currentUser)return;await action($('#send-verification-settings'),async()=>{await sendEmailVerification(currentUser,verificationActionSettings());toast('メール確認リンクを送信しました')});}

function applyTheme(){const t=themes[state.settings.theme]||themes.blue;for(const [key,val] of Object.entries({'--accent':t.accent,'--soft':t.soft,'--sleep':t.sleep,'--rest':t.rest}))document.documentElement.style.setProperty(key,val)}
function isHabit(i){let b=idx(state.settings.habitBed),w=idx(state.settings.habitWake);return b===w?false:b<w?i>=b&&i<w:i>=b||i<w}
function markerSVG(type){const paths={med:'<circle cx="10" cy="10" r="7.1"/><circle cx="10" cy="10" r="3.3"/>',bed:'<path d="M10 3 L17 16 H3 Z"/>',wake:'<path d="M3 4 H17 L10 17 Z"/>',meal:'<rect x="3" y="3" width="14" height="14"/>'};const names={med:'服薬',bed:'就寝',wake:'起床',meal:'食事'};return paths[type]?`<svg class="marker-icon" viewBox="0 0 20 20" role="img" aria-label="${names[type]}">${paths[type]}</svg>`:''}
function printPattern(kind){
 if(kind==='sleep')return '<svg class="print-glyph" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="0" width="100" height="100" fill="var(--sleep)"/></svg>';
 if(kind==='rest')return '<svg class="print-glyph rest-glyph" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M9 91 L91 9" stroke="#27313d" stroke-width="14" stroke-linecap="butt" fill="none"/></svg>';
 return '';
}
function renderChart(){
 const [y,m]=monthParts(state.month),n=new Date(y,m,0).getDate();
 $('#jump-month').value=state.month;
 $('#month-label').textContent=`${y}年 ${m}月`;
 $('#print-month').textContent=`${y}年${m}月`;
 $('#print-range').textContent=`${y}年${m}月1日〜${m}月${n}日`;
 $('#print-person').textContent=state.settings.name?`氏名：${state.settings.name}`:'氏名：　　　　　　　　　';
 const medicines=state.medicines.filter(x=>x.name&&(!x.start||x.start<=dateString(y,m,n))&&(!x.end||x.end>=dateString(y,m,1)));
 $('#print-medicines').textContent=medicines.length?'服用薬・変更履歴：'+medicines.map(x=>`${x.name}（${x.start||'開始日未設定'}${x.end?'～'+x.end:''}）`).join('　／　'):'服用薬・変更履歴：記録なし';
 const head='<colgroup><col class="col-date">'+Array.from({length:48},()=>'<col class="col-slot">').join('')+'<col class="col-sleep"><col class="col-sleep"><col class="col-weight"><col class="col-event"></colgroup><thead><tr><th class="date-cell">日付・曜日</th>'+Array.from({length:24},(_,h)=>{
 const rects=[isHabit(h*2),isHabit(h*2+1)].map((on,j)=>on?`<rect class="habit-shade" x="${j*50}" y="0" width="50" height="100"/><line class="habit-underbar" x1="${j*50}" y1="96" x2="${(j+1)*50}" y2="96"/>`:'').join('');
 return `<th class="h-hour" colspan="2">${rects?`<svg class="hour-accent" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${rects}</svg>`:''}<span class="hour-number">${h}</span></th>`}).join('')+'<th class="sleepiness-head">目覚めの眠気</th><th class="sleepiness-head">日中の眠気</th><th class="weight-head">体重<br>(kg)</th><th class="event-head">出来事</th></tr></thead>';
 let body='';for(let d=1;d<=n;d++){
  const date=dateString(y,m,d),a=state.days[date]||freshDay(),wd=weekday(y,m,d),cl=wd==='日'?'sunday':wd==='土'?'saturday':'';
  body+=`<tr class="selectday" data-date="${date}"><td class="date-cell ${cl}">${d}（${wd}）</td>`;
  for(let i=0;i<48;i++){
   const kind=['sleep','rest'].includes(a.slots?.[i])?a.slots[i]:'',mark=(a.markers||[]).filter(x=>x.slot===i).map(x=>markerSVG(x.type)).join('');
   body+=`<td class="slot ${kind} ${i%2?'hour-end':''}" title="${date} ${time(i)}${kind?' '+(kind==='sleep'?'熟睡':'休息'):''}">${printPattern(kind)}<span class="markers">${mark}</span></td>`;
  }
  body+=`<td class="extra">${esc(a.wakeSleepiness||'')}</td><td class="extra">${esc(a.daySleepiness||'')}</td><td class="weight-cell">${validWeight(a.weight)===null?'':validWeight(a.weight).toFixed(1)}</td><td class="event-cell" title="${esc(a.note||'')}">${esc(a.note||'')}</td></tr>`;
 }
 $('#sleep-table').innerHTML=head+'<tbody>'+body+'</tbody>';
 $$('#sleep-table tbody tr').forEach(tr=>tr.addEventListener('click',()=>action(null,async()=>{state.selected=tr.dataset.date;await show('input')})));
}
async function jumpMonth(month){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)){toast('年月を正しく指定してください');return}await loadMonth(month);state.month=month;renderChart();await renderAnalysis()}
async function monthShift(n){const [y,m]=monthParts(state.month),d=new Date(y,m-1+n,1);await jumpMonth(dateString(d.getFullYear(),d.getMonth()+1,1).slice(0,7))}
async function show(tab){if(tab==='report'||tab==='analysis')await loadMonth(state.month);if(tab==='input')await loadMonth(state.selected.slice(0,7));
 $$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));$$('.screen').forEach(s=>s.classList.toggle('active',s.id===`screen-${tab}`));
 if(tab==='report')renderChart();if(tab==='input')renderInput();if(tab==='settings')renderSettings();if(tab==='analysis')await renderAnalysis();window.scrollTo({top:0,behavior:'instant'});
}
function fillTimes(){const options=Array.from({length:49},(_,i)=>`<option value="${time(i)}">${time(i)}</option>`).join('');$$('#entry-start,#entry-end,#habit-bed,#habit-wake').forEach(el=>el.innerHTML=options);$('#entry-start').value='23:00';$('#entry-end').value='23:30'}
function renderModes(){
 $$('.mode').forEach(b=>b.classList.toggle('active',b.dataset.mode===selectedMode));
 const single=['med','bed','wake','meal'].includes(selectedMode);
 $('#medicine-selector').classList.toggle('site-hidden',selectedMode!=='med');
 $('#entry-end-field').classList.toggle('site-hidden',single);
 $('#entry-time-row').classList.toggle('single-time',single);
 $('#entry-start-label').textContent=single?'時刻':'開始時刻';
 $('#entry-end').disabled=single;
 $('#entry-help').textContent=single?'指定した時刻に記号を付けます。':selectedMode==='erase'?'選択した範囲の熟睡・休息・◎服薬・△就寝・▽起床・□食事を消去します。同じ時刻なら30分枠を消去します。':'開始から終了まで記録します。翌日にまたがる指定もできます。';
}
function renderSleepiness(el,key){const d=dayData(state.selected);$(el).innerHTML=['無','弱','強'].map(x=>`<button type="button" class="chip ${d[key]===x?'active':''}" data-value="${x}">${x}</button>`).join('');$(el).querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{const old=d[key];d[key]=b.dataset.value;action(b,async()=>{try{await persistDay(state.selected);renderSleepiness(el,key);renderDayPreview();renderChart()}catch(e){d[key]=old;throw e}})}))}
function renderInput(){$('#entry-date').value=state.selected;const a=dayData(state.selected);renderSleepiness('#wake-sleepiness','wakeSleepiness');renderSleepiness('#day-sleepiness','daySleepiness');$('#day-note').value=a.note||'';$('#day-weight').value=validWeight(a.weight)===null?'':validWeight(a.weight).toFixed(1);
 let meds=state.medicines.filter(m=>(!m.start||m.start<=state.selected)&&(!m.end||m.end>=state.selected));if(!meds.length)meds=state.medicines;
 $('#selected-medicine').innerHTML=meds.filter(x=>x.name).map(m=>`<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('')+'<option value="other">その他／未設定</option>';renderModes();renderDayPreview()}
function rangesForDay(a,kind){
 const result=[];let start=-1;
 for(let i=0;i<=48;i++){
  const match=i<48&&a.slots[i]===kind;
  if(match&&start<0)start=i;
  if(!match&&start>=0){result.push(`${time(start)}〜${time(i)}`);start=-1;}
 }
 return result;
}
function renderDayPreview(){
 const a=dayData(state.selected);
 $('#day-duration').textContent=minutes(a,'sleep');$('#day-rest').textContent=minutes(a,'rest');
 $('#quicktimeline').innerHTML=Array.from({length:48},(_,i)=>{
  const kind=['sleep','rest'].includes(a.slots[i])?a.slots[i]:'';
  const symbols=(a.markers||[]).filter(x=>x.slot===i).map(x=>markerSVG(x.type)).join('');
  return `<div class="quick-slot ${kind}" title="${time(i)} ${kind==='sleep'?'熟睡':kind==='rest'?'休息':''}">${printPattern(kind)}<span class="markers">${symbols}</span></div>`
 }).join('');
 const sorted=(a.markers||[]).map((v,i)=>({...v,originalIndex:i})).sort((x,y)=>x.slot-y.slot);
 $('#marker-list').innerHTML=sorted.length?'<span class="muted">記号（押すと削除）：</span>'+sorted.map(x=>`<button class="marker-chip" data-i="${x.originalIndex}" title="この記号を削除">${time(x.slot)} ${{med:'◎ 服薬',bed:'△ 就寝',wake:'▽ 起床',meal:'□ 食事'}[x.type]} ×</button>`).join(''):'<span class="muted">記号の記録はありません</span>';
 const summary=[];
 const sleeps=rangesForDay(a,'sleep'), rests=rangesForDay(a,'rest');
 if(sleeps.length)summary.push(['熟睡',sleeps.join('、')]);
 if(rests.length)summary.push(['休息',rests.join('、')]);
 if(a.wakeSleepiness)summary.push(['目覚めの眠気',a.wakeSleepiness]);
 if(a.daySleepiness)summary.push(['日中の眠気',a.daySleepiness]);
 if(validWeight(a.weight)!==null)summary.push(['体重',`${validWeight(a.weight).toFixed(1)} kg`]);
 if(a.note)summary.push(['出来事',a.note]);
 $('#daily-summary').innerHTML=summary.length?summary.map(([label,value])=>`<div class="summary-line"><strong>${esc(label)}</strong><span>${esc(value)}</span></div>`).join(''):'<div class="muted">この日の記録はまだありません。</div>';
 $$('#marker-list button').forEach(b=>b.addEventListener('click',()=>action(b,async()=>{const copy=structuredClone(a);a.markers.splice(Number(b.dataset.i),1);try{await persistDay(state.selected);renderInput();renderChart();toast('記号を削除しました')}catch(e){state.days[state.selected]=copy;throw e}})));
}
function minutes(a,kind){const x=(a?.slots||[]).filter(v=>v===kind).length*30;return `${Math.floor(x/60)}時間${x%60?'30分':''}`}
// 選択時間に含まれる記録を、塗りつぶしと記号の両方から消去する。
// 30分枠 [from,to) 単位。範囲外の記録・眠気・出来事は変更しない。
function eraseTimedEntries(day,from,to){
 for(let i=from;i<to;i++)day.slots[i]='';
 day.markers=(day.markers||[]).filter(m=>!(m.slot>=from&&m.slot<to));
}
async function applyEntry(){await action($('#add-entry'),async()=>{
 const date=state.selected,start=idx($('#entry-start').value),requestedEnd=idx($('#entry-end').value);
 const symbols=['med','bed','wake','meal'].includes(selectedMode),erasing=selectedMode==='erase';
 if(!Number.isInteger(start)||start<0||start>=48){toast('開始時刻は00:00〜23:30を選んでください');return}
 if(!Number.isInteger(requestedEnd)||requestedEnd<0||requestedEnd>48){toast('終了時刻を確認してください');return}
 if(!symbols&&!erasing&&start===requestedEnd){toast('開始と終了は別の時刻を選択してください');return}
 // 消去時に同じ時刻を選択した場合は、その30分マスだけ消去する。
 const end=erasing&&start===requestedEnd?start+1:requestedEnd;
 const next=nextDay(date),keys=new Set([date]);
 if(!symbols&&end<start)keys.add(next);
 await Promise.all([...keys].map(k=>loadMonth(k.slice(0,7))));
 const backup=Object.fromEntries([...keys].map(k=>[k,structuredClone(normalDay(k))]));
 const a=dayData(date);
 if(symbols){
  const marker={slot:start,type:selectedMode};
  // 同じ種類・時刻の重複登録は避ける。別の記号は同じ時刻にも登録可能。
  if(a.markers.some(x=>x.slot===start&&x.type===selectedMode)){toast('この時刻には既に同じ記号があります');return}
  if(selectedMode==='med')marker.medId=$('#selected-medicine').value;
  a.markers.push(marker);
 }else if(erasing){
  eraseTimedEntries(a,start,end>start?end:48);
  if(end<start)eraseTimedEntries(dayData(next),0,end);
 }else{
  for(let i=start;i<(end>start?end:48);i++)a.slots[i]=selectedMode;
  if(end<start){let b=dayData(next);for(let i=0;i<end;i++)b.slots[i]=selectedMode}
 }
 try{
  const batch=writeBatch(db);
  for(const k of keys)batch.set(dayRef(k),{...normalDay(k),updatedAt:serverTimestamp()});
  await batch.commit();
  renderInput();renderChart();
  toast(erasing?'選択範囲の時間記録・記号を消去しました':'記録を保存しました');
 }catch(e){for(const [key,value] of Object.entries(backup))state.days[key]=value;renderInput();throw e}
});}
async function saveDay(){await action($('#save-day'),async()=>{
 const input=$('#day-weight'),raw=input.value.trim();
 if(raw!==''&&(!/^(?:\d+)(?:\.\d)?$/.test(raw)||!Number.isFinite(Number(raw))||Number(raw)<0.1||Number(raw)>500)){
  toast('体重は0.1〜500.0kgの範囲で小数第1位まで入力してください');input.focus();return;
 }
 const a=dayData(state.selected),before=structuredClone(a);
 a.weight=raw===''?null:validWeight(Number(raw));
 a.note=$('#day-note').value.slice(0,500);
 try{await persistDay(state.selected);renderDayPreview();renderChart();await renderAnalysis();toast('体重・眠気・出来事を保存しました')}
 catch(e){state.days[state.selected]=before;renderInput();throw e}
});}
function sumFor(days){let s=0,r=0,recorded=0,weights=[],wake={'無':0,'弱':0,'強':0},day={'無':0,'弱':0,'強':0};for(const key of days){const a=state.days[key];if(!a)continue;const sn=(a.slots||[]).filter(v=>v==='sleep').length*30,rn=(a.slots||[]).filter(v=>v==='rest').length*30;if(validWeight(a.weight)!==null)weights.push({date:key,value:validWeight(a.weight)});if(sn||rn||(a.markers||[]).length||a.note||a.wakeSleepiness||a.daySleepiness||validWeight(a.weight)!==null){recorded++;s+=sn;r+=rn;if(a.wakeSleepiness)wake[a.wakeSleepiness]=(wake[a.wakeSleepiness]||0)+1;if(a.daySleepiness)day[a.daySleepiness]=(day[a.daySleepiness]||0)+1}}return {s,r,recorded,wake,day,weights}}
function getRange(){const dt=new Date(state.selected+'T12:00:00');let out=[];if(analysisView==='daily')return[state.selected];if(analysisView==='weekly'){const start=new Date(dt);start.setDate(dt.getDate()-6);for(let i=0;i<7;i++){const d=new Date(start);d.setDate(start.getDate()+i);out.push(iso(d))}return out}const [y,m]=monthParts(state.month),n=new Date(y,m,0).getDate();for(let d=1;d<=n;d++)out.push(dateString(y,m,d));return out}
async function renderAnalysis(){const days=getRange();if(currentUser?.emailVerified){const months=[...new Set(days.map(k=>k.slice(0,7)))];await Promise.all(months.map(loadMonth))}
 $$('#analysis-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.view===analysisView));const s=sumFor(days),fmt=min=>`${Math.floor(min/60)}時間${min%60?`${min%60}分`:''}`;
 const weightAvg=s.weights.length?(s.weights.reduce((sum,x)=>sum+x.value,0)/s.weights.length).toFixed(1)+' kg':'—';
 const latestWeight=s.weights.at(-1);
 const stats=[['記録した睡眠 合計',fmt(s.s),'自分で「熟睡」とした時間'],['休息 合計',fmt(s.r),'起きて布団の中にいた時間'],['記録のある日',`${s.recorded}日`,'対象期間内の登録'],['記録日の平均睡眠',s.recorded?fmt(Math.round(s.s/s.recorded/30)*30):'—','記録のある日で計算'],['体重 平均',weightAvg,`体重入力のある${s.weights.length}日で計算`],['期間内の直近体重',latestWeight?latestWeight.value.toFixed(1)+' kg':'—',latestWeight?latestWeight.date+'の記録':'記録なし']];
 $('#analysis-stats').innerHTML=stats.map(x=>`<div class="statbox"><small>${x[0]}</small><strong>${x[1]}</strong><p>${x[2]}</p></div>`).join('');$('#analysis-title').textContent=analysisView==='daily'?`${state.selected} の記録`:analysisView==='weekly'?'直近7日間の睡眠記録':`${state.month.replace('-','年')}月の睡眠記録`;
 $('#analysis-bars').innerHTML=days.map(k=>{const a=state.days[k],v=(a?.slots||[]).filter(x=>x==='sleep').length*30;return `<div class="baritem"><div>${k.slice(5)}</div><div class="barbg"><div class="barvalue" style="width:${Math.min(100,v/1440*100)}%"></div></div><strong>${a?fmt(v):'未入力'}${a&&validWeight(a.weight)!==null?' / '+validWeight(a.weight).toFixed(1)+'kg':''}</strong></div>`}).join('')||'<span class="muted">まだ記録がありません</span>';
}
function renderSettings(){applyTheme();$('#display-name').value=state.settings.name||'';$('#habit-bed').value=state.settings.habitBed||'23:00';$('#habit-wake').value=state.settings.habitWake||'07:00';$('#account-email').textContent=currentUser?.email||'—';$('#first-month').value=state.settings.firstMonth||'';$('#theme-choices').innerHTML=Object.entries(themes).map(([id,t])=>`<button class="theme-choice ${state.settings.theme===id?'active':''}" data-id="${id}" aria-label="${t.name}" title="${t.name}"><i class="color-dot" style="background:${t.accent}"></i></button>`).join('');$$('#theme-choices button').forEach(b=>b.addEventListener('click',()=>action(b,async()=>{const old=state.settings.theme;state.settings.theme=b.dataset.id;applyTheme();try{await setDoc(userDoc(),{theme:state.settings.theme,updatedAt:serverTimestamp()},{merge:true});renderSettings();renderChart()}catch(e){state.settings.theme=old;applyTheme();renderSettings();throw e}})));renderMedicineRows()}
function syncMedicineInputs(){for(const row of $$('#medicine-rows .medicine-row')){const m=state.medicines.find(m=>m.id===row.dataset.id);if(m)row.querySelectorAll('input').forEach(i=>{m[i.dataset.key]=i.value})}}
function renderMedicineRows(){const ms=state.medicines;$('#medicine-rows').innerHTML=ms.length?ms.map(m=>`<div class="medicine-row" data-id="${esc(m.id)}"><input aria-label="薬の名前" type="text" maxlength="80" data-key="name" value="${esc(m.name||'')}" placeholder="薬の名前"><input aria-label="服用開始日" type="date" data-key="start" value="${esc(m.start||'')}"><input aria-label="服用終了日" type="date" data-key="end" value="${esc(m.end||'')}"><button class="btn small danger" title="薬の行を削除" data-remove="${esc(m.id)}">×</button></div>`).join(''):'<span class="muted">まだ薬がありません。「＋ 薬を追加」から登録できます。</span>';
 $$('#medicine-rows button[data-remove]').forEach(b=>b.addEventListener('click',()=>{syncMedicineInputs();deletedMedicineIds.add(b.dataset.remove);state.medicines=state.medicines.filter(m=>m.id!==b.dataset.remove);renderMedicineRows()}))}
async function saveSettings(){await action($('#save-settings'),async()=>{
 syncMedicineInputs();const newSettings={name:$('#display-name').value.trim().slice(0,60),habitBed:$('#habit-bed').value,habitWake:$('#habit-wake').value,theme:state.settings.theme,firstMonth:$('#first-month').value||''};
 if(newSettings.habitBed===newSettings.habitWake){toast('通常の就寝時刻と起床時刻は異なる時刻を選んでください');return}
 if(state.medicines.some(m=>m.start&&m.end&&m.start>m.end)){toast('薬の終了日は開始日以降にしてください');return}
 const batch=writeBatch(db);batch.set(userDoc(),{...newSettings,updatedAt:serverTimestamp()},{merge:true});
 for(const m of state.medicines){if(!m.name.trim()){toast('薬の名称を入力するか、未記入の薬を削除してください');return}batch.set(medRef(m.id),{name:m.name.trim().slice(0,80),start:m.start||'',end:m.end||'',updatedAt:serverTimestamp()})}
 for(const id of deletedMedicineIds)batch.delete(medRef(id));await batch.commit();state.settings={...state.settings,...newSettings};deletedMedicineIds.clear();renderSettings();renderChart();renderInput();toast('設定・服用薬情報を保存しました')
 });}
function makeId(){return 'med-'+(globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2,10)}`)}

/* A4横1枚のPDFを端末の印刷処理に依存せず、ブラウザ内で作成します。
 * 文字・図形はCanvasへ描画し、1ページのJPEG画像としてPDFへ埋め込みます。
 * 氏名・睡眠・服薬データはサーバーへ送らず、端末内でPDFを作成します。
 */
async function downloadOnePagePdf(){
 const [year,month]=monthParts(state.month),numDays=new Date(year,month,0).getDate();
 const W=2600,H=1838,cv=document.createElement('canvas');cv.width=W;cv.height=H;
 const cx=cv.getContext('2d',{alpha:false});if(!cx)throw Error('PDF作成用の描画を開始できません');
 cx.fillStyle='#fff';cx.fillRect(0,0,W,H);
 const margin=42,tableW=W-2*margin,rowH=43,headH=57,top=164;
 const dims=[145,...Array(48).fill(0),112,112,92,0];
 const slotW=34;for(let i=1;i<=48;i++)dims[i]=slotW;
 dims[dims.length-1]=tableW-dims.slice(0,-1).reduce((a,b)=>a+b,0);
 const starts=[margin];dims.forEach(x=>starts.push(starts[starts.length-1]+x));
 const tx=(str,x,y,font='20px sans-serif',fill='#26354a',align='left',max)=>{
  cx.save();cx.font=font;cx.fillStyle=fill;cx.textAlign=align;cx.textBaseline='middle';
  if(max){let s=String(str||'');while(s&&cx.measureText(s).width>max)s=s.slice(0,-1);if(s!==String(str||''))s+='…';cx.fillText(s,x,y)}
  else cx.fillText(String(str||''),x,y);cx.restore();
 };
 const line=(x1,y1,x2,y2,color='#b4bfcd',width=1,dash=[])=>{cx.save();cx.strokeStyle=color;cx.lineWidth=width;cx.setLineDash(dash);cx.beginPath();cx.moveTo(x1,y1);cx.lineTo(x2,y2);cx.stroke();cx.restore()};
 tx('睡眠日誌',margin,52,'bold 42px sans-serif');
 tx(`${year}年${month}月`,margin+230,53,'bold 29px sans-serif');
 tx(state.settings.name?`氏名：${state.settings.name}`:'氏名：　　　　　　　　　',margin,107,'24px sans-serif','#28364a', 'left',930);
 tx(`記録期間：${year}年${month}月1日〜${numDays}日`,W-margin,107,'22px sans-serif','#40556d','right');
 const theme=themes[state.settings.theme]||themes.blue;
 cx.fillStyle='#eff3f8';cx.fillRect(margin,top,tableW,headH);
 // 時間帯見出し：通常就寝時間帯だけを薄い黄色に
 for(let i=0;i<48;i++)if(isHabit(i)){cx.fillStyle='#fff1c5';cx.fillRect(starts[i+1],top,slotW,headH)}
 tx('日付・曜日',starts[0]+dims[0]/2,top+headH/2,'bold 18px sans-serif','#26354a','center');
 for(let hr=0;hr<24;hr++)tx(String(hr),starts[1+hr*2]+slotW,top+headH/2,'bold 18px sans-serif','#26354a','center');
 const extraStart=49;
 ['目覚めの眠気','日中の眠気','体重(kg)','出来事'].forEach((label,j)=>tx(label,starts[extraStart+j]+dims[extraStart+j]/2,top+headH/2,j===3?'bold 18px sans-serif':'bold 14px sans-serif','#26354a','center'));
 for(let d=1;d<=numDays;d++){
  const key=dateString(year,month,d),a=state.days[key]||freshDay(),y=top+headH+(d-1)*rowH;
  if(d%2===0){cx.fillStyle='#f3f7fc';cx.fillRect(margin,y,tableW,rowH)}
  const wd=weekday(year,month,d);
  tx(`${d}（${wd}）`,starts[0]+dims[0]/2,y+rowH/2,'bold 18px sans-serif',wd==='日'?'#a84252':wd==='土'?'#365b96':'#26354a','center');
  for(let i=0;i<48;i++){
   const cellX=starts[i+1],kind=a.slots?.[i];
   if(kind==='sleep'){cx.fillStyle=theme.sleep;cx.fillRect(cellX+1,y+1,slotW-2,rowH-2)}
   else if(kind==='rest')line(cellX+4,y+rowH-4,cellX+slotW-4,y+4,'#202b37',6);
   const marks=(a.markers||[]).filter(x=>x.slot===i);
   for(let k=0;k<marks.length;k++){
    const m=marks[k],total=Math.min(marks.length,3),symbolX=cellX+slotW/2+(k-(total-1)/2)*9,cy=y+rowH/2;
    cx.save();cx.strokeStyle=kind==='sleep'?'#ffffff':'#182531';cx.lineWidth=2.3;cx.beginPath();
    if(m.type==='med'){cx.arc(symbolX,cy,5.2,0,Math.PI*2);cx.moveTo(symbolX+2.3,cy);cx.arc(symbolX,cy,2.3,0,Math.PI*2)}
    if(m.type==='bed'){cx.moveTo(symbolX,cy-7);cx.lineTo(symbolX+6.5,cy+6);cx.lineTo(symbolX-6.5,cy+6);cx.closePath()}
    if(m.type==='wake'){cx.moveTo(symbolX-6.5,cy-6);cx.lineTo(symbolX+6.5,cy-6);cx.lineTo(symbolX,cy+7);cx.closePath()}
    if(m.type==='meal'){cx.rect(symbolX-6,cy-6,12,12)}
    cx.stroke();cx.restore();
   }
  }
  const extras=[a.wakeSleepiness||'',a.daySleepiness||'',validWeight(a.weight)!==null?validWeight(a.weight).toFixed(1):''];
  extras.forEach((val,j)=>tx(val,starts[extraStart+j]+dims[extraStart+j]/2,y+rowH/2,'18px sans-serif','#26354a','center'));
  tx(a.note||'',starts[extraStart+3]+8,y+rowH/2,'17px sans-serif','#26354a','left',dims[extraStart+3]-16);
  line(margin,y+rowH,margin+tableW,y+rowH,'#c3ccd7',1);
 }
 // 24時間枠は実線、30分境界は点線
 for(let i=0;i<=53;i++){
  const x=starts[i];
  if(i===0||i===53||i>=49||i%2===1){line(x,top,x,top+headH+numDays*rowH,'#a1adbc',1.5)}
  else{line(x,top,x,top+headH+numDays*rowH,'#b8c3d0',1,[3,4])}
 }
 line(margin,top,margin+tableW,top,'#8e9aa8',2);line(margin,top+headH,margin+tableW,top+headH,'#8e9aa8',2);
 const footerY=top+headH+numDays*rowH+25;
 tx('■ 熟睡',margin,footerY,'21px sans-serif');tx('╱ 休息（布団の中）',margin+135,footerY,'21px sans-serif');
 tx('◎ 服薬',margin+445,footerY,'21px sans-serif');tx('△ 就寝',margin+590,footerY,'21px sans-serif');
 tx('▽ 起床',margin+730,footerY,'21px sans-serif');tx('□ 食事',margin+870,footerY,'21px sans-serif');
 tx('黄色の時間見出し：通常の睡眠時間帯',margin+1050,footerY,'19px sans-serif','#40556d');
 const activeMeds=state.medicines.filter(m=>m.name&&(!m.start||m.start<=dateString(year,month,numDays))&&(!m.end||m.end>=dateString(year,month,1)));
 const note=activeMeds.length?'服用薬・変更履歴：'+activeMeds.map(m=>`${m.name}（${m.start||'開始日未設定'}${m.end?'～'+m.end:''}）`).join('／'):'服用薬・変更履歴：記録なし';
 tx(note,margin,footerY+42,'20px sans-serif','#526177','left',tableW-20);
 tx('© 2021–2026 Dobhar-chú',W-margin,H-34,'17px sans-serif','#6d7b90','right');
 const base64=cv.toDataURL('image/jpeg',0.92).split(',')[1],raw=atob(base64),jpeg=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)jpeg[i]=raw.charCodeAt(i);
 const encoder=new TextEncoder(),chunks=[],offsets=[0];let pos=0;
 function append(b){chunks.push(b);pos+=b.length}
 function a(s){append(encoder.encode(s))}
 a('%PDF-1.4\n');
 const obj=(id,content)=>{offsets[id]=pos;a(`${id} 0 obj\n${content}\nendobj\n`)};
 obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
 obj(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
 obj(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 841.89 595.28] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>');
 offsets[4]=pos;a(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);append(jpeg);a('\nendstream\nendobj\n');
 const stream='q\n841.89 0 0 595.28 0 0 cm\n/Im1 Do\nQ\n';
 obj(5,`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`);
 const xref=pos;a('xref\n0 6\n0000000000 65535 f \n');for(let id=1;id<=5;id++)a(String(offsets[id]).padStart(10,'0')+' 00000 n \n');
 a(`trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n${xref}\n%%EOF`);
 const data=new Blob(chunks,{type:'application/pdf'}),url=URL.createObjectURL(data),link=document.createElement('a');
 link.href=url;link.download=`睡眠日誌_${year}-${String(month).padStart(2,'0')}.pdf`;
 document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 toast('A4横・1ページのPDFを作成しました');
}

// 認証
$('#register-button').addEventListener('click',register);$('#login-button').addEventListener('click',login);$('#reset-password-button').addEventListener('click',passwordResetFromAuth);
$('#auth-password').addEventListener('keydown',e=>{if(e.key==='Enter')login()});
$('#resend-verified').addEventListener('click',resendVerification);
$('#logout-button').addEventListener('click',()=>action($('#logout-button'),()=>signOut(auth)));
$('#verify-logout').addEventListener('click',()=>action($('#verify-logout'),()=>signOut(auth)));
$('#change-email').addEventListener('click',changeEmail);$('#reset-signed-password').addEventListener('click',passwordResetSigned);$('#send-verification-settings').addEventListener('click',reloadEmailStatus);
// 日誌
fillTimes();$$('.tab').forEach(b=>b.addEventListener('click',()=>action(null,()=>show(b.dataset.tab))));
$('#jump-month').addEventListener('change',e=>action(e.target,()=>jumpMonth(e.target.value)));$('#prev-month').addEventListener('click',()=>action($('#prev-month'),()=>monthShift(-1)));$('#next-month').addEventListener('click',()=>action($('#next-month'),()=>monthShift(1)));
$('#open-guide').addEventListener('click',()=>$('#guide-dialog').showModal());$('#close-guide').addEventListener('click',()=>$('#guide-dialog').close());$('#guide-dialog').addEventListener('click',e=>{if(e.target.id==='guide-dialog')e.target.close()});
$('#print-button').addEventListener('click',()=>{
 // スマートフォンの印刷メニューはA4の向き・改ページが端末依存のため、1枚のPDFを保存してから印刷する。
 if(window.matchMedia('(max-width:850px)').matches){action($('#print-button'),async()=>{await downloadOnePagePdf();toast('保存したPDFを開いて印刷してください')});return}
 renderChart();window.print();
});
$('#download-pdf').addEventListener('click',()=>action($('#download-pdf'),downloadOnePagePdf));
$$('.mode').forEach(b=>b.addEventListener('click',()=>{selectedMode=b.dataset.mode;renderModes()}));
$('#entry-date').addEventListener('change',e=>{const val=e.target.value;if(!/^\d{4}-\d{2}-\d{2}$/.test(val)){toast('日付を正しく指定してください');e.target.value=state.selected;return}action(null,async()=>{await loadMonth(val.slice(0,7));state.selected=val;state.month=val.slice(0,7);renderInput();renderChart()})});
$('#add-entry').addEventListener('click',applyEntry);$('#save-day').addEventListener('click',saveDay);
$$('#analysis-tabs button').forEach(b=>b.addEventListener('click',()=>action(b,async()=>{analysisView=b.dataset.view;await renderAnalysis()})));
$('#save-settings').addEventListener('click',saveSettings);$('#add-medicine').addEventListener('click',()=>{syncMedicineInputs();state.medicines.push({id:makeId(),name:'',start:state.selected,end:''});renderMedicineRows()});
// 表を初期状態で表示するのはログイン＆確認済み後のみ。デモデータは入れない。
