# -*- mode: python ; coding: utf-8 -*-
# ============================================================
#  KayaDristhi.spec
#  Place this file in:
#  D:\KAP\KAP_AI\ManojSir_Task\ForestProject\Kaya Dristhi AI Vision\
#
#  Run from that folder:
#      python -m PyInstaller KayaDristhi.spec --clean --noconfirm
# ============================================================

block_cipher = None

hidden_imports = [
    # Torch + CUDA
    'torch', 'torch.nn', 'torch.nn.functional',
    'torch.utils', 'torch.utils.data',
    'torch.cuda', 'torch.cuda.amp',
    'torch.backends.cuda', 'torch.backends.cudnn',
    'torchvision', 'torchvision.transforms', 'torchvision.ops',

    # unittest (required by torch internals — do NOT exclude)
    'unittest', 'unittest.mock',

    # Ultralytics / YOLO
    'ultralytics',
    'ultralytics.nn', 'ultralytics.nn.modules',
    'ultralytics.models', 'ultralytics.models.yolo',
    'ultralytics.utils', 'ultralytics.utils.metrics',
    'ultralytics.utils.plotting',
    'ultralytics.data',

    # OpenCV
    'cv2',

    # PyQt5
    'PyQt5', 'PyQt5.QtCore', 'PyQt5.QtGui', 'PyQt5.QtWidgets',
    'PyQt5.QtMultimedia', 'PyQt5.QtMultimediaWidgets',
    'PyQt5.sip',

    # Scientific
    'numpy', 'numpy.core', 'numpy.lib',
    'scipy', 'scipy.optimize',
    'PIL', 'PIL.Image',

    # Crypto (Keygen / activation)
    'cryptography', 'cryptography.fernet',
    'Crypto', 'Crypto.Cipher', 'Crypto.Hash', 'Crypto.Signature',

    # Reporting
    'openpyxl', 'reportlab', 'reportlab.pdfgen',

    # Misc
    'requests', 'urllib3',
    'pandas',

    # Your own packages
    'core',
    'core.activation',
    'core.styles',
    'core.widgets',
    'core.path_helper',

    'modules',
    'modules.blackbuck',
    'modules.blackbuck.detection_enhancer',
    'modules.blackbuck.report_generator',
    'modules.blackbuck.tracker',
    'modules.blackbuck.ui',
    'modules.blackbuck.video_display',
    'modules.blackbuck.worker',
    'modules.blackbuck.zone_manager',

    'modules.turtle',
    'modules.turtle.ui',
    'modules.turtle.worker',

    'ui',
    'ui.amc_page',
    'ui.census_home',
    'ui.dialogs',
    'ui.forest_theme',
    'ui.home',
    'ui.processing',
    'ui.splash',
]

datas = [
    # Project data
    ('config',  'config'),
    ('models',  'models'),
    ('Docs',    'Docs'),
    ('core',    'core'),
    ('ui',      'ui'),

    # CUDA DLLs from PyTorch (required for GPU to work in EXE)
    (r'C:\ProgramData\Anaconda3\envs\wildlife\lib\site-packages\torch\lib',
     'torch/lib'),
]

a = Analysis(
    ['app.py'],
    pathex=['.'],
    binaries=[],
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=['runtime_hook.py'],
    excludes=[
        # DO NOT put unittest here — torch needs it
        'tkinter', 'tkinter.ttk',
        'IPython', 'jupyter', 'notebook',
    ],
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='KayaDristhi',
    debug=False,
    strip=False,
    upx=True,
    console=False,   # change to False once EXE works perfectly
    icon='wildlife.ico',
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    name='KayaDristhi',
)
