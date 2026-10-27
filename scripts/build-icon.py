"""Build the vDcoach vector mark and Android launcher assets. No APK build."""
from pathlib import Path
import json,re,math
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parents[1]
BG='#0b1017';BLUE='#0877ff';PURPLE='#ab7bea'
# Selected Daglijst mark: distinct silhouette, shared blue/purple palette.
PATHS=[('#0877ff', 'M 290 190 L 735 190 C 779 190 805 217 805 260 L 805 770 C 805 813 779 840 735 840 L 290 840 C 247 840 220 813 220 770 L 220 260 C 220 217 247 190 290 190 Z'), ('#0b1017', 'M 300 265 L 725 265 L 725 765 L 300 765 Z'), ('#ab7bea', 'M 340 352 L 366 326 L 407 367 L 467 307 L 493 333 L 407 419 Z'), ('#0877ff', 'M 520 344 L 676 344 L 676 386 L 520 386 Z'), ('#0877ff', 'M 350 482 L 426 482 L 426 558 L 350 558 Z'), ('#0877ff', 'M 486 496 L 676 496 L 676 538 L 486 538 Z'), ('#0877ff', 'M 350 632 L 426 632 L 426 708 L 350 708 Z'), ('#0877ff', 'M 486 646 L 636 646 L 636 688 L 486 688 Z')]

def points(path):
 tokens=re.findall(r'[MLCZ]|-?\d+(?:\.\d+)?',path);out=[];i=0;current=(0,0)
 while i<len(tokens):
  op=tokens[i];i+=1
  if op in ('M','L'):
   current=(float(tokens[i]),float(tokens[i+1]));i+=2;out.append(current)
  elif op=='C':
   x1,y1,x2,y2,x3,y3=map(float,tokens[i:i+6]);i+=6;x0,y0=current
   for n in range(1,65):
    t=n/64;u=1-t;out.append((u*u*u*x0+3*u*u*t*x1+3*u*t*t*x2+t*t*t*x3,u*u*u*y0+3*u*u*t*y1+3*u*t*t*y2+t*t*t*y3))
   current=(x3,y3)
 return out

def render(size,adaptive=False,mono=False):
 scale=4;canvas=Image.new('RGBA',(size*scale,size*scale),(0,0,0,0) if adaptive else BG);d=ImageDraw.Draw(canvas)
 for color,path in PATHS:
  if mono and color==BG:color=(0,0,0,0)
  elif mono:color='#ffffff'
  pts=points(path)
  # Offset the whole logo to its optical centre; safe inset on adaptive foreground.
  factor=.64 if adaptive else 1
  def coord(v,axis):return ((v+( -30 if axis==0 else 24)-512)*factor+512)/1024*size*scale
  d.polygon([(coord(x,0),coord(y,1)) for x,y in pts],fill=color)
 return canvas.resize((size,size),Image.Resampling.LANCZOS)

assets=ROOT/'assets';assets.mkdir(exist_ok=True)
svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="'+BG+'"/><g transform="translate(-30 24)">'+''.join(f'<path fill="{color}" d="{path}"/>' for color,path in PATHS)+'</g></svg>'
(assets/'icon.svg').write_text(svg)
icon=render(1024);icon.save(assets/'icon.png');render(1024,True).save(assets/'adaptive-icon.png');render(1024,True,True).save(assets/'monochrome-icon.png');render(64).save(assets/'favicon.png')
res=ROOT/'android/app/src/main/res'
for density,size,fore in [('mdpi',48,108),('hdpi',72,162),('xhdpi',96,216),('xxhdpi',144,324),('xxxhdpi',192,432)]:
 folder=res/('mipmap-'+density);folder.mkdir(exist_ok=True)
 render(size).save(folder/'ic_launcher.webp',lossless=True)
 image=render(size);mask=Image.new('L',(size*4,size*4));ImageDraw.Draw(mask).ellipse((0,0,size*4-1,size*4-1),fill=255);image.putalpha(mask.resize((size,size),Image.Resampling.LANCZOS));image.save(folder/'ic_launcher_round.webp',lossless=True)
 render(fore,True).save(folder/'ic_launcher_foreground.webp',lossless=True)
# Vector monochrome and fallback resources use identical geometry.
for name,mono in [('coach_icon',False),('coach_monochrome',True)]:
 content=f'<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="1024" android:viewportHeight="1024">'
 if not mono:content+=f'<path android:fillColor="{BG}" android:pathData="M0 0 L1024 0 L1024 1024 L0 1024 Z"/>'
 content+='<group android:translateX="512" android:translateY="512" android:scaleX="0.64" android:scaleY="0.64"><group android:translateX="-542" android:translateY="-488">' if mono else '<group android:translateX="-30" android:translateY="24">'
 if mono:
  content+='<path android:fillColor="#ffffff" android:fillType="evenOdd" android:pathData="'+' '.join(path for _,path in PATHS)+'"/>'
 else:content+=''.join(f'<path android:fillColor="{color}" android:pathData="{path}"/>' for color,path in PATHS)
 content+='</group></group></vector>' if mono else '</group></vector>'
 (res/'drawable'/f'{name}.xml').write_text(content)
folder=res/'mipmap-anydpi-v26';folder.mkdir(exist_ok=True)
for name in ['ic_launcher','ic_launcher_round']:
 (folder/f'{name}.xml').write_text('<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/iconBackground"/><foreground android:drawable="@mipmap/ic_launcher_foreground"/><monochrome android:drawable="@drawable/coach_monochrome"/></adaptive-icon>')
f=res/'values/colors.xml';f.write_text(re.sub(r'(<color name="iconBackground">).*?(</color>)',lambda m:m[1]+BG+m[2],f.read_text()))
f=ROOT/'android/app/src/main/AndroidManifest.xml';f.write_text(f.read_text().replace('android:icon="@drawable/coach_icon"','android:icon="@mipmap/ic_launcher"').replace('android:roundIcon="@drawable/coach_icon"','android:roundIcon="@mipmap/ic_launcher_round"'))
f=ROOT/'app.json';data=json.loads(f.read_text());e=data['expo'];e['icon']='./assets/icon.png';e['android']['adaptiveIcon']={'foregroundImage':'./assets/adaptive-icon.png','backgroundColor':BG,'monochromeImage':'./assets/monochrome-icon.png'};e['web']['favicon']='./assets/favicon.png';f.write_text(json.dumps(data,indent=2)+'\n')
(ROOT/'outputs').mkdir(exist_ok=True);icon.save(ROOT/'outputs/vDcoach-icon.png')
print('Built icon, adaptive layers and all five launcher densities.')

preview=Image.new('RGB',(640,300),'#eff1f6')
viewport=render(324,True)
background=Image.new('RGBA',viewport.size,BG);background.alpha_composite(viewport)
viewport=background.crop((60,60,264,264))
for x,kind in [(72,'circle'),(364,'square')]:
 mask=Image.new('L',(204*4,204*4));d=ImageDraw.Draw(mask)
 if kind=='circle':d.ellipse((0,0,815,815),fill=255)
 else:d.rounded_rectangle((0,0,815,815),radius=170,fill=255)
 preview.paste(viewport,(x,36),mask.resize((204,204),Image.Resampling.LANCZOS))
preview.save(ROOT/'outputs/vDcoach-launcher-preview.png')
