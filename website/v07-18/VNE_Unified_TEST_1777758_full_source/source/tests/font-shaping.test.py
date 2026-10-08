#!/usr/bin/env python3
"""HarfBuzz shaping-data comparison for unchanged RU/EN text, not browser pixels."""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen
import ctypes as C
import ctypes.util
import io
import json

hb=C.CDLL(ctypes.util.find_library('harfbuzz'))
ptr=C.c_void_p
class Variation(C.Structure): _fields_=[('tag',C.c_uint32),('value',C.c_float)]
class Info(C.Structure): _fields_=[('codepoint',C.c_uint32),('mask',C.c_uint32),('cluster',C.c_uint32),('var1',C.c_uint32),('var2',C.c_uint32)]
class Position(C.Structure): _fields_=[('x_advance',C.c_int32),('y_advance',C.c_int32),('x_offset',C.c_int32),('y_offset',C.c_int32),('var',C.c_uint32)]
for name,args,restype in [
 ('hb_blob_create',[C.c_char_p,C.c_uint,C.c_int,ptr,ptr],ptr),('hb_blob_destroy',[ptr],None),
 ('hb_face_create',[ptr,C.c_uint],ptr),('hb_face_destroy',[ptr],None),('hb_face_get_upem',[ptr],C.c_uint),
 ('hb_font_create',[ptr],ptr),('hb_font_destroy',[ptr],None),('hb_ot_font_set_funcs',[ptr],None),
 ('hb_font_set_scale',[ptr,C.c_int,C.c_int],None),('hb_font_set_variations',[ptr,C.POINTER(Variation),C.c_uint],None),
 ('hb_buffer_create',[],ptr),('hb_buffer_destroy',[ptr],None),('hb_buffer_add_utf8',[ptr,C.c_char_p,C.c_int,C.c_uint,C.c_int],None),
 ('hb_buffer_guess_segment_properties',[ptr],None),('hb_shape',[ptr,ptr,ptr,C.c_uint],None),
 ('hb_buffer_get_glyph_infos',[ptr,C.POINTER(C.c_uint)],C.POINTER(Info)),
 ('hb_buffer_get_glyph_positions',[ptr,C.POINTER(C.c_uint)],C.POINTER(Position))]:
 f=getattr(hb,name);f.argtypes=args;f.restype=restype

def shape(path,text,weight):
 f=TTFont(path);f.flavor=None;raw=io.BytesIO();f.save(raw);data=raw.getvalue()
 blob=hb.hb_blob_create(data,len(data),0,None,None);face=hb.hb_face_create(blob,0);font=hb.hb_font_create(face);buffer=hb.hb_buffer_create()
 try:
  hb.hb_ot_font_set_funcs(font);upem=hb.hb_face_get_upem(face);assert upem>0;hb.hb_font_set_scale(font,upem,upem)
  v=Variation(int.from_bytes(b'wght','big'),weight);hb.hb_font_set_variations(font,C.byref(v),1)
  encoded=text.encode();hb.hb_buffer_add_utf8(buffer,encoded,len(encoded),0,-1);hb.hb_buffer_guess_segment_properties(buffer);hb.hb_shape(font,buffer,None,0)
  count=C.c_uint();infos=hb.hb_buffer_get_glyph_infos(buffer,C.byref(count));positions=hb.hb_buffer_get_glyph_positions(buffer,C.byref(count))
  glyphs=f.getGlyphSet(location={'wght':weight})
  result=[]
  for i in range(count.value):
   pen=DecomposingRecordingPen(glyphs);glyphs[f.getGlyphName(infos[i].codepoint)].draw(pen)
   result.append((pen.value,infos[i].cluster,positions[i].x_advance,positions[i].y_advance,positions[i].x_offset,positions[i].y_offset))
  return result
 finally:
  hb.hb_buffer_destroy(buffer);hb.hb_font_destroy(font);hb.hb_face_destroy(face);hb.hb_blob_destroy(blob)

root=Path(__file__).resolve().parents[1]/'public/fonts'
texts=['ВНЕ — закрытые музыкальные события','Получить приглашение','На одной частоте. Ёж, съёмка, тихий свет.','ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz','AVATAR To Wa fi ffi 0123456789','Стоимость: 1 234,50 ₽ / € £ $ ¥ № 7','«Текст» … „Объём“ – пунктуация!','е\u0301 о\u0301 a\u0301 e\u0301']
checks=[]
for family in ['Unbounded','Onest']:
 for weight in ([200,400,500,900] if family=='Unbounded' else [100,400,500,900]):
  for text in texts:
   assert shape(root/f'{family}-Variable.woff2',text,weight)==shape(root/f'subsets-v1/{family}-Variable-core.woff2',text,weight),(family,weight,text)
   checks.append({'family':family,'weight':weight,'text':text})
print(json.dumps({'status':'PASS','evidence':'HarfBuzz shaped outlines, clusters, advances and offsets','comparisons':len(checks)},ensure_ascii=False,indent=2))
