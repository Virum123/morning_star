from PIL import Image
import os

# SVG를 PNG로 변환 (PIL은 SVG를 직접 지원하지 않으므로, 여기서는 간단히 가정. 실제로는 cairosvg 필요하지만, Pillow만으로 할 수 없음)
# Pillow는 SVG를 직접 열 수 없으므로, cairosvg를 설치해야 함. 하지만 requirements에 없음.

# cairosvg 설치
import subprocess
subprocess.run(['pip', 'install', 'cairosvg'])

from cairosvg import svg2png

# SVG를 PNG로 변환
svg_file = 'morning_star.svg'
png_file = 'morning_star.png'
svg2png(url=svg_file, write_to=png_file, output_width=256, output_height=256)

# PNG를 ICO로 변환
img = Image.open(png_file)
img.save('morning_star.ico', format='ICO', sizes=[(256,256), (128,128), (64,64), (32,32), (16,16)])

print("ICO 파일 생성 완료")