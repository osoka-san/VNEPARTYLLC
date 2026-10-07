"""Offline SVG raster + exact bytes + protected centres + two independent decoders."""
import sys,json,io
from pathlib import Path
import cairosvg,numpy as np,zxingcpp,cv2
from PIL import Image,ImageFilter,ImageOps,ImageDraw
root=Path(sys.argv[1]); cases=json.loads((root/'manifest.json').read_text());results=[]
for c in cases:
 svg=(root/(c['name']+'.svg')).read_bytes()
 def render(size):return Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg,output_width=size,output_height=size))).convert('RGB')
 n=c['size']; scale=30; image=render((n+8)*scale); pixels=np.array(image)
 bg=np.array([int(c['pattern']['palette']=='night')])
 inv=c['inverted'];palette={'night':('#070A09','#30E5AD'),'mint':('#30E5AD','#070A09'),'paper':('#EDF2EE','#070A09')}
 bc,fc=palette[c['pattern']['palette']];col=lambda h:np.array([int(h[j:j+2],16) for j in [1,3,5]])
 # Glyph renderer protects the central 0.24 x 0.24 square of every module.
 # It may bend the outer area. Dark data centres can use the brand accent;
 # functional modules retain exact foreground/background, never an accent.
 accent=col('#E55330')
 for y in range(n):
  for x in range(n):
   dark=bool(c['matrix'][y*n+x]);functional=bool(c['reserved'][y*n+x])
   allowed=[col(fc if dark else bc)]
   if dark and not functional and c['pattern']['accents']:allowed.append(accent)
   for dx,dy in [(0.5,0.5),(.38,.38),(.62,.38),(.62,.62),(.38,.62)]:
    actual=pixels[int((y+4+dy)*scale),int((x+4+dx)*scale)]
    assert min(np.max(np.abs(actual.astype(int)-expected)) for expected in allowed)<5,(c['name'],x,y,dx,dy,actual.tolist())
 for quiet in [pixels[:4*scale,:,:],pixels[-4*scale:,:,:],pixels[:,:4*scale,:],pixels[:,-4*scale:,:]]:
  assert np.all(quiet==col(bc)),c['name']
 base=render(420);buf=io.BytesIO();base.save(buf,format='JPEG',quality=75);jpeg=Image.open(io.BytesIO(buf.getvalue())).convert('RGB')
 variants={'900':render(900),'420':base,'280':render(280),'jpeg420':jpeg,'blur420':base.filter(ImageFilter.GaussianBlur(.45))}
 checks=[]
 for label,im in variants.items():
  dec=zxingcpp.read_barcode(im,formats=zxingcpp.BarcodeFormat.QRCode,try_invert=True)
  ok=dec is not None and bytes(dec.bytes)==c['text'].encode('utf-8')
  arr=cv2.cvtColor(np.array(im),cv2.COLOR_RGB2GRAY)
  if inv:arr=255-arr
  decoded,_,_=cv2.QRCodeDetector().detectAndDecode(arr)
  checks.append({'variant':label,'zxingBytes':ok,'opencvTextWithInversionIfNeeded':decoded==c['text']})
  if label in ['900','420','280']:im.save(root/(c['name']+'-'+label+'.png'))
 results.append({'name':c['name'],'centres':'PASS','checks':checks})
thumb=360; sheet=Image.new('RGB',(thumb*5,thumb*4),'#070A09');d=ImageDraw.Draw(sheet)
for i,c in enumerate(cases[:20]):
 im=Image.open(root/(c['name']+'-420.png')).resize((320,320))
 x=(i%5)*thumb+20;y=(i//5)*thumb+12;sheet.paste(im,(x,y));d.text((x,y+326),c['name'],fill='#edf2ee')
sheet.save(root/'series-syncopa.png')
for i,c in enumerate(cases[20:]):
 im=Image.open(root/(c['name']+'-420.png')).resize((320,320));x=(i%5)*thumb+20;y=(i//5)*thumb+12;sheet.paste(im,(x,y));d.text((x,y+326),c['name']+'    ',fill='#edf2ee')
sheet.save(root/'series-flow.png')
(root/'validation.json').write_text(json.dumps(results,indent=2))
fails=[(r['name'],c) for r in results for c in r['checks'] if not c['zxingBytes']]
cvfails=[(r['name'],c['variant']) for r in results for c in r['checks'] if not c['opencvTextWithInversionIfNeeded']]
print(json.dumps({'cases':len(cases),'zxing_checks':len(cases)*5,'zxing_failures':fails,'opencv_failures':cvfails},ensure_ascii=False))
if fails:sys.exit(1)
