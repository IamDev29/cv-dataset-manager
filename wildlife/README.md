# Wild Life Counter  v1.0

PyQt5 desktop application for wildlife census analysis.  
Two fully independent, hardware-locked modules:

| Module | Species | Algorithm |
|---|---|---|
| **BLACKBUCK** | Blackbuck (Indian Antelope) | ByteTrack + Anti-Blink filter |
| **TURTLE** | Olive Ridley Sea Turtle | Tiled YOLO inference + Kalman tracking + Dual-line zone |

---

## Directory layout

```
wildlife_counter/
│
├── app.py                        ← Entry point:  python app.py
│
├── core/                         ← Shared utilities (no animal-specific code)
│   ├── __init__.py
│   ├── activation.py             ← HMAC licensing + XOR-encrypted storage
│   ├── styles.py                 ← Dark QSS stylesheet
│   └── widgets.py                ← VideoCanvas, StatCard
│
├── modules/
│   ├── blackbuck/                ← Blackbuck package (self-contained)
│   │   ├── __init__.py
│   │   ├── tracker.py            ← STrack + ByteTracker (pure Python/NumPy)
│   │   ├── worker.py             ← QThread: YOLO + ByteTrack pipeline
│   │   └── ui.py                 ← BlackbuckSettingsPanel (reads config JSON)
│   │
│   └── turtle/                   ← Turtle package (self-contained)
│       ├── __init__.py
│       ├── worker.py             ← QThread: tiled inference + Kalman pipeline
│       └── ui.py                 ← TurtleSettingsPanel (reads config JSON)
│
├── ui/                           ← App-level UI pages
│   ├── __init__.py
│   ├── home.py                   ← HomePage + ModuleCard
│   ├── processing.py             ← ProcessingPage (hosts both settings panels)
│   └── dialogs.py                ← ActivationDialog, KeyGenDialog
│
├── config/
│   ├── blackbuck_config.json     ← Blackbuck defaults + model path
│   └── turtle_config.json        ← Turtle defaults + model path
│
└── models/
    ├── Blackbuck.pt              ← Place your Blackbuck YOLO weights here
    └── best_Turtle_2nd Feb.pt    ← Place your Turtle YOLO weights here
```

---

## Setup

```bash
pip install PyQt5 ultralytics opencv-python torch scipy numpy
```

Place your `.pt` model files in the `models/` folder.  
The paths are configured in `config/blackbuck_config.json` and  
`config/turtle_config.json` — edit `"model_path"` to change them.

Run:
```bash
python app.py
```

---

## Activation

1. Launch the app — your **Machine ID** is shown on the home screen.
2. Share the Machine ID with the vendor to receive an activation key.
3. Click **🔑 Activate Module** and enter the key.  
   The encrypted license is stored in `~/.wildlifecounter/licenses.enc`.

Admin key generation is available via **Help → Key Generator (Admin)**.

---

## Module isolation

Each module (`blackbuck/`, `turtle/`) is a **standalone Python package**.

- `modules/blackbuck` has **zero imports** from `modules/turtle` and vice versa.
- Changing turtle detection logic (tiles, Kalman, zone lines) cannot affect
  the Blackbuck ByteTracker, and vice versa.
- Each module reads its own `config/*.json` for defaults and model path.
- Both share only the thin `core/` layer (activation, stylesheet, widgets).

---

## Config files

Edit `config/blackbuck_config.json` or `config/turtle_config.json` to change
model paths, detection thresholds, or tracking defaults **without touching code**.

```json
// config/turtle_config.json  (excerpt)
{
  "model_path": "models/best_Turtle_2nd Feb.pt",
  "counting_zone": {
    "line1_frac": 0.33,
    "line2_frac": 0.66
  },
  ...
}
```
