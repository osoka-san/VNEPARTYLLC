import asyncio, json, os, sys
from playwright.async_api import async_playwright
B="http://localhost:8080"; SH="/dev-server/docs/sprint/evidence/03-8/shots"; os.makedirs(SH,exist_ok=True)
R={}
def log(*a): print(*a,file=sys.stderr)
OFF_JSON=None
async def ctx(p,**kw):
  b=await p.chromium.launch(headless=True,args=kw.pop("args",[])); c=await b.new_context(viewport=kw.pop("vp",{"width":1280,"height":1800}),**kw); return b,c
async def fill_ok(pg):
  await pg.fill("#name","Тест"); await pg.fill("#contact","test@example.invalid")
async def main():
 async with async_playwright() as p:
  # 1 no-JS apply
  b,c=await ctx(p,java_script_enabled=False,vp={"width":390,"height":844}); pg=await c.new_page()
  reqs=[]; pg.on("request",lambda r: reqs.append(r.url))
  await pg.goto(B+"/apply?event=light-study-01",wait_until="networkidle")
  st=await pg.evaluate("""()=>({fs:document.querySelector('form fieldset').disabled,name:document.querySelector('#name').matches(':disabled'),submit:document.querySelector('form button[type=submit]').matches(':disabled'),noscript:[...document.querySelectorAll('noscript')].some(n=>n.textContent.includes('нужен JavaScript'))})""")
  n0=len(reqs); await pg.locator("form button[type=submit]").click(force=True,timeout=2000); await pg.wait_for_timeout(500)
  await pg.locator("#name").press("Enter",timeout=2000) if False else None
  await pg.keyboard.press("Enter"); await pg.wait_for_timeout(500)
  st.update(url_after=pg.url.replace(B,""),pd_in_requests=[u for u in reqs if "name=" in u or "contact=" in u],requests_after_clicks=len(reqs)-n0)
  await pg.screenshot(path=SH+"/apply-nojs-390.png"); R["apply_nojs"]=st; await b.close()
  # 1b delayed hydration
  b,c=await ctx(p,vp={"width":390,"height":844}); pg=await c.new_page(); reqs=[]
  pg.on("request",lambda r: reqs.append(r.url))
  hold=asyncio.Event()
  async def route(rt):
    if rt.request.resource_type=="script": await hold.wait()
    try: await rt.continue_()
    except Exception: pass
  await pg.route("**/*",route)
  await pg.goto(B+"/apply",wait_until="commit"); await pg.wait_for_selector("#name",state="attached")
  pre=await pg.evaluate("({fs:document.querySelector('form fieldset').disabled,hyd:document.querySelector('form').dataset.hydrated})")
  try: await pg.locator("form button[type=submit]").click(force=True,timeout=1500)
  except Exception as e: pre["click_err"]=type(e).__name__
  await pg.keyboard.press("Enter"); await pg.wait_for_timeout(300)
  pre["url_before_hydration"]=pg.url.replace(B,""); hold.set()
  await pg.wait_for_function("document.querySelector('form')?.dataset.hydrated==='true'",timeout=20000)
  pre["after"]=await pg.evaluate("document.querySelector('form fieldset').disabled"); pre["pd_in_requests"]=[u for u in reqs if "contact=" in u]
  R["apply_delayed_hydration"]=pre; await b.close()
  # 2 validation
  b,c=await ctx(p,vp={"width":390,"height":844}); pg=await c.new_page()
  await pg.goto(B+"/apply",wait_until="networkidle"); await pg.wait_for_function("document.querySelector('form').dataset.hydrated==='true'")
  val={}
  for v in ["-------","(((((((","a@b@c.ru","+7 (999) 123-45-67","test@example.invalid"]:
    await pg.fill("#name","Тест"); await pg.fill("#contact",v); await pg.get_by_role("button",name="Проверить заполнение").click(); await pg.wait_for_timeout(250)
    dlg=await pg.locator("[role=dialog]").count(); err=await pg.locator("#contact-error").count(); val[v]={"dialog":dlg>0,"error":err>0}
    if dlg: await pg.keyboard.press("Escape"); await pg.wait_for_timeout(1000)
  R["validation"]=val
  # 6 hit areas
  await pg.fill("#contact","test@example.invalid"); await pg.get_by_role("button",name="Проверить заполнение").click(); await pg.wait_for_timeout(1200)
  R["hit"]={"dialog_ok":await pg.get_by_role("button",name="Понятно").evaluate("e=>e.getBoundingClientRect().height"),"dialog_close":await pg.locator("[role=dialog] button:has(.sr-only)").evaluate("e=>[e.offsetWidth,e.offsetHeight]")}
  # long dialog scroll
  await pg.evaluate("()=>{const d=document.querySelector('[role=dialog]');const p=document.createElement('p');p.textContent='Длинный тестовый текст. '.repeat(400);d.insertBefore(p,d.children[1])}")
  await pg.wait_for_timeout(100)
  R["long_dialog"]=await pg.evaluate("()=>{const d=document.querySelector('[role=dialog]');const r=d.getBoundingClientRect();d.scrollTop=1e6;const ok=[...d.querySelectorAll('button')].find(b=>b.textContent.includes('Понятно')).getBoundingClientRect();return {top:r.top,bottom:r.bottom,vh:innerHeight,scrollH:d.scrollHeight,clientH:d.clientHeight,ov:getComputedStyle(d).overflowY,ok_visible_after_scroll:ok.bottom<=r.bottom+1&&ok.top>=r.top}}")
  await pg.screenshot(path=SH+"/dialog-long-scroll-390.png"); await b.close()
  # 4 mobile menu
  R["menu_fit"]={}
  for w,h in [(390,740),(360,640),(740,360)]:
    b,c=await ctx(p,vp={"width":w,"height":h}); pg=await c.new_page(); await pg.goto(B+"/events",wait_until="networkidle")
    await pg.get_by_role("button",name="Открыть меню").click(); await pg.wait_for_timeout(900)
    links=pg.locator("[role=dialog] a"); n=await links.count(); last=links.nth(n-1)
    info=await pg.evaluate("()=>{const d=document.querySelector('[role=dialog]');return {sh:d.scrollHeight,ch:d.clientHeight,ov:getComputedStyle(d).overflowY}}")
    for _ in range(n+3): await pg.keyboard.press("Tab")
    await last.focus(); await pg.wait_for_timeout(100)
    rr=await last.evaluate("e=>{const r=e.getBoundingClientRect();return [r.top,r.bottom]}")
    info.update(links=n,last=await last.inner_text(),last_rect=rr,last_in_view=rr[0]>=0 and rr[1]<=h,close_visible=await pg.get_by_role("button",name="Закрыть меню").is_visible())
    await pg.screenshot(path=SH+f"/menu-{w}x{h}-last-focused.png"); R["menu_fit"][f"{w}x{h}"]=info; await b.close()
  # 5 noJS hero overlap
  R["nojs_hero"]={}
  for w,h in [(360,640),(360,800),(390,844),(844,390)]:
    b,c=await ctx(p,java_script_enabled=False,vp={"width":w,"height":h}); pg=await c.new_page(); await pg.goto(B+"/",wait_until="networkidle")
    r=await pg.evaluate("""()=>{const img=document.querySelector('[data-static-portal=noscript] img');if(!img)return null;const b=img.getBoundingClientRect();const ar=img.naturalWidth/img.naturalHeight||1;let w=b.width,h=b.height;if(w/h>ar)w=h*ar;else h=w/ar;const box={l:b.left+(b.width-w)/2,t:b.top+(b.height-h)/2,r:b.left+(b.width+w)/2,b:b.top+(b.height+h)/2};
    const els=[...document.querySelectorAll('#threshold h1,#threshold a,#threshold p,#threshold [aria-live],#threshold .portal-dock,header')].filter(e=>e.offsetParent&&e.getBoundingClientRect().height>0);
    const hits=els.filter(e=>{const q=e.getBoundingClientRect();return q.left<box.r&&q.right>box.l&&q.top<box.b&&q.bottom>box.t}).map(e=>e.textContent.trim().slice(0,30));
    return {box:[Math.round(box.l),Math.round(box.t),Math.round(box.r),Math.round(box.b)],svgH:Math.round(h),overlaps:hits}}""")
    await pg.screenshot(path=SH+f"/nojs-hero-{w}x{h}.png"); R["nojs_hero"][f"{w}x{h}"]=r; await b.close()
  # WebGL off (real)
  b,c=await ctx(p,args=["--disable-webgl","--disable-webgl2","--disable-3d-apis","--disable-gpu","--disable-software-rasterizer"],vp={"width":1440,"height":1000}); pg=await c.new_page()
  await pg.goto(B+"/",wait_until="networkidle"); await pg.wait_for_timeout(4000)
  R["webgl_off"]=await pg.evaluate("({webgl:!!document.createElement('canvas').getContext('webgl'),webgl2:!!document.createElement('canvas').getContext('webgl2'),static:document.querySelectorAll('[data-static-portal]').length,canvas:document.querySelectorAll('canvas').length})")
  await pg.screenshot(path=SH+"/home-webgl-off-1440.png"); await b.close()
  # 4 modes: menu + dialog
  R["modes"]={}
  for mode in ["normal","manual","system","preset-off"]:
    b,c=await ctx(p,vp={"width":390,"height":844},reduced_motion="reduce" if mode=="system" else "no-preference"); pg=await c.new_page()
    if mode=="preset-off":
      await pg.goto(B+"/admin",wait_until="networkidle"); await pg.locator("button:has-text('Всё появляется сразу')").click(); await pg.wait_for_timeout(300)
    await pg.goto(B+"/events",wait_until="networkidle")
    if mode=="manual":
      await pg.get_by_role("button",name="Движение").first.click(); await pg.wait_for_timeout(300)
    dom=await pg.evaluate("({reduce:document.documentElement.dataset.reduceMotion,menu:document.documentElement.dataset.motionMenu,dialog:document.documentElement.dataset.motionDialog})")
    await pg.get_by_role("button",name="Открыть меню").click(); m=[]
    for t in [40,200,900]:
      await pg.wait_for_timeout(t-(0 if not m else [40,200,900][len(m)-1]))
      m.append(await pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.vne-sheet-overlay')).opacity)"))
    await pg.keyboard.press("Escape"); await pg.wait_for_timeout(600); mf=await pg.evaluate("document.activeElement.getAttribute('aria-label')")
    await pg.goto(B+"/apply",wait_until="networkidle"); await pg.wait_for_function("document.querySelector('form').dataset.hydrated==='true'"); await fill_ok(pg)
    await pg.get_by_role("button",name="Проверить заполнение").click(); d=[]
    for t in [40,1100]:
      await pg.wait_for_timeout(t if not d else t-40)
      d.append(await pg.evaluate("(()=>{const e=document.querySelector('[role=dialog]');const r=e.getBoundingClientRect();return {op:+(+getComputedStyle(e).opacity).toFixed(3),x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}})()"))
    await pg.keyboard.press("Escape"); await pg.wait_for_timeout(1000); df=await pg.evaluate("document.activeElement.textContent.trim()")
    R["modes"][mode]={"dom":dom,"menu_overlay_40_200_900ms":m,"menu_escape_focus":mf,"dialog_40ms_final":d,"dialog_escape_focus":df}
    await b.close()
  # admin: import dialog, image replay curve
  b,c=await ctx(p,vp={"width":1440,"height":1000}); pg=await c.new_page(); await pg.goto(B+"/admin",wait_until="networkidle")
  imp=pg.get_by_role("button",name="Вставить JSON")
  if not await imp.is_visible(): await pg.get_by_text("Инструменты настроек").click(); await pg.wait_for_timeout(300)
  await imp.click(); await pg.wait_for_timeout(500); await pg.keyboard.press("Escape"); await pg.wait_for_timeout(900)
  f1=await pg.evaluate("document.activeElement.textContent.trim()")
  await imp.click(); await pg.wait_for_timeout(500); await pg.locator("[role=dialog] textarea").fill("null"); await pg.get_by_role("button",name="Применить").click(); await pg.wait_for_timeout(300)
  err=await pg.locator("#motion-import-error").inner_text(); await pg.get_by_role("button",name="Отмена").click(); await pg.wait_for_timeout(900)
  R["admin_import"]={"escape_focus":f1,"null_error":err,"cancel_focus":await pg.evaluate("document.activeElement.textContent.trim()")}
  await pg.locator("button:text-is('Дополнительно'), [role=radio]:text-is('Дополнительно')").first.click(); await pg.wait_for_timeout(1500)
  await pg.get_by_role("button",name="Повторить пример").first.click()
  curve=[]
  for i in range(16):
    curve.append(await pg.evaluate("(()=>{const e=document.querySelector('[data-image-reveal=replay]');if(!e)return null;const i=e.firstElementChild;return [performance.now()|0,+(+getComputedStyle(e).opacity).toFixed(3),getComputedStyle(e).transform,getComputedStyle(i).transform]})()"))
    await pg.wait_for_timeout(45)
  R["admin_image_replay_curve"]=curve; await pg.locator("[data-image-reveal=replay]").screenshot(path=SH+"/admin-image-replay-final.png"); await b.close()
  # 8 runtime text effects
  b,c=await ctx(p,vp={"width":1440,"height":1000}); pg=await c.new_page(); errs=[]; pg.on("pageerror",lambda e: errs.append(str(e)))
  await pg.goto(B+"/",wait_until="networkidle")
  h2=pg.locator("#manifesto-title"); ph=[]
  await pg.evaluate("window.scrollTo(0, document.querySelector('#manifesto').offsetTop - innerHeight*0.6)")
  for _ in range(10):
    ph.append(await h2.evaluate("e=>{const r=e.querySelector('[data-roll]');const m=e.querySelector('[data-roll] .inline-block .inline-block');return [r?r.dataset.roll:'plain', m?getComputedStyle(m).transform.slice(0,40):null]}")); await pg.wait_for_timeout(90)
  R["text_roll"]={"frames":ph,"final_text":(await h2.inner_text()).strip()}
  await h2.screenshot(path=SH+"/home-text-roll-final.png")
  sec=pg.locator("[data-text-section]").first; tp=[]
  for dy in [0,250,250,250,-250,-250,-250]:
    await pg.mouse.wheel(0,dy); await pg.wait_for_timeout(250); tp.append(await sec.get_attribute("data-text-section-progress"))
  R["text_section_forward_back"]=tp
  sc={}
  for num in ["03","04","05","06"]:
    await pg.goto(B+"/",wait_until="networkidle")
    sel=f"([...document.querySelectorAll('main p')].find(e=>e.textContent.includes('{num} /')&&e.textContent.length<60)).firstElementChild"
    await pg.evaluate(f"(()=>{{const e={sel}; window.scrollTo(0, e.parentElement.getBoundingClientRect().top+scrollY-innerHeight*1.2)}})()")
    await pg.wait_for_timeout(300)
    await pg.evaluate(f"(()=>{{const e={sel}; window.scrollTo(0, e.parentElement.getBoundingClientRect().top+scrollY-innerHeight*0.5)}})()")
    frames=[]
    for _ in range(14):
      frames.append(await pg.evaluate(f"(()=>{{const e={sel};const sr=e.parentElement.querySelector('.sr-only');const v=e.parentElement.querySelector('.absolute');return [sr?sr.textContent:e.parentElement.textContent, v?v.textContent:null]}})()")); await pg.wait_for_timeout(30)
    await pg.wait_for_timeout(800); frames.append(await pg.evaluate(f"(()=>{{const e={sel};const sr=e.parentElement.querySelector('.sr-only');const v=e.parentElement.querySelector('.absolute');return [sr?sr.textContent:e.parentElement.textContent, v?v.textContent:null]}})()"))
    lab=frames[0][0]
    sc[num]={"label":lab,"visual_frames":[f[1] for f in frames],"intermediate_differs":any(f[1] and f[1]!=lab for f in frames[:-1]),"final_equals":frames[-1][1] in (lab,None)}
  R["scramble_labels"]=sc
  async def loop(url,shot):
    await pg.goto(B+url,wait_until="networkidle"); await pg.mouse.move(5,5); btn=pg.locator("button[aria-label*='смену слов']").first
    await btn.evaluate("e=>e.scrollIntoView({block:'center'})"); await pg.wait_for_timeout(300); host=btn.locator("xpath=..")
    log(await btn.count())
    w=[]
    for _ in range(24): w.append((await btn.evaluate("e=>e.parentElement.innerText")).strip()); await pg.wait_for_timeout(500)
    size=await btn.evaluate("e=>[e.offsetWidth,e.offsetHeight]"); await btn.click(); p1=(await btn.evaluate("e=>e.parentElement.innerText")).strip(); await pg.wait_for_timeout(5500); p2=(await btn.evaluate("e=>e.parentElement.innerText")).strip()
    await btn.evaluate("e=>e.parentElement.scrollIntoView({block:'center'})"); await pg.screenshot(path=SH+shot); return {"words_seen":sorted(set(w)),"pause_btn":size,"paused_same":p1==p2,"paused_word":p2}
  R["text_loop_home"]=await loop("/","/home-text-loop.png"); R["text_loop_about"]=await loop("/about","/about-text-loop.png")
  imgs=await pg.evaluate("[...document.querySelectorAll('main picture img')].map(i=>({src:i.currentSrc.split('/').pop(),ok:i.complete&&i.naturalWidth>0}))")
  R["about_media"]=imgs; await pg.screenshot(path=SH+"/about-1440.png")
  await pg.goto(B+"/events",wait_until="networkidle"); card=pg.locator("main article").first; await card.evaluate("e=>e.scrollIntoView({block:'center'})"); await pg.wait_for_timeout(1200)
  await pg.mouse.move(5,5); box=await card.bounding_box(); before=await card.evaluate("e=>getComputedStyle(e.parentElement.parentElement).transform")
  await pg.mouse.move(box["x"]+10,box["y"]+10); await pg.mouse.move(box["x"]+box["width"]*0.8,box["y"]+box["height"]*0.2,steps=8); await pg.wait_for_timeout(500)
  R["card_hover"]={"before":before,"after_chain":await card.evaluate("e=>[e.parentElement.parentElement,e.parentElement,e].map(x=>x.className.toString().slice(0,30)+' | '+getComputedStyle(x).transform.slice(0,60))"),"bg_items":await pg.locator("[data-animated-background-item]").count()}
  await card.screenshot(path=SH+"/events-card-hover.png")
  R["page_errors"]=errs; await b.close()
 print(json.dumps(R,ensure_ascii=False,indent=1))
async def safe():
  try: await main()
  except Exception as e:
    R['_error']=repr(e)[:400]; print(json.dumps(R,ensure_ascii=False,indent=1))
asyncio.run(safe())
