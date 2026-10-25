const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "caelix.conversations.v1";
const PREF_KEY = "caelix.preferences.v1";
let conversations = loadConversations();
let activeId = conversations[0]?.id || makeId();
let busy = false;
let recognition = null;

function makeId(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
function loadConversations(){ try { const x=JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]"); return Array.isArray(x)?x:[]; } catch { return []; } }
function saveConversations(){ localStorage.setItem(STORAGE_KEY,JSON.stringify(conversations.slice(0,30))); }
function getActive(){ let c=conversations.find(x=>x.id===activeId); if(!c){c={id:activeId,title:"New conversation",messages:[],updated:Date.now()};conversations.unshift(c);} return c; }
function loadPrefs(){ try{return {...{speak:false,voice:""},...JSON.parse(localStorage.getItem(PREF_KEY)||"{}")};}catch{return {speak:false,voice:""};} }
let prefs=loadPrefs();
function savePrefs(){localStorage.setItem(PREF_KEY,JSON.stringify(prefs));}
function toast(s){const t=$("toast");t.textContent=s;t.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove("show"),2600);}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function renderMarkdown(s){
  // Deliberately lightweight formatting: escapes HTML before adding basic markdown.
  let x=escapeHTML(s);
  x=x.replace(/```([\s\S]*?)```/g,(_,code)=>`<pre><code>${code.trim()}</code></pre>`);
  x=x.replace(/`([^`]+)`/g,"<code>$1</code>");
  x=x.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>");
  x=x.split(/\n{2,}/).map(p=>p.startsWith("<pre>")?p:`<p>${p.replace(/\n/g,"<br>")}</p>`).join("");
  return x;
}
function renderHistory(){
  const list=$("historyList");list.innerHTML="";
  conversations.slice(0,20).forEach(c=>{const b=document.createElement("button");b.className="history-item"+(c.id===activeId?" active":"");b.textContent=c.title||"New conversation";b.title=b.textContent;b.onclick=()=>{activeId=c.id;renderAll();$("sidebar").classList.remove("open");};list.appendChild(b);});
}
function renderMessages(){
  const box=$("messages");box.innerHTML="";
  const c=getActive();
  $("welcome").classList.toggle("hidden",c.messages.length>0);
  c.messages.forEach(m=>{
    const row=document.createElement("article");row.className="message "+(m.role==="user"?"user":"assistant");
    const avatar=document.createElement("div");avatar.className="avatar";avatar.textContent=m.role==="user"?"Y":"C";
    const body=document.createElement("div");body.className="message-body";
    const label=document.createElement("div");label.className="message-label";label.textContent=m.role==="user"?"YOU":"CAELIX";
    const content=document.createElement("div");content.className="message-content";content.innerHTML=renderMarkdown(m.content);
    body.append(label,content);row.append(avatar,body);box.appendChild(row);
  });
  box.scrollTop=box.scrollHeight;
}
function renderAll(){renderHistory();renderMessages();}
function addMessage(role,content){const c=getActive();c.messages.push({role,content,at:Date.now()});c.updated=Date.now();if(c.title==="New conversation"&&role==="user")c.title=content.slice(0,42)+(content.length>42?"…":"");saveConversations();renderAll();}
function showTyping(){const row=document.createElement("article");row.id="typingIndicator";row.className="message assistant";row.innerHTML='<div class="avatar">C</div><div class="message-body"><div class="message-label">CAELIX</div><div class="typing"><i></i><i></i><i></i></div></div>';$("messages").appendChild(row);$("messages").scrollTop=$("messages").scrollHeight;}
function speak(text){
  if(!prefs.speak||!("speechSynthesis" in window))return;
  speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);const voice=speechSynthesis.getVoices().find(v=>v.name===prefs.voice);if(voice)u.voice=voice;u.rate=1.02;speechSynthesis.speak(u);
}
async function sendMessage(raw){
  const content=raw.trim();if(!content||busy)return;
  busy=true;$("sendButton").disabled=true;$("messageInput").value="";resizeInput();
  addMessage("user",content);showTyping();
  try{
    const history=getActive().messages.slice(-16).map(m=>({role:m.role,content:m.content}));
    const response=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:history})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||`AI service returned ${response.status}`);
    if(!data.reply||typeof data.reply!=="string")throw new Error("The AI service returned an empty response.");
    $("typingIndicator")?.remove();addMessage("assistant",data.reply);speak(data.reply);
  }catch(err){
    $("typingIndicator")?.remove();
    addMessage("assistant",`I couldn't reach the AI service. ${err.message||"Please check the setup and try again."}\n\nIf this is a fresh deployment, check the setup steps in the project README and confirm the AI binding is enabled.`);
    setStatus("SERVICE ERROR",false);
  }finally{busy=false;$("sendButton").disabled=false;$("messageInput").focus();}
}
function resizeInput(){const t=$("messageInput");t.style.height="auto";t.style.height=Math.min(t.scrollHeight,180)+"px";}
$("sendButton").addEventListener("click",()=>sendMessage($("messageInput").value));
$("messageInput").addEventListener("input",resizeInput);
$("messageInput").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage($("messageInput").value);}});
$("newChat").addEventListener("click",()=>{activeId=makeId();conversations.unshift({id:activeId,title:"New conversation",messages:[],updated:Date.now()});saveConversations();renderAll();$("messageInput").focus();$("sidebar").classList.remove("open");});
document.querySelectorAll("[data-prompt]").forEach(b=>b.addEventListener("click",()=>sendMessage(b.dataset.prompt)));
$("menuButton").addEventListener("click",()=>$("sidebar").classList.toggle("open"));
$("settingsButton").addEventListener("click",()=>{$("speakToggle").checked=prefs.speak;fillVoices();$("settingsDialog").showModal();});
$("speakToggle").addEventListener("change",e=>{prefs.speak=e.target.checked;savePrefs();});
$("voiceSelect").addEventListener("change",e=>{prefs.voice=e.target.value;savePrefs();});
$("clearHistory").addEventListener("click",()=>{if(confirm("Clear all CAELIX conversations saved in this browser?")){conversations=[];activeId=makeId();conversations.push({id:activeId,title:"New conversation",messages:[],updated:Date.now()});saveConversations();renderAll();$("settingsDialog").close();toast("Local conversation history cleared.");}});
function fillVoices(){if(!("speechSynthesis" in window))return;const select=$("voiceSelect"),current=prefs.voice;select.innerHTML='<option value="">System default</option>';speechSynthesis.getVoices().forEach(v=>{const o=document.createElement("option");o.value=v.name;o.textContent=`${v.name} (${v.lang})`;select.appendChild(o);});select.value=current;}
if("speechSynthesis" in window)speechSynthesis.onvoiceschanged=fillVoices;
$("micButton").addEventListener("click",()=>{
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){toast("Voice input is not supported in this browser. Try dictation from your keyboard.");return;}
  if(recognition){recognition.stop();recognition=null;$("micButton").style.color="";return;}
  recognition=new SR();recognition.lang=navigator.language||"en-US";recognition.interimResults=false;recognition.maxAlternatives=1;
  $("micButton").style.color="var(--cyan)";toast("Listening… speak now.");
  recognition.onresult=e=>{$("messageInput").value=($("messageInput").value+" "+e.results[0][0].transcript).trim();resizeInput();$("messageInput").focus();};
  recognition.onerror=()=>toast("Voice recognition stopped. You can type or use keyboard dictation.");
  recognition.onend=()=>{$("micButton").style.color="";recognition=null;};recognition.start();
});
function setStatus(label,ok){$("connectionStatus").textContent=label;$("topStatus").textContent=label.toUpperCase();document.querySelector(".status-dot").style.background=ok?"#65d9a6":"#edb85c";document.querySelector(".pulse").style.background=ok?"#65d9a6":"#edb85c";}
async function checkService(){
 try{const r=await fetch("/api/health");if(!r.ok)throw Error();const d=await r.json();setStatus(d.aiConfigured?"AI READY":"AI SETUP NEEDED",!!d.aiConfigured);if(!d.aiConfigured)toast("The app is running, but the AI binding needs setup.");}
 catch{setStatus("OFFLINE",false);}
}
if(!conversations.length){conversations=[{id:activeId,title:"New conversation",messages:[],updated:Date.now()}];saveConversations();}
renderAll();checkService();
if("serviceWorker" in navigator && location.protocol.startsWith("http"))navigator.serviceWorker.register("/sw.js").catch(()=>{});
