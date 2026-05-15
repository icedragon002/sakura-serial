"""Generate sakura-themed icons for Sakura Serial."""
import math
from PIL import Image, ImageDraw

SIZE = 256
BG = (13, 8, 33, 255)        # --bg-deep
PINK = (255, 126, 179, 255)  # --primary
PINK_DARK = (230, 100, 151, 255)
WHITE = (255, 240, 245, 255)
ACCENT = (0, 229, 160, 255)  # --accent
PURPLE = (179, 136, 255, 80) # glow

def draw_petal(draw, cx, cy, angle, r1, r2, color):
    """Draw a single sakura petal using bezier-like ellipse."""
    # Create petal shape as a transformed ellipse
    petal_img = Image.new('RGBA', (SIZE * 2, SIZE * 2), (0, 0, 0, 0))
    petal_draw = ImageDraw.Draw(petal_img)

    w = int(r1 * 0.35)
    h = int(r2)

    # Draw ellipse centered
    x0 = SIZE - w // 2
    y0 = SIZE - h
    x1 = SIZE + w // 2
    y1 = SIZE + h

    petal_draw.ellipse([x0, y0, x1, y1], fill=color)

    # Rotate and translate
    rotated = petal_img.rotate(math.degrees(angle), resample=Image.BILINEAR,
                               center=(SIZE, SIZE))
    # Composite onto main
    offset_x = int(cx - SIZE + math.cos(angle) * r2 * 0.45)
    offset_y = int(cy - SIZE + math.sin(angle) * r2 * 0.45)

    return rotated, offset_x, offset_y


def create_icon():
    img = Image.new('RGBA', (SIZE, SIZE), BG)
    draw = ImageDraw.Draw(img)

    # -- Rounded rect background --
    rr = SIZE // 10
    # We'll keep it simple with a full square, the rounding is for final packaging

    # -- Glow ring --
    cx, cy = SIZE // 2, SIZE // 2
    for i in range(12, 0, -1):
        alpha = int(30 / i)
        r = SIZE // 2 - 20 + i * 8
        draw.ellipse([cx - r, cy - r, cx + r, cy + r],
                     fill=(179, 136, 255, alpha))

    # -- Draw 5 sakura petals --
    petal_r1 = 28   # petal width
    petal_r2 = 72   # petal length from center

    for i in range(5):
        angle = (i / 5) * 2 * math.pi - math.pi / 2
        # Outer petal
        px = cx + math.cos(angle) * petal_r2 * 0.55
        py = cy + math.sin(angle) * petal_r2 * 0.55
        petal_img, ox, oy = draw_petal(None, px, py, angle, petal_r1, petal_r2, PINK)
        img.alpha_composite(petal_img, (ox, oy))

    # -- Inner petals (smaller, lighter) --
    for i in range(5):
        angle = (i / 5) * 2 * math.pi - math.pi / 2 + math.pi / 5
        px = cx + math.cos(angle) * 22
        py = cy + math.sin(angle) * 22
        petal_img, ox, oy = draw_petal(None, px, py, angle, 16, 32, PINK_DARK)
        img.alpha_composite(petal_img, (ox, oy))

    # -- Center circle --
    r = 20
    for i in range(6, 0, -1):
        draw.ellipse([cx - r - i, cy - r - i, cx + r + i, cy + r + i],
                     fill=(255, 200, 210, 80 // i))
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 220, 180, 255))

    # -- Tiny center dots --
    for i in range(8):
        angle = (i / 8) * 2 * math.pi
        dx = math.cos(angle) * 10
        dy = math.sin(angle) * 10
        draw.ellipse([cx + dx - 3, cy + dy - 3, cx + dx + 3, cy + dy + 3],
                     fill=(200, 150, 100, 255))

    # -- Small sparkle / connection hints --
    sparkle_r = SIZE // 2 - 24
    for i in range(3):
        angle = (i / 3) * 2 * math.pi + 0.3
        sx = cx + math.cos(angle) * sparkle_r
        sy = cy + math.sin(angle) * sparkle_r
        draw.ellipse([sx - 3, sy - 3, sx + 3, sy + 3], fill=ACCENT)

    return img


def main():
    img = create_icon()

    # Save PNG
    png_path = 'resources/icon.png'
    img.save(png_path, 'PNG')
    print(f'Saved {png_path}')

    # Save ICO (Windows - multi-size)
    ico_sizes = [256, 128, 64, 48, 32, 16]
    ico_images = []
    for s in ico_sizes:
        resized = img.resize((s, s), Image.LANCZOS)
        ico_images.append(resized)

    ico_path = 'resources/icon.ico'
    ico_images[0].save(ico_path, 'ICO', sizes=[(s, s) for s in ico_sizes],
                       append_images=ico_images[1:])
    print(f'Saved {ico_path} with sizes {ico_sizes}')

    # Save ICNS placeholder (macOS) — just a PNG for now
    # electron-builder can work with a large PNG for macOS
    icns_path = 'resources/icon.icns'
    img_512 = img.resize((512, 512), Image.LANCZOS)
    img_512.save(icns_path, 'PNG')
    print(f'Saved {icns_path} (512px PNG)')

    print('Done! All icons generated.')


if __name__ == '__main__':
    main()
