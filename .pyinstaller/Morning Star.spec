# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_submodules

hiddenimports = ['Foundation', 'AppKit', 'WebKit']
hiddenimports += collect_submodules('webview')


a = Analysis(
    ['../main.py'],
    pathex=[],
    binaries=[],
    datas=[('/Users/kimdaehoon/Desktop/morning_star/ui/dist', 'ui/dist'), ('/Users/kimdaehoon/Desktop/morning_star/ui/mac_fallback.html', 'ui'), ('/Users/kimdaehoon/Desktop/morning_star/morning_star.ico', '.'), ('/Users/kimdaehoon/Desktop/morning_star/morning_star_app_icon.png', '.'), ('/Users/kimdaehoon/Desktop/morning_star/morning_star_cover.png', '.')],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='Morning Star',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['/Users/kimdaehoon/Desktop/morning_star/morning_star.icns'],
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='Morning Star',
)
app = BUNDLE(
    coll,
    name='Morning Star.app',
    icon='/Users/kimdaehoon/Desktop/morning_star/morning_star.icns',
    bundle_identifier='com.morningstar.desktop',
)
