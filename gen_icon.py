"""
Generate morning_star.svg – a morning-star weapon icon
inspired by the provided reference image (spiked ball + chain + wrapped handle).
White elements on near-black background.
"""
import math, textwrap

W, H = 512, 512
BG = "#0d0d0d"

# ── Spiked ball ──────────────────────────────────────────────
CX, CY = 158, 310          # centre of the spiked head
R_OUT  = 132               # spike-tip radius
R_IN   = 72                # inner ring radius (circle rim)
N      = 14                # number of spikes

spike_pts = []
for i in range(2 * N):
    angle = math.radians(-90 + i * 180 / N)
    r = R_OUT if i % 2 == 0 else R_IN
    x = round(CX + r * math.cos(angle), 1)
    y = round(CY + r * math.sin(angle), 1)
    spike_pts.append(f"{x},{y}")
poly_points = " ".join(spike_pts)

# ── Chain arc: ring-top → handle-top ─────────────────────────
# Quadratic bezier: P0 → P1 (control) → P2
P0 = (158, 152)   # topmost point of the hook ring
P1 = (265, 52)    # bezier control (pulls arc up)
P2 = (378, 140)   # top centre of handle

def bezier(t, p0, p1, p2):
    x = (1-t)**2*p0[0] + 2*(1-t)*t*p1[0] + t**2*p2[0]
    y = (1-t)**2*p0[1] + 2*(1-t)*t*p1[1] + t**2*p2[1]
    return x, y

# Sample 11 link midpoints (t = 0.05, 0.15, … 0.95)
link_defs = []
for k in range(10):
    t_mid = 0.05 + k * 0.1
    t_a   = t_mid - 0.05
    t_b   = t_mid + 0.05
    lx, ly = bezier(t_mid, P0, P1, P2)
    ax, ay = bezier(t_a,   P0, P1, P2)
    bx, by = bezier(t_b,   P0, P1, P2)
    angle  = math.degrees(math.atan2(by - ay, bx - ax))
    # alternate flat / tall link
    is_flat = (k % 2 == 0)
    rx, ry = (12, 6) if is_flat else (6, 12)
    link_defs.append((round(lx,1), round(ly,1), round(angle,1), rx, ry))

chain_svg_parts = []
for lx, ly, angle, rx, ry in link_defs:
    chain_svg_parts.append(
        f'<g transform="translate({lx},{ly}) rotate({angle})">'
        f'<ellipse rx="{rx}" ry="{ry}" fill="none" stroke="white" stroke-width="2.5"/>'
        f'</g>'
    )
chain_svg = "\n  ".join(chain_svg_parts)

# ── Handle diagonal stripes ───────────────────────────────────
HX, HY, HW, HH, HRX = 360, 140, 38, 305, 19   # handle rect
stripe_lines = []
for y_start in range(HY - 20, HY + HH + 60, 18):
    stripe_lines.append(
        f'<line x1="{HX-20}" y1="{y_start+58}" x2="{HX+HW+20}" y2="{y_start}" '
        f'stroke="white" stroke-width="2.5"/>'
    )
stripes_svg = "\n    ".join(stripe_lines)

# ── 4-pointed sparkle helper ──────────────────────────────────
def sparkle(cx, cy, r, sw=2):
    s = r * 0.35
    return (
        f'<g transform="translate({cx},{cy})">'
        f'<line x1="0" y1="{-r}" x2="0" y2="{r}" stroke="white" stroke-width="{sw}"/>'
        f'<line x1="{-r}" y1="0" x2="{r}" y2="0" stroke="white" stroke-width="{sw}"/>'
        f'<line x1="{-s:.1f}" y1="{-s:.1f}" x2="{s:.1f}" y2="{s:.1f}" stroke="white" stroke-width="{max(1,sw-0.5)}"/>'
        f'<line x1="{s:.1f}" y1="{-s:.1f}" x2="{-s:.1f}" y2="{s:.1f}" stroke="white" stroke-width="{max(1,sw-0.5)}"/>'
        f'</g>'
    )

sparkle_big   = sparkle(342, 200, 14, sw=2.5)
sparkle_small = sparkle(330, 232,  9, sw=1.8)

# ── Assemble SVG ──────────────────────────────────────────────
svg = f"""<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">

  <!-- background -->
  <rect width="512" height="512" fill="{BG}"/>

  <!-- ─── Spiked ball (solid white) ─── -->
  <polygon points="{poly_points}" fill="white"/>

  <!-- centre hole -->
  <circle cx="{CX}" cy="{CY}" r="62" fill="{BG}"/>

  <!-- hook ring at top of ball -->
  <circle cx="{CX}" cy="163" r="13" fill="{BG}" stroke="white" stroke-width="3"/>
  <!-- small connector loop -->
  <circle cx="{CX}" cy="150" r="7"  fill="{BG}" stroke="white" stroke-width="2.5"/>

  <!-- ─── Chain links ─── -->
  {chain_svg}

  <!-- ─── Handle ─── -->
  <defs>
    <clipPath id="hc">
      <rect x="{HX}" y="{HY}" width="{HW}" height="{HH}" rx="{HRX}"/>
    </clipPath>
  </defs>
  <!-- handle body (dark fill + white border) -->
  <rect x="{HX}" y="{HY}" width="{HW}" height="{HH}" rx="{HRX}"
        fill="{BG}" stroke="white" stroke-width="3"/>
  <!-- diagonal wrap stripes -->
  <g clip-path="url(#hc)">
    {stripes_svg}
  </g>
  <!-- end caps for 3-D cylinder feel -->
  <ellipse cx="{HX+HW//2}" cy="{HY}"      rx="{HW//2-1}" ry="8" fill="{BG}" stroke="white" stroke-width="2.5"/>
  <ellipse cx="{HX+HW//2}" cy="{HY+HH}"   rx="{HW//2-1}" ry="8" fill="{BG}" stroke="white" stroke-width="2.5"/>

  <!-- ─── Sparkles ─── -->
  {sparkle_big}
  {sparkle_small}

</svg>"""

with open("morning_star.svg", "w", encoding="utf-8") as f:
    f.write(svg)

print("morning_star.svg generated.")
print(f"  Spike polygon: {N} spikes, R_out={R_OUT}, R_in={R_IN}, centre=({CX},{CY})")
print(f"  Chain links:   {len(link_defs)}")
print(f"  Handle:        x={HX}-{HX+HW}, y={HY}-{HY+HH}")
