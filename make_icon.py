"""
Generate app-ready branding assets for Morning Star.

Outputs:
- morning_star_app_icon.png
- morning_star_preview.png
- morning_star_cover.png
- morning_star.ico
- morning_star.icns
- ui/src/assets/morning_star_app_icon.png
- ui/src/assets/morning_star_cover.png
- ui/public/favicon.ico
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageColor, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parent
UI_ASSETS_DIR = ROOT / "ui" / "src" / "assets"
UI_PUBLIC_DIR = ROOT / "ui" / "public"
ICON_SIZE = 1024
COVER_SIZE = (1400, 900)

OBSIDIAN = "#120f14"
EMBER = "#d29a29"
EMBER_BRIGHT = "#f8d77a"
IVORY = "#fbf5ea"
SHADOW = "#090709"


def rgba(value, alpha=255):
    r, g, b = ImageColor.getrgb(value)
    return (r, g, b, alpha)


def ensure_dirs():
    UI_ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    UI_PUBLIC_DIR.mkdir(parents=True, exist_ok=True)


def add_radial_glow(image, center, radius, color, strength=1.0):
    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    max_radius = int(radius)
    for index in range(max_radius, 0, -1):
        falloff = (index / max_radius) ** 2
        alpha = int(255 * 0.08 * strength * falloff)
        draw.ellipse(
            (
                center[0] - index,
                center[1] - index,
                center[0] + index,
                center[1] + index,
            ),
            fill=rgba(color, alpha),
        )
    image.alpha_composite(glow)


def draw_gradient_background(size, top_color, bottom_color):
    image = Image.new("RGBA", size, rgba(top_color))
    width, height = size
    pixels = image.load()
    tr, tg, tb = ImageColor.getrgb(top_color)
    br, bg, bb = ImageColor.getrgb(bottom_color)

    for y in range(height):
        mix = y / max(1, height - 1)
        r = int(tr + (br - tr) * mix)
        g = int(tg + (bg - tg) * mix)
        b = int(tb + (bb - tb) * mix)
        for x in range(width):
            pixels[x, y] = (r, g, b, 255)

    add_radial_glow(image, (int(width * 0.24), int(height * 0.2)), int(width * 0.3), EMBER_BRIGHT, 1.25)
    add_radial_glow(image, (int(width * 0.74), int(height * 0.78)), int(width * 0.36), "#6a3510", 0.8)
    add_radial_glow(image, (int(width * 0.84), int(height * 0.16)), int(width * 0.18), "#ffffff", 0.22)
    return image


def star_points(cx, cy, outer_radius, inner_radius, spikes):
    points = []
    for index in range(spikes * 2):
        angle = math.radians(-90 + (180 / spikes) * index)
        radius = outer_radius if index % 2 == 0 else inner_radius
        points.append(
            (
                cx + radius * math.cos(angle),
                cy + radius * math.sin(angle),
            )
        )
    return points


def draw_rotated_rounded_rect(image, bbox_size, radius, angle, outline, width, fill=None):
    rect = Image.new("RGBA", bbox_size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(rect)
    draw.rounded_rectangle(
        (0, 0, bbox_size[0] - 1, bbox_size[1] - 1),
        radius=radius,
        outline=outline,
        width=width,
        fill=fill,
    )
    return rect.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)


def paste_centered(base, overlay, center):
    x = int(center[0] - overlay.width / 2)
    y = int(center[1] - overlay.height / 2)
    base.alpha_composite(overlay, (x, y))


def bezier_point(t, p0, p1, p2):
    x = ((1 - t) ** 2 * p0[0]) + (2 * (1 - t) * t * p1[0]) + (t ** 2 * p2[0])
    y = ((1 - t) ** 2 * p0[1]) + (2 * (1 - t) * t * p1[1]) + (t ** 2 * p2[1])
    return (x, y)


def draw_sparkle(draw, center, radius, color, width):
    cx, cy = center
    draw.line((cx, cy - radius, cx, cy + radius), fill=color, width=width)
    draw.line((cx - radius, cy, cx + radius, cy), fill=color, width=width)
    diag = radius * 0.42
    fine = max(1, width - 2)
    draw.line((cx - diag, cy - diag, cx + diag, cy + diag), fill=color, width=fine)
    draw.line((cx + diag, cy - diag, cx - diag, cy + diag), fill=color, width=fine)


def draw_symbol(layer, scale=1.0, offset=(0, 0), metallic=False):
    ox, oy = offset
    draw = ImageDraw.Draw(layer)
    fill_color = rgba(IVORY if not metallic else EMBER_BRIGHT)
    stroke_color = rgba(IVORY)
    hole_color = rgba("#1a1418")

    # Center of the sun (Now centered in the icon context)
    cx = layer.width / 2
    cy = layer.height / 2 - 40 * scale
    
    # Sun size doubled (outer original 206 -> 412)
    outer = 412 * scale
    inner = 232 * scale
    spikes = 14

    # Handle (Horizon) settings
    handle_w = 920 * scale
    handle_h = 88 * scale
    handle_x = cx - handle_w / 2
    handle_y = cy + 20 * scale # Horizon slightly below center of sun
    radius = 44 * scale
    handle_box = (handle_x, handle_y, handle_x + handle_w, handle_y + handle_h)

    # 1. Create a Clipping Mask for the Sun (must be above handle_y)
    sun_layer = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    sun_draw = ImageDraw.Draw(sun_layer)
    
    polygon = star_points(cx, cy, outer, inner, spikes)
    sun_draw.polygon(polygon, fill=fill_color)
    
    hole = 204 * scale
    sun_draw.ellipse((cx - hole, cy - hole, cx + hole, cy + hole), fill=hole_color)
    sun_draw.ellipse(
        (cx - hole * 1.08, cy - hole * 1.08, cx + hole * 1.08, cy + hole * 1.08),
        outline=rgba(EMBER_BRIGHT, 200),
        width=max(4, int(12 * scale)),
    )

    # Apply clipping mask: keep only what is above handle top
    mask_im = Image.new("L", layer.size, 0)
    mask_draw = ImageDraw.Draw(mask_im)
    mask_draw.rectangle((0, 0, layer.width, int(handle_y + 10 * scale)), fill=255)
    
    clipped_sun = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    clipped_sun.paste(sun_layer, (0, 0), mask_im)
    layer.alpha_composite(clipped_sun)

    # 2. Draw the horizontal handle (the horizon)
    draw.rounded_rectangle(handle_box, radius=radius, fill=rgba(IVORY), outline=rgba(IVORY), width=max(2, int(7 * scale)))

    # Handle stripes (Keep pattern)
    stripe_layer = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    stripe_draw = ImageDraw.Draw(stripe_layer)
    for x in range(int(handle_x + 60 * scale), int(handle_x + handle_w - 60 * scale), int(40 * scale)):
        stripe_draw.line(
            (
                x,
                handle_y - 28 * scale,
                x + 84 * scale,
                handle_y + handle_h + 28 * scale,
            ),
            fill=rgba("#b67916", 180),
            width=max(2, int(8 * scale)),
        )

    mask_handle = Image.new("L", layer.size, 0)
    ImageDraw.Draw(mask_handle).rounded_rectangle(handle_box, radius=radius, fill=255)
    masked_stripes = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    masked_stripes.paste(stripe_layer, (0, 0), mask_handle)
    layer.alpha_composite(masked_stripes)

    # Handle caps (left and right)
    cap_width = 16 * scale
    draw.ellipse(
        (handle_x - cap_width, handle_y, handle_x + cap_width, handle_y + handle_h),
        fill=hole_color,
        outline=rgba(IVORY),
        width=max(2, int(7 * scale)),
    )
    draw.ellipse(
        (handle_x + handle_w - cap_width, handle_y, handle_x + handle_w + cap_width, handle_y + handle_h),
        fill=hole_color,
        outline=rgba(IVORY),
        width=max(2, int(7 * scale)),
    )

    # Sparkle removal or re-centering
    # draw_sparkle(draw, (cx + 180 * scale, cy - 140 * scale), int(28 * scale), rgba(IVORY, 220), max(2, int(7 * scale)))
    # draw_sparkle(draw, (cx - 150 * scale, cy - 180 * scale), int(18 * scale), rgba(EMBER_BRIGHT, 220), max(2, int(5 * scale)))


def build_app_icon():
    image = draw_gradient_background((ICON_SIZE, ICON_SIZE), "#100d12", "#211820")

    mask = Image.new("L", (ICON_SIZE, ICON_SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, ICON_SIZE - 1, ICON_SIZE - 1), radius=228, fill=255)

    clipped = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
    clipped.paste(image, (0, 0), mask)

    panel = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
    panel_draw = ImageDraw.Draw(panel)
    inset = 72
    panel_draw.rounded_rectangle(
        (inset, inset, ICON_SIZE - inset, ICON_SIZE - inset),
        radius=184,
        fill=rgba("#20161c", 118),
        outline=rgba("#f5d271", 58),
        width=4,
    )
    panel = panel.filter(ImageFilter.GaussianBlur(0.3))
    clipped.alpha_composite(panel)

    shadow = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
    draw_symbol(shadow, scale=0.8) # Removed offset
    shadow = shadow.filter(ImageFilter.GaussianBlur(30))
    dim_shadow = Image.new("RGBA", shadow.size, rgba(SHADOW, 170))
    clipped.alpha_composite(Image.composite(dim_shadow, Image.new("RGBA", shadow.size, (0, 0, 0, 0)), shadow.split()[-1]))

    symbol = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
    draw_symbol(symbol, scale=0.8, metallic=True)
    clipped.alpha_composite(symbol)

    ring_draw = ImageDraw.Draw(clipped)
    ring_draw.rounded_rectangle(
        (12, 12, ICON_SIZE - 13, ICON_SIZE - 13),
        radius=236,
        outline=rgba("#ffffff", 46),
        width=3,
    )
    return clipped


def build_cover():
    width, height = COVER_SIZE
    image = draw_gradient_background((width, height), "#120f14", "#24161a")

    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    overlay_draw.rounded_rectangle(
        (56, 56, width - 56, height - 56),
        radius=44,
        fill=rgba("#1b1417", 84),
        outline=rgba("#f0cb6a", 44),
        width=2,
    )
    image.alpha_composite(overlay)

    halo = Image.new("RGBA", image.size, (0, 0, 0, 0))
    halo_draw = ImageDraw.Draw(halo)
    halo_draw.ellipse((110, 118, 730, 738), fill=rgba("#f2bd52", 20))
    halo = halo.filter(ImageFilter.GaussianBlur(34))
    image.alpha_composite(halo)

    symbol_shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw_symbol(symbol_shadow, scale=0.5, offset=(520, 128))
    symbol_shadow = symbol_shadow.filter(ImageFilter.GaussianBlur(22))
    image.alpha_composite(
        Image.composite(
            Image.new("RGBA", image.size, rgba(SHADOW, 180)),
            Image.new("RGBA", image.size, (0, 0, 0, 0)),
            symbol_shadow.split()[-1],
        )
    )

    symbol = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw_symbol(symbol, scale=0.5, offset=(520, 128), metallic=True)
    image.alpha_composite(symbol)

    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        (88, 150, 510, 750),
        radius=40,
        fill=rgba("#160f12", 110),
        outline=rgba("#f5d271", 36),
        width=2,
    )
    draw.arc((116, 184, 430, 498), start=208, end=328, fill=rgba("#f4ca69", 180), width=6)
    draw.arc((168, 250, 430, 512), start=224, end=338, fill=rgba("#f8f0df", 104), width=3)
    draw.ellipse((180, 314, 356, 490), fill=rgba("#f1ba48", 22), outline=rgba("#f8d77a", 50), width=2)
    draw_sparkle(draw, (250, 274), 20, rgba(IVORY, 196), 5)
    draw_sparkle(draw, (392, 244), 12, rgba(EMBER_BRIGHT, 180), 3)
    return image


def save_icns(icon_image):
    icon_image.save(ROOT / "morning_star.icns", format="ICNS")


def main():
    ensure_dirs()

    icon_image = build_app_icon()
    preview_image = icon_image.resize((512, 512), Image.Resampling.LANCZOS)
    cover_image = build_cover()

    icon_image.save(ROOT / "morning_star_app_icon.png")
    preview_image.save(ROOT / "morning_star_preview.png")
    cover_image.save(ROOT / "morning_star_cover.png")

    icon_image.save(
        ROOT / "morning_star.ico",
        format="ICO",
        sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)],
    )
    save_icns(icon_image)

    icon_image.save(UI_ASSETS_DIR / "morning_star_app_icon.png")
    cover_image.save(UI_ASSETS_DIR / "morning_star_cover.png")
    preview_image.save(
        UI_PUBLIC_DIR / "favicon.ico",
        format="ICO",
        sizes=[(64, 64), (32, 32), (16, 16)],
    )

    print("Generated Morning Star app branding assets.")


if __name__ == "__main__":
    main()
