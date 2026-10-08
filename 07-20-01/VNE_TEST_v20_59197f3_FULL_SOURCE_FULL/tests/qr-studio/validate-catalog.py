"""New catalogue material gate. The existing flat-colour validation remains unchanged."""
import sys,json,io
from pathlib import Path
import cairosvg,numpy as np,zxingcpp
from PIL import Image,ImageFilter,ImageDraw
root=Path(sys.argv[1]);cases=json.loads((root/'manifest.json').read_text());results=[]
materials={'ribs','folds','enamel','relief','basalt','portals','weave','origami','constellation','marble'}
palette={'night':('#070A09','#30E5AD'),'mint':('#30E5AD','#070A09'),'paper':('#EDF2EE','#070A09')}
col=lambda h:np.array([int(h[j:j+2],16) for j in [1,3,5]])
weights=np.array([.2126,.7152,.0722])
for c in cases:
 svg=(root/(c['name']+'.svg')).read_bytes()
 def render(size):return Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg,output_width=size,output_height=size))).convert('RGB')
 n=c['size'];scale=30;pixels=np.array(render((n+8)*scale));bc,fc=map(col,palette[c['pattern']['palette']]);accent=col('#E55330');material=c['pattern'].get('template') in materials
 for y in range(n):
  for x in range(n):
   dark=bool(c['matrix'][y*n+x]);functional=bool(c['reserved'][y*n+x])
   for dx,dy in [(0.5,0.5),(.38,.38),(.62,.38),(.62,.62),(.38,.62)]:
    actual=pixels[int((y+4+dy)*scale),int((x+4+dx)*scale)].astype(int)
    if material and dark:
     # Gradients are allowed only on the foreground side of the contrast margin.
     signed=(actual-bc)@weights;expected=(fc-bc)@weights
     assert signed/expected>.25,(c['name'],'low core contrast',x,y,dx,dy,actual.tolist())
    else:
     allowed=[fc if dark else bc]
     if dark and not functional and c['pattern']['accents']:allowed.append(accent)
     assert min(np.max(np.abs(actual-e)) for e in allowed)<5,(c['name'],'core',x,y,dx,dy,actual.tolist())
 for quiet in [pixels[:4*scale,:,:],pixels[-4*scale:,:,:],pixels[:,:4*scale,:],pixels[:,-4*scale:,:]]:assert np.all(quiet==bc),c['name']
 base=render(420);buf=io.BytesIO();base.save(buf,format='JPEG',quality=75);jpeg=Image.open(io.BytesIO(buf.getvalue())).convert('RGB');variants={'900':render(900),'420':base,'280':render(280),'jpeg420':jpeg,'blur420':base.filter(ImageFilter.GaussianBlur(.45))};checks=[]
 for label,im in variants.items():
  result=zxingcpp.read_barcode(im,formats=zxingcpp.BarcodeFormat.QRCode,try_invert=True)
  checks.append({'variant':label,'zxingBytes':result is not None and bytes(result.bytes)==c['text'].encode('utf-8')})
  if label in ['900','420','280']:im.save(root/(c['name']+'-'+label+'.png'))
 results.append({'name':c['name'],'samplingCore':'PASS','quiet':'PASS','checks':checks})
(root/'validation.json').write_text(json.dumps(results,indent=2));fails=[(r['name'],v['variant']) for r in results for v in r['checks'] if not v['zxingBytes']]
print(json.dumps({'cases':len(cases),'checks':len(cases)*5,'failures':fails}));
sheet=Image.new('RGB',(4*380,4*405),'#070A09');draw=ImageDraw.Draw(sheet)
for i,c in enumerate([c for c in cases if c['name'].endswith('-0')]):
 x=i%4*380;y=i//4*405;sheet.paste(Image.open(root/(c['name']+'-420.png')).resize((360,360)),(x+10,y+10));draw.text((x+18,y+375),c['name'],fill='#30e5ad')
sheet.save(root/'catalog-overview.png')
if fails:sys.exit(1)
