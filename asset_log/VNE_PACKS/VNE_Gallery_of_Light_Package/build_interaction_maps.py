from pathlib import Path
import html, math
from PIL import ImageFont
import cairosvg

OUT=Path(__file__).resolve().parent
BG='#070A09'; PANEL='#0E1512'; PANEL2='#101A16'; LINE='#304039'; WHITE='#EDF2EE'; MUTED='#A8B8AE'; MINT='#30E5AD'; BLUE='#86ABFF'; ORANGE='#E55330'; WARM='#D9C6A0'
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

class Diagram:
    def __init__(self,w,h):
        self.w=w;self.h=h;self.parts=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">',f'''<defs>
        <linearGradient id="wall" x1="0" x2="1"><stop stop-color="#0A100D"/><stop offset=".7" stop-color="#16211B"/><stop offset="1" stop-color="#302B20"/></linearGradient>
        <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#25302A"/><stop offset="1" stop-color="#090D0B"/></linearGradient>
        <linearGradient id="light" x1="0" x2="1"><stop stop-color="#D9C6A0" stop-opacity="0"/><stop offset=".5" stop-color="#D9C6A0" stop-opacity=".24"/><stop offset="1" stop-color="#D9C6A0" stop-opacity="0"/></linearGradient>
        <marker id="arrow-mint" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="none" stroke="{MINT}" stroke-width="1.5"/></marker>
        <marker id="arrow-blue" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="none" stroke="{BLUE}" stroke-width="1.5"/></marker>
        <marker id="arrow-orange" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="none" stroke="{ORANGE}" stroke-width="1.5"/></marker>
        <marker id="arrow-gray" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="none" stroke="{MUTED}" stroke-width="1.5"/></marker>
        </defs>''']
        self.rect(0,0,w,h,BG)
    def rect(self,x,y,w,h,fill=PANEL,stroke=None,r=0,opacity=1):
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" opacity="{opacity}"'+(f' stroke="{stroke}"' if stroke else '')+'/>')
    def path(self,d,stroke=LINE,sw=2,fill='none',dash=None,arrow=None):
        self.parts.append(f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"'+(f' stroke-dasharray="{dash}"' if dash else '')+(f' marker-end="url(#arrow-{arrow})"' if arrow else '')+'/>')
    def line(self,x1,y1,x2,y2,color=LINE,sw=2,**kw): self.path(f'M{x1} {y1} L{x2} {y2}',color,sw,**kw)
    def text(self,x,y,s,size=28,color=WHITE,bold=False,anchor='start',spacing=None):
        self.parts.append(f'<text x="{x}" y="{y}" font-family="DejaVu Sans" font-size="{size}" fill="{color}" font-weight="{700 if bold else 400}" text-anchor="{anchor}"'+(f' letter-spacing="{spacing}"' if spacing else '')+f'>{html.escape(s)}</text>')
    def wrap(self,x,y,s,width,size=26,color=MUTED,bold=False,lh=None):
        font=ImageFont.truetype(BOLD if bold else FONT,size)
        lines=[]
        for para in s.split('\n'):
            row=''
            for word in para.split():
                test=f'{row} {word}'.strip()
                if font.getlength(test)>width and row:
                    lines.append(row);row=word
                else:row=test
            lines.append(row)
        for i,t in enumerate(lines):self.text(x,y+i*(lh or size*1.4),t,size,color,bold)
        return y+len(lines)*(lh or size*1.4)
    def tag(self,x,y,s,color=MINT,width=None):
        width=width or (ImageFont.truetype(FONT,22).getlength(s)+34)
        self.rect(x,y,width,37,PANEL2,color,r=18)
        self.text(x+17,y+26,s,22,color)
    def heading(self,n,title,y):
        self.text(80,y,n,25,MINT)
        self.text(145,y,title,30,WHITE,True)
    def legend(self,y,mobile=False):
        arr=[('Главы по порядку',MINT,'mint'),('Переходы на страницы',BLUE,'blue'),('Приглашение / CTA',ORANGE,'orange'),('Позднее: этапы 05–08',MUTED,'gray')]
        starts=[80,630,1210,1730] if not mobile else [80,900,80,900]
        for i,(s,col,kind) in enumerate(arr):
            yy=y if not mobile or i<2 else y+47
            x=starts[i]
            self.line(x,yy-9,x+72,yy-9,col,2.5,dash='8 8' if kind=='gray' else None,arrow=kind)
            self.text(x+94,yy,s,24,col)
    def portal(self,x,y,w,h):
        for factor,col in [(1,BLUE),(.71,MINT),(.43,ORANGE)]:
            ww=w*factor;hh=h*factor;xx=x+(w-ww)*.57;yy=y+h-hh;t=ww*.08;sk=ww*.08
            self.path(f'M{xx} {yy+hh} L{xx} {yy} L{xx+ww} {yy+sk} L{xx+ww} {yy+hh} L{xx+ww-t} {yy+hh} L{xx+ww-t} {yy+sk+t} L{xx+t} {yy+t} L{xx+t} {yy+hh} Z',col,1,col)
            self.path(f'M{xx} {yy} L{xx+12} {yy-9} L{xx+ww+12} {yy+sk-9} L{xx+ww} {yy+sk}',WHITE,.8,'none')
    def architecture(self,x,y,w,h,portal=True):
        self.rect(x,y,w,h,'url(#wall)')
        self.path(f'M{x+w*.1} {y} L{x+w*.27} {y+h*.18} L{x+w*.27} {y+h*.79} L{x+w*.1} {y+h}',LINE,2,'#0B110E')
        self.path(f'M{x+w*.72} {y} L{x+w*.92} {y+h*.1} L{x+w*.92} {y+h*.84} L{x+w*.72} {y+h*.77} Z',LINE,2,'#151C17')
        self.rect(x,y+h*.8,w,h*.2,'url(#floor)')
        self.rect(x+w*.70,y,8,h*.78,WARM,opacity=.7)
        self.rect(x+w*.63,y,w*.15,h*.81,'url(#light)')
        self.line(x+w*.16,y+h*.82,x+w*.95,y+h*.84,WARM,2)
        if portal:self.portal(x+w*.31,y+h*.16,w*.35,h*.66)
    def save(self,name):
        svg=''.join(self.parts)+'</svg>'
        (OUT/f'{name}.svg').write_text(svg)
        cairosvg.svg2png(bytestring=svg.encode(),write_to=str(OUT/f'{name}.png'))

def future(d,y,width):
    d.rect(80,y,width,180,PANEL,LINE,r=12)
    d.text(106,y+40,'ПОСЛЕ ВИЗУАЛЬНОГО ЭТАПА · 05–08',23,MUTED,True)
    labels=[('Заявка','/apply'),('Решение','модерация'),('Кабинет','/member'),('Заказ','участие'),('QR','пропуск'),('Вход','/scan')]
    gap=28;cw=(width-52-gap*5)/6
    for i,(a,b) in enumerate(labels):
        x=106+i*(cw+gap)
        d.rect(x,y+66,cw,79,'#0B100D',LINE,r=6)
        d.text(x+cw/2,y+99,a,23,WHITE,True,'middle');d.text(x+cw/2,y+130,b,21,MUTED,False,'middle')
        if i<5:d.line(x+cw+4,y+105,x+cw+gap-5,y+105,MUTED,1.6,dash='4 5',arrow='gray')

def desktop():
    d=Diagram(2400,2640)
    d.text(80,94,'ВНЕ / ГАЛЕРЕЯ СВЕТА',29,MINT,True,spacing='2')
    d.text(80,160,'Десктоп: история → выбор → приглашение',54,WHITE,True)
    d.text(80,207,'Схема будущего интерфейса. Тёмная архитектура, тёплый свет, три цветных звена портала.',27,MUTED)
    d.legend(268)
    d.heading('01','Композиция экрана и уровни взаимодействия',340)
    # Desktop composition wireframe
    d.rect(80,375,1320,465,'#0B100D',LINE,r=10)
    d.architecture(735,437,627,360)
    d.line(113,452,113,779,LINE,2)
    for i in range(6):
        yy=466+i*53
        d.text(128,yy,str(i+1).zfill(2),21,MINT if i==0 else MUTED)
    d.text(120,414,'ВНЕ',25,WHITE,True)
    d.text(646,414,'События     О проекте     Кабинет',23,WHITE)
    d.rect(1119,391,240,40,ORANGE,r=3);d.text(1239,419,'Приглашение',22,BG,False,'middle')
    d.text(202,525,'ВНЕ',92,WHITE,True)
    d.text(202,589,'За пределами привычного',29,WHITE,True)
    d.text(202,632,'Музыка. Пространство. Люди.',25,MUTED)
    d.rect(202,676,326,62,ORANGE,r=3);d.text(365,716,'Получить приглашение',22,BG,False,'middle')
    d.text(202,787,'12 колонок · текст слева · портал справа',22,MUTED)
    d.rect(1440,375,880,465,PANEL,LINE,r=10)
    d.text(1472,422,'СЛОИ — СНИЗУ ВВЕРХ',23,MUTED,True)
    layers=[('01','Архитектурный фон','Декоративный, не перехватывает касания',WARM),('02','Один WebGL-портал','Только в первом экране; SVG при ограничениях',BLUE),('03','Живой HTML / UI','Текст, кнопки и ссылки поверх графики',WHITE),('04','Шапка и главы','Якоря слева; навигация всегда доступна',MINT),('05','Меню и диалоги','Фокус внутри; Escape закрывает; возврат фокуса',ORANGE)]
    for i,(num,title,desc,col) in enumerate(layers):
        y=472+i*70
        d.text(1472,y,num,23,col);d.text(1530,y,title,26,WHITE,True);d.text(1530,y+29,desc,21,MUTED)
    # animation strip
    d.rect(80,873,2240,184,PANEL,LINE,r=10)
    d.text(110,915,'ПОРТАЛ · ОДНА ОБРАТИМАЯ СЦЕНА',24,MINT,True)
    steps=[('Загрузка','Три П-звена почти скрыты в нижнем доке.'),('Прокрутка','Звенья плавно выходят и собираются в арку.'),('Обратный скролл','Сборка идёт назад, без рывка и перезапуска.')]
    for i,(title,desc) in enumerate(steps):
        x=110+i*740
        d.text(x,961,title,27,WHITE,True)
        d.wrap(x,997,desc,666,24,MUTED)
        if i<2:d.line(x+639,962,x+700,962,MINT,2,arrow='mint')
    d.heading('02','Последовательная ось глав и боковые маршруты',1122)
    d.rect(80,1160,2240,85,'#0C1511',LINE,r=9)
    d.text(109,1198,'Шапка →',24,MINT,True)
    d.text(298,1198,'События /events      О проекте /about      Кабинет /member      Приглашение /apply',25,WHITE)
    d.text(298,1227,'Кабинет на этапе 03 — только оболочка. Ссылки доступны до завершения анимации.',22,MUTED)
    rows=[
    ('01','Порог','#threshold','Первое впечатление и мгновенный выбор.', 'Два доступных действия','Получить приглашение → /apply','Смотреть события → /events',ORANGE),
    ('02','Манифест','#manifesto','Смысл: музыка, пространство и люди.', 'Узнать больше о проекте','→ /about','Вернуться к той же главе кнопкой «Назад».',BLUE),
    ('03','Пространство','#space','Архитектура, свет и лес. Визуальная пауза.', 'Развернуть историю пространства','→ /about#space','Изображения — атмосфера, не выдуманное место события.',BLUE),
    ('04','Ближайшая ночь','#next-night','Реальная дата и статус или «Дата будет объявлена».','Выбрать событие','/events → /events/:slug → /apply?event=slug','В контексте — только публичный slug события.',BLUE),
    ('05','Принадлежность','#belonging','Сообщество и допуск к событию — разные сущности.','Понять условия участия','/about#community    ↔    /faq#access','Никаких обещаний автоматического входа.',BLUE),
    ('06','Приглашение','#invitation','Ясное действие и понятное объяснение следующего шага.','Перейти к форме','/apply    ↔    /rules · /faq · /privacy · /consent','На этапе 03 форма работает в демонстрационном режиме.',ORANGE)
    ]
    for i,(num,title,anchor,desc,rt,a,b,col) in enumerate(rows):
        y=1284+i*153
        d.rect(80,y,1050,128,PANEL,LINE,r=9);d.rect(80,y,5,128,MINT,r=2)
        d.text(112,y+45,num,32,MINT,True);d.text(190,y+45,title,33,WHITE,True);d.text(190,y+79,anchor,23,MINT)
        d.text(112,y+111,desc,23,MUTED)
        d.line(1133,y+64,1210,y+64,col,2.4,arrow='orange' if col==ORANGE else 'blue')
        d.rect(1235,y,1085,128,'#0C1210',LINE,r=9)
        d.text(1266,y+36,rt,24,MUTED);d.text(1266,y+77,a,25,col,True);d.text(1266,y+111,b,21,MUTED)
        if i<5:d.line(100,y+130,100,y+149,MINT,2,arrow='mint')
    d.text(80,2250,'Подвал → контакты, правила и документы. Прокрутка конечная; главы доступны напрямую.',25,MUTED)
    future(d,2290,2240)
    d.text(80,2524,'Меньше движения → статичный собранный SVG. UI сохраняется при недоступном WebGL.',26,WHITE)
    d.text(80,2578,'ПЛАН ДИЗАЙНА / ЭТАПЫ 02–03',22,MINT,True)
    d.text(2320,2578,'01 / DESKTOP',22,MUTED,False,'end')
    d.save('01_Desktop_Interaction_Map')

def mobile():
    d=Diagram(1800,2940)
    d.text(80,90,'ВНЕ / ГАЛЕРЕЯ СВЕТА',27,MINT,True,spacing='2')
    d.text(80,156,'Мобильный: одна колонка, ясный путь',46,WHITE,True)
    d.text(80,202,'Та же история и маршруты — отдельная композиция для телефона.',26,MUTED)
    d.legend(255,True)
    d.heading('01','Композиция и управление пальцем',375)
    # mobile device
    d.rect(80,414,560,960,'#050806',LINE,r=30)
    d.rect(104,438,512,914,'#101710',LINE,r=18)
    d.text(136,486,'ВНЕ',30,WHITE,True);d.text(582,484,'Меню  ≡',25,WHITE,False,'end')
    d.line(126,509,594,509,LINE,1)
    d.text(137,557,'01 / ПОРОГ',22,MINT)
    d.text(137,622,'ВНЕ',68,WHITE,True)
    d.text(137,670,'За пределами',31,WHITE,True)
    d.text(137,710,'привычного',31,WHITE,True)
    d.text(137,752,'Музыка. Пространство. Люди.',21,MUTED)
    d.rect(137,780,444,64,ORANGE,r=3);d.text(359,821,'Получить приглашение',24,BG,False,'middle')
    d.text(359,886,'Смотреть события →',24,WHITE,False,'middle')
    d.architecture(126,919,468,330)
    d.text(137,1297,'↓  Манифест',25,MINT)
    d.line(292,1330,428,1330,MUTED,4)
    # UX panels
    specs=[
    (414,'01','Читаемый первый экран','Текст и CTA находятся над порталом.\nГрафика не перекрывает кнопку и заголовок.',MINT),
    (634,'02','Одна навигация в меню','Главы 01–06 + События + О проекте + Кабинет.\nЛевого rail и горизонтальной прокрутки нет.',BLUE),
    (854,'03','Приглашение под рукой','Нижний CTA появляется после hero. Скрывается,\nкогда виден другой CTA, открыто меню / клавиатура\nили пользователь уже находится на /apply.',ORANGE),
    (1104,'04','Спокойная анимация','Один портал; движение связано со скроллом.\nСлабое устройство / меньше движения → SVG.\nОтступы учитывают safe area телефона.',WARM)]
    for y,num,title,body,col in specs:
        h=190 if num!='03' else 220
        d.rect(690,y,1030,h,PANEL,LINE,r=12)
        d.text(721,y+46,num,29,col,True);d.text(788,y+46,title,30,WHITE,True)
        d.wrap(721,y+92,body,951,26,MUTED,lh=39)
    d.text(80,1428,'Порядок слоёв: фон → портал → HTML / UI → шапка → меню с управлением фокусом.',26,MUTED)
    d.heading('02','История вниз; переходы — по выбранному действию',1500)
    # Six route rows
    rows=[
        ('01','Порог','#threshold','Понять настроение и выбрать действие.','/apply  или  /events',ORANGE),
        ('02','Манифест','#manifesto','Коротко объяснить идею ВНЕ.','/about',BLUE),
        ('03','Пространство','#space','Погрузиться в архитектуру, свет и лес.','/about#space',BLUE),
        ('04','Ближайшая ночь','#next-night','Проверить событие, дату и статус.','/events → /events/:slug',BLUE),
        ('05','Принадлежность','#belonging','Понять сообщество и правила допуска.','/about#community ↔ /faq#access',BLUE),
        ('06','Приглашение','#invitation','Открыть форму и объяснение шага.','/apply ↔ /rules · /faq',ORANGE)]
    for i,(num,title,anchor,desc,route,col) in enumerate(rows):
        y=1536+i*147
        d.rect(80,y,780,122,PANEL,LINE,r=10);d.rect(80,y,5,122,MINT,r=2)
        d.text(109,y+44,num,29,MINT,True);d.text(170,y+44,title,30,WHITE,True)
        d.text(170,y+76,anchor,21,MINT);d.text(109,y+105,desc,22,MUTED)
        d.line(865,y+61,925,y+61,col,2.2,arrow='orange' if col==ORANGE else 'blue')
        d.rect(952,y,768,122,'#0B120F',LINE,r=10)
        d.text(982,y+48,'ПЕРЕХОД НА СТРАНИЦУ',20,MUTED)
        d.text(982,y+88,route,24,col,True)
        if i<5:d.line(102,y+123,102,y+143,MINT,2,arrow='mint')
    d.rect(80,2445,1640,132,'#101911',LINE,r=10)
    d.text(110,2486,'Форма и полезные связи',27,WHITE,True)
    d.text(110,2525,'Событие → /apply?event=slug. Правила / FAQ открываются с понятным возвратом.',25,MUTED)
    d.text(110,2558,'Согласия → /privacy и /consent. Контакты и остальные документы — в подвале.',25,MUTED)
    future(d,2605,1640)
    d.text(80,2846,'Прототип этапа 03: без отправки заявок и без обещания реального допуска.',25,WHITE)
    d.text(80,2902,'ПЛАН ДИЗАЙНА / ЭТАПЫ 02–03',21,MINT,True)
    d.text(1720,2902,'02 / MOBILE',21,MUTED,False,'end')
    d.save('02_Mobile_Interaction_Map')

desktop();mobile()
print('Created desktop and mobile PNG + SVG interaction maps.')
