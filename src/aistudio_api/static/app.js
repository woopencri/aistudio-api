
function app(){return{
  view:'chat',sidebarOpen:false,configOpen:false,openSelect:null,
  stats:{},rotationMode:'round_robin',rotCfg:{mode:'round_robin',cooldown:60},
  accounts:[],rotationAccounts:{},activeId:'',activeAccount:{},
  models:[],model:'',
  msgs:[],draft:'',busy:false,
  cfg:{thinking:'off',search:'off',stream:'on',temperature:1.0,topP:1.0,maxTokens:8192,safety:'on'},
  toast:{show:false,msg:'',t:null},
  showAddAccount:false,showEditAccount:false,
  addForm:{name:'',proxyUrl:''},editForm:{id:'',name:'',proxyUrl:''},

  init(){this.loadModels();this.loadStats();this.loadAccounts();this.loadRotation();document.addEventListener('click',()=>this.openSelect=null)},
  go(v){this.view=v;this.sidebarOpen=false;if(v==='dashboard')this.loadStats();if(v==='accounts')this.refreshAccountsData()},
  showToast(m){this.toast.msg=m;this.toast.show=true;if(this.toast.t)clearTimeout(this.toast.t);this.toast.t=setTimeout(()=>this.toast.show=false,3000)},
  toggleSelect(k,e){e.stopPropagation();this.openSelect=this.openSelect===k?null:k},
  selectOpt(k,model,val){this[model]=val;this.openSelect=null},

  async loadModels(){try{const r=await fetch('/v1/models');const d=await r.json();this.models=d.data||[];if(!this.model&&this.models.length)this.model=this.models[0].id}catch(e){}},
  async loadStats(){try{const r=await fetch('/stats');const d=await r.json();this.stats=d.models||{}}catch(e){}},
  async loadAccounts(){try{const[a,b]=await Promise.all([fetch('/accounts').then(async r=>r.ok?r.json():[]),fetch('/accounts/active').then(async r=>r.ok?r.json():null)]);this.accounts=Array.isArray(a)?a:[];this.activeId=b?.id||'';this.activeAccount=b||{}}catch(e){this.accounts=[];this.activeId='';this.activeAccount={}}},
  async loadRotation(){try{const r=await fetch('/rotation');const d=await r.json();this.rotationMode=d.mode||'round_robin';this.rotCfg.mode=d.mode||'round_robin';this.rotCfg.cooldown=d.cooldown_seconds||60;this.rotationAccounts=d.accounts||{}}catch(e){}},
  async refreshAccountsData(){await Promise.all([this.loadAccounts(),this.loadRotation()])},

  get accountRows(){return this.accounts.map(a=>({...a,...(this.rotationAccounts[a.id]||{})}))},
  get totalReqs(){return Object.values(this.stats).reduce((s,v)=>s+(v.requests||0),0)},
  get totalRL(){return Object.values(this.stats).reduce((s,v)=>s+(v.rate_limited||0),0)},

  maskProxyUrl(proxyUrl){if(!proxyUrl)return '';try{const u=new URL(proxyUrl);const user=u.username?decodeURIComponent(u.username):'';const auth=user?`${user}${u.password?':***':''}@`:'';const port=u.port?`:${u.port}`:'';return `${u.protocol}//${auth}${u.hostname}${port}`}catch(e){return proxyUrl}},
  getErrorMessage(detail,fallback){if(!detail)return fallback;if(typeof detail==='string')return detail;if(typeof detail?.message==='string')return detail.message;try{return JSON.stringify(detail)}catch(e){return fallback}},

  async saveRotation(){try{await fetch('/rotation/mode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:this.rotCfg.mode,cooldown_seconds:this.rotCfg.cooldown})});this.showToast('已保存');this.loadRotation()}catch(e){this.showToast('保存失败')}},
  async forceNext(){try{await fetch('/rotation/next',{method:'POST'});this.showToast('已切换账号');this.loadAccounts()}catch(e){this.showToast('切换失败')}},
  async activateAccount(id){try{const r=await fetch(`/accounts/${id}/activate`,{method:'POST'});if(!r.ok){let detail=null;try{detail=(await r.json()).detail}catch(e){}throw new Error(this.getErrorMessage(detail,'激活失败'))}this.showToast('已激活');await this.refreshAccountsData()}catch(e){this.showToast(e.message||'激活失败')}},

  resetAddForm(){this.addForm={name:'',proxyUrl:''}},
  openEditAccount(a){this.editForm={id:a.id,name:a.name||'',proxyUrl:a.proxy_url||''};this.showEditAccount=true},
  closeEditAccount(){this.showEditAccount=false;this.editForm={id:'',name:'',proxyUrl:''}},
  async addAccount(){try{const r=await fetch('/accounts/login/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:this.addForm.name.trim()||null,proxy_url:this.addForm.proxyUrl.trim()||null})});if(!r.ok){let detail=null;try{detail=(await r.json()).detail}catch(e){}throw new Error(this.getErrorMessage(detail,'启动登录失败'))}this.showToast('登录已开始，请在浏览器完成登录');this.showAddAccount=false;this.resetAddForm()}catch(e){this.showToast(e.message||'网络错误')}},
  async saveAccountEdit(){try{const payload={name:this.editForm.name.trim()||'Google 账号',proxy_url:this.editForm.proxyUrl.trim()||null};const r=await fetch(`/accounts/${this.editForm.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!r.ok){let detail=null;try{detail=(await r.json()).detail}catch(e){}throw new Error(this.getErrorMessage(detail,'保存失败'))}this.showToast('账号已更新');this.closeEditAccount();await this.refreshAccountsData()}catch(e){this.showToast(e.message||'保存失败')}},

  resizeTa(){const el=this.$refs.ta;el.style.height='auto';el.style.height=Math.min(el.scrollHeight,200)+'px'},
  scrollDown(){setTimeout(()=>{const el=document.getElementById('chat-scroll');if(el)el.scrollTop=el.scrollHeight},50)},

  async send(){const t=this.draft.trim();if(!t||this.busy||!this.model)return;
    this.msgs.push({role:'user',content:t});this.draft='';this.busy=true;this.resizeTa();this.scrollDown();
    const body={model:this.model,messages:this.msgs.map(m=>({role:m.role,content:m.content}))};
    if(this.cfg.temperature!==1) body.temperature=this.cfg.temperature;
    if(this.cfg.topP!==1) body.top_p=this.cfg.topP;
    if(this.cfg.maxTokens!==8192) body.max_tokens=this.cfg.maxTokens;
    if(this.cfg.stream==='on') body.stream=true;
    if(this.cfg.thinking!=='off') body.thinking=this.cfg.thinking;
    if(this.cfg.search==='on') body.grounding=true;
    if(this.cfg.safety==='off') body.safety_off=true;

    try{const r=await fetch('/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(!r.ok){let e=r.statusText;try{const d=await r.json();if(d.detail)e=JSON.stringify(d.detail)}catch(x){};this.msgs.push({role:'assistant',content:'',error:`Error ${r.status}: ${e}`})}
      else if(this.cfg.stream==='on'){
        const reader=r.body.getReader();const dec=new TextDecoder();this.msgs.push({role:'assistant',content:'',thinking:'',showThinking:false});const idx=this.msgs.length-1;let buf='';
        while(true){const{done,value}=await reader.read();if(done)break;buf+=dec.decode(value,{stream:true});const lines=buf.split('\n');buf=lines.pop();
          for(const ln of lines){if(ln.startsWith('data: ')&&ln!=='data: [DONE]'){try{const d=JSON.parse(ln.slice(6));const delta=d.choices?.[0]?.delta||{};
            const c=delta.content;if(c)this.msgs[idx].content+=c;
            const th=delta.reasoning_content||delta.thinking||delta.reasoning;if(th)this.msgs[idx].thinking+=th;
          }catch(e){}}}
          this.scrollDown()}
      }else{const d=await r.json();const msg=d.choices?.[0]?.message||{};
        this.msgs.push({role:'assistant',content:msg.content||'(无响应内容)',thinking:msg.reasoning_content||msg.thinking||msg.reasoning||'',showThinking:false})}}
    catch(e){this.msgs.push({role:'assistant',content:'',error:e.message})}
    finally{this.busy=false;this.scrollDown()}},

  fmtDate(s){if(!s)return'-';try{return new Date(s).toLocaleString()}catch(e){return s}}
}}
