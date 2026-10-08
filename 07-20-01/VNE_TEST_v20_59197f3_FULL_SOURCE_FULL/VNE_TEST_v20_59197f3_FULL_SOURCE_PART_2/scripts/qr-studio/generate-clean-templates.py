from pathlib import Path
import json,math
import numpy as np
from shapely.geometry import box,Point,LineString
from shapely.affinity import translate,rotate,scale
OUT=Path(__file__).resolve().parents[2] / "src/lib/qr-studio"

def cubic(a,b,c,d):
 a,b,c,d=map(np.array,[a,b,c,d]);return [tuple((1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d)for t in np.linspace(0,1,61)]
bases=[]
for w,h in [(1,2),(1,3),(2,3),(2,4),(2,2),(1,4),(2,5)]:
 for tension in [.45,.55,.65,.75]:bases.append(('S',cubic((0,0),(0,h*tension),(w,h*(1-tension)),(w,h))))
for w,h in [(1,2),(1.5,2),(1.5,3),(2,3)]:
 for tension in [.3,.5,.7]:bases.append(('C',cubic((w,0),(-w*tension,0),(-w*tension,h),(w,h))))
for w,h in [(1,1),(1.5,1.5),(2,2),(2,1),(1,2),(2,3),(3,2)]:
 for tension in [.55,.65,.75]:bases.append(('J',cubic((0,0),(0,h*tension),(w*(1-tension),h),(w,h))))
output=[];dedup={}
for typ,pts in bases:
 start=np.array(pts[0]);end=np.array(pts[-1]);u=start-np.array(pts[1]);u/=np.linalg.norm(u);v=end-np.array(pts[-2]);v/=np.linalg.norm(v)
 for width in [1.0,1.08,1.16,1.24,1.32]:
  original=LineString([start+u*.38,*pts,end+v*.38]).buffer(width/2,cap_style='flat',quad_segs=12).simplify(.0007,preserve_topology=True)
  for angle in [0,90,180,270]:
   for flip in [1,-1]:
    g=translate(rotate(scale(original,xfact=flip,yfact=1,origin=(0,0)),angle,origin=(0,0)),xoff=.5,yoff=.5)
    mnx,mny,mxx,mxy=g.bounds;owned=[];touched=[];bad=False;protected=[]
    for yy in range(math.floor(mny),math.ceil(mxy)):
     for xx in range(math.floor(mnx),math.ceil(mxx)):
      core=box(xx+.335,yy+.335,xx+.665,yy+.665)
      area=g.intersection(core).area
      if area>1e-8:
       if core.difference(g).area>1e-8:bad=True;break
       owned.append((xx,yy))
      if g.intersection(box(xx,yy,xx+1,yy+1)).area>1e-8:touched.append((xx,yy))
     if bad:break
    if bad or len(owned)<3 or len(owned)>10:continue
    def ring(shape):return [[[round(x,4),round(y,4)]for x,y in shape.exterior.coords],*[[[round(x,4),round(y,4)]for x,y in r.coords]for r in shape.interiors]]
    signature=(typ,tuple(sorted(owned)),tuple(touched))
    # Avoid huge library: keep width nearest1.16 for each distinct modulefootprint.
    t={'rings':ring(g),'expanded':ring(g.buffer(.12,quad_segs=8)),'required':owned,'owned':owned,'touched':touched,'bounds':list(g.bounds),'type':typ,'width':width,'blocked':[(x,y)for x,y in touched if (x,y)not in owned and g.intersection(box(x+.08,y+.08,x+.92,y+.92)).area>1e-8]}
    desirability=abs(width-1.16)
    if signature not in dedup or desirability<dedup[signature][0]:dedup[signature]=(desirability,t)
output=[v[1]for v in dedup.values()]
json.dump(output,open(OUT/'strict-templates.json','w'),separators=(',',':'))
print('cleantemplates',len(output), 'types',{k:sum(t['type']==k for t in output)for k in ['S','C','J']})
