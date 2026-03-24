import base64

def embed_image(html_str, old_src, image_path):
    try:
        with open(image_path, 'rb') as f:
            b64 = base64.b64encode(f.read()).decode('utf-8')
        return html_str.replace(old_src, f'data:image/png;base64,{b64}')
    except Exception as e:
        print("Failed to embed", image_path, e)
        return html_str

with open('ui/mac_fallback.html', 'r', encoding='utf-8') as f:
    html = f.read()

html = embed_image(html, '../morning_star_app_icon.png', 'morning_star_app_icon.png')
html = embed_image(html, '../morning_star_cover.png', 'morning_star_cover.png')

with open('ui/mac_fallback.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Fallback HTML images embedded successfully.")
