"""
Draws the Morning Star weapon icon using Pillow (no Cairo / SVG needed).
Design: spiked ball  ─── chain arc ───  striped cylindrical handle  + sparkles
White elements on near-black (#0d0d0d) background.
"""
import math
from PIL import Image, ImageDraw

SIZE   = 512
BG     = (13, 13, 13)
WHITE  = (255, 255, 255)
STROKE = 4          # general stroke width
ANTIALIAS = 4       # render at 4× then downsample for clean AA

S = SIZE * ANTIALIAS   # canvas size for AA pass
sc = ANTIALIAS         # scale factor helper


def pts(points, scale=1):
    """Scale a list of (x,y) tuples."""
    return [(x * scale, y * scale) for x, y in points]


def line(draw, x1, y1, x2, y2, w, color=WHITE):
    draw.line([(x1, y1), (x2, y2)], fill=color, width=w)


def circle_outline(draw, cx, cy, r, w, color=WHITE):
    draw.ellipse(
        [(cx - r, cy - r), (cx + r, cy + r)],
        outline=color, width=w
    )


def circle_filled(draw, cx, cy, r, color):
    draw.ellipse(
        [(cx - r, cy - r), (cx + r, cy + r)],
        fill=color
    )


def ellipse_outline(draw, cx, cy, rx, ry, w, color=WHITE):
    draw.ellipse(
        [(cx - rx, cy - ry), (cx + rx, cy + ry)],
        outline=color, width=w
    )


def rotated_ellipse(draw, cx, cy, rx, ry, angle_deg, w, color=WHITE):
    """Approximate a rotated ellipse as a polygon (closed polyline)."""
    pts_list = []
    for i in range(64):
        a = math.radians(i / 64 * 360)
        x = cx + rx * math.cos(a) * math.cos(math.radians(angle_deg)) \
               - ry * math.sin(a) * math.sin(math.radians(angle_deg))
        y = cy + rx * math.cos(a) * math.sin(math.radians(angle_deg)) \
               + ry * math.sin(a) * math.cos(math.radians(angle_deg))
        pts_list.append((x, y))
    pts_list.append(pts_list[0])  # close
    draw.line(pts_list, fill=color, width=w)


def sparkle(draw, cx, cy, r, sw):
    s = r * 0.38
    line(draw, cx, cy - r, cx, cy + r, sw)
    line(draw, cx - r, cy, cx + r, cy, sw)
    sw2 = max(sc, sw - sc)
    line(draw, cx - s, cy - s, cx + s, cy + s, sw2)
    line(draw, cx + s, cy - s, cx - s, cy + s, sw2)


def bezier_pt(t, p0, p1, p2):
    x = (1-t)**2*p0[0] + 2*(1-t)*t*p1[0] + t**2*p2[0]
    y = (1-t)**2*p0[1] + 2*(1-t)*t*p1[1] + t**2*p2[1]
    return x, y


# ─── Design parameters (in 512-unit space) ───────────────────
CX, CY = 150, 315          # spiked-ball centre
R_OUT, R_IN = 142, 78      # spike / inner ring radius
N_SPIKES = 14

HX, HY, HW, HH = 340, 132, 44, 318   # handle left,top,w,h
HRX = 22                              # handle corner radius

# Hook ring above star top spike
HOOK_CX, HOOK_CY, HOOK_R = 150, 160, 13

# Chain bezier endpoints + control
CHAIN_P0 = (150, 147)
CHAIN_P1 = (258, 48)
CHAIN_P2 = (362, 132)

# ─── Render at ANTIALIAS× resolution ─────────────────────────
img  = Image.new("RGB", (S, S), color=BG)
draw = ImageDraw.Draw(img)

def s(v):
    """Scale value to hi-res canvas."""
    return v * sc

sw = STROKE * sc   # scaled stroke width


# 1. Spiked ball polygon ───────────────────────────────────────
spike_polygon = []
for i in range(2 * N_SPIKES):
    ang = math.radians(-90 + i * 180 / N_SPIKES)
    r   = R_OUT if i % 2 == 0 else R_IN
    spike_polygon.append((s(CX + r * math.cos(ang)),
                          s(CY + r * math.sin(ang))))

draw.polygon(spike_polygon, fill=WHITE)

# Centre hole (background colour)
circle_filled(draw, s(CX), s(CY), s(62), BG)

# Thin inner ring rim (optional, for definition)
circle_outline(draw, s(CX), s(CY), s(68), int(sw * 0.5))


# 2. Hook ring ─────────────────────────────────────────────────
circle_filled  (draw, s(HOOK_CX), s(HOOK_CY), s(HOOK_R + 2), BG)
circle_outline (draw, s(HOOK_CX), s(HOOK_CY), s(HOOK_R),     int(sw * 0.9))

# Small connector loop just above
circle_filled  (draw, s(HOOK_CX), s(HOOK_CY - HOOK_R - 7), s(7), BG)
circle_outline (draw, s(HOOK_CX), s(HOOK_CY - HOOK_R - 7), s(7), int(sw * 0.8))


# 3. Chain links ───────────────────────────────────────────────
chain_sw = int(sw * 0.7)
for k in range(10):
    t_mid = 0.05 + k * 0.10
    t_a   = t_mid - 0.05
    t_b   = t_mid + 0.05
    lx, ly = bezier_pt(t_mid, CHAIN_P0, CHAIN_P1, CHAIN_P2)
    ax, ay = bezier_pt(t_a,   CHAIN_P0, CHAIN_P1, CHAIN_P2)
    bx, by = bezier_pt(t_b,   CHAIN_P0, CHAIN_P1, CHAIN_P2)
    angle  = math.degrees(math.atan2(by - ay, bx - ax))

    # alternating flat / tall link
    rx = 12 if k % 2 == 0 else 7
    ry =  7 if k % 2 == 0 else 13

    rotated_ellipse(draw, s(lx), s(ly), s(rx), s(ry), angle,
                    chain_sw)


# 4. Handle ────────────────────────────────────────────────────
# Render on a separate layer then paste so stripes are always clipped.

def rrect_fill(d, x, y, w, h, rx, color):
    d.rectangle([(x+rx, y), (x+w-rx, y+h)], fill=color)
    d.rectangle([(x, y+rx), (x+w, y+h-rx)], fill=color)
    for cx2, cy2 in [(x+rx, y+rx), (x+w-rx, y+rx),
                     (x+rx, y+h-rx), (x+w-rx, y+h-rx)]:
        d.ellipse([(cx2-rx, cy2-ry), (cx2+rx, cy2+ry)], fill=color) \
            if False else \
        d.ellipse([(cx2-rx, cy2-rx), (cx2+rx, cy2+rx)], fill=color)


def rrect_outline(d, x, y, w, h, rx, stroke_w, color=WHITE):
    try:
        d.rounded_rectangle([(x, y), (x+w, y+h)],
                             radius=rx, outline=color, width=stroke_w)
    except AttributeError:
        d.rectangle([(x, y), (x+w, y+h)], outline=color, width=stroke_w)


HXs = s(HX);  HYs = s(HY)
HWs = s(HW);  HHs = s(HH)
HRXs = s(HRX)
stripe_sw = int(sw * 0.65)

# ── Build a mask image: white inside the handle rounded-rect ──
handle_mask = Image.new("L", (S, S), 0)   # 'L' = grayscale
hm_draw = ImageDraw.Draw(handle_mask)
try:
    hm_draw.rounded_rectangle([(HXs, HYs), (HXs+HWs, HYs+HHs)],
                               radius=HRXs, fill=255)
except AttributeError:
    # Fallback for older Pillow
    hm_draw.rectangle([(HXs+HRXs, HYs), (HXs+HWs-HRXs, HYs+HHs)], fill=255)
    hm_draw.rectangle([(HXs, HYs+HRXs), (HXs+HWs, HYs+HHs-HRXs)], fill=255)
    for ccx, ccy in [(HXs+HRXs, HYs+HRXs), (HXs+HWs-HRXs, HYs+HRXs),
                     (HXs+HRXs, HYs+HHs-HRXs), (HXs+HWs-HRXs, HYs+HHs-HRXs)]:
        hm_draw.ellipse([(ccx-HRXs, ccy-HRXs), (ccx+HRXs, ccy+HRXs)], fill=255)

# ── Stripe layer (full canvas, BG base) ──
stripe_layer = Image.new("RGB", (S, S), BG)
sl = ImageDraw.Draw(stripe_layer)
for y_off in range(int(HYs - s(20)), int(HYs + HHs + s(60)), int(s(18))):
    sl.line([(HXs - s(20), y_off + s(58)),
             (HXs + HWs + s(20), float(y_off))],
            fill=WHITE, width=stripe_sw)

# ── Paste stripes onto main img using handle mask ──
img.paste(stripe_layer, mask=handle_mask)

# ── Handle outline on top ──
rrect_outline(draw, HXs, HYs, HWs, HHs, HRXs, int(sw * 0.9))

# End caps for 3-D cylinder feel
draw.ellipse([(HXs, HYs - s(8)), (HXs+HWs, HYs + s(8))],
             fill=BG, outline=WHITE, width=int(sw * 0.75))
draw.ellipse([(HXs, HYs+HHs - s(8)), (HXs+HWs, HYs+HHs + s(8))],
             fill=BG, outline=WHITE, width=int(sw * 0.75))


# 5. Sparkles ─────────────────────────────────────────────────
sparkle(draw, s(327), s(200), s(16), int(sw * 0.7))
sparkle(draw, s(315), s(235), s(10), int(sw * 0.55))


# ─── Downsample for anti-aliasing ────────────────────────────
final = img.resize((SIZE, SIZE), Image.LANCZOS)

# ─── Save PNG + ICO ──────────────────────────────────────────
final.save("morning_star_preview.png")
final.save("morning_star.ico",
           format="ICO",
           sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])

print("Done → morning_star.ico + morning_star_preview.png")
