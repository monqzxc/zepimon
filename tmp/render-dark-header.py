import json, pathlib, math
from PIL import Image, ImageDraw, ImageFont
root=pathlib.Path(r'C:\Users\Admin\OneDrive\Desktop\zepimon')
shots=json.loads((root/'tmp/dark-header-widgets.json').read_text())
font_path=r'C:\Windows\Fonts\segoeui.ttf'
label_font=ImageFont.truetype(r'C:\Windows\Fonts\segoeuib.ttf',16)
cols=3; cw=340; ch=430
sheet=Image.new('RGB',(cols*cw,math.ceil(len(shots)/cols)*ch),(230,232,234))
labels=ImageDraw.Draw(sheet)
issues=[]
def rgb(n): return (n>>16&255,n>>8&255,n&255)
def lines_for(text,font,width,wrap):
    out=[]
    for paragraph in str(text).split('\n'):
        if not wrap or font.getlength(paragraph)<=width:
            out.append(paragraph); continue
        line=''
        for word in paragraph.split(' '):
            candidate=(line+' '+word).strip()
            if line and font.getlength(candidate)>width:
                out.append(line); line=word
            else:line=candidate
        out.append(line)
    return out
for i,shot in enumerate(shots):
    screen=Image.new('RGBA',(320,380),(0,0,0,255)); d=ImageDraw.Draw(screen)
    for w in shot['widgets']:
        x,y,ww,hh=[int(w.get(k,0)) for k in ['x','y','w','h']]
        typ=w['_type']
        if min(x,y)<0 or x+ww>320 or y+hh>380: issues.append((shot['name'],'bounds',w))
        if typ==4: d.rectangle((x,y,x+ww-1,y+hh-1),fill=rgb(w['color']))
        elif typ==3:
            src=root/'hatdog-app/assets/bip-5-unity'/w['src']
            sprite=Image.open(src).convert('RGBA').resize((ww,hh),Image.Resampling.NEAREST)
            screen.alpha_composite(sprite,(x,y))
        elif typ in (1,2):
            if typ==2:d.rounded_rectangle((x,y,x+ww-1,y+hh-1),radius=w.get('radius',0),fill=rgb(w.get('normal_color',0xFFFFFF)))
            font=ImageFont.truetype(font_path,int(w.get('text_size',20)))
            text=str(w.get('text',''))
            ls=lines_for(text,font,ww,typ==1 and w.get('text_style')==1)
            line_h=int(w.get('text_size',20)*1.2)
            if any(font.getlength(line)>ww for line in ls):issues.append((shot['name'],'text too wide',text,ww))
            if len(ls)*line_h>hh:issues.append((shot['name'],'text too tall',text,hh,len(ls)*line_h))
            for j,line in enumerate(ls):
                xx=x+(ww-font.getlength(line))/2
                yy=y+(hh-len(ls)*line_h)/2+j*line_h
                d.text((xx,yy),line,font=font,fill=rgb(w.get('color',0xFFFFFF)),anchor='lt')
    # Mock the watch-owned status bar only for preview context.
    d.rectangle((0,0,319,63), fill=(3,12,22))
    status_font=ImageFont.truetype(font_path,18)
    d.text((18,24),'Zepimon',font=status_font,fill=(225,231,238),anchor='lt')
    d.text((228,24),'5:07 PM',font=status_font,fill=(225,231,238),anchor='lt')
    px=i%cols*cw+10;py=i//cols*ch+34
    sheet.paste(screen.convert('RGB'),(px,py))
    labels.text((px,py-25),shot['name']+' ('+str(len(shot['widgets']))+')',font=label_font,fill=(45,50,55))
    screen.save(root/'tmp'/('dark-header-'+str(i)+'.png'))
sheet.save(root/'tmp/dark-header-preview.png')
print('Saved',root/'tmp/dark-header-preview.png')
print('Approximate font/bounds issues:')
for issue in issues:print(issue)
