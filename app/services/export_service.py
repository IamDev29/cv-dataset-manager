import io, os, zipfile, base64
from pathlib import Path
from typing import List, Dict, Any, Optional


def _annotations_to_yolo_lines(
    annotations: List[Dict[str, Any]],
    class_id_to_idx: Dict[str, int],
) -> List[str]:
    """Convert a list of BoundingBox dicts to YOLO-format label lines.

    Each annotation has {classId, x, y, width, height} where coords are
    0-1 normalised top-left.  YOLO format is:
        <class_idx> <x_center> <y_center> <width> <height>
    """
    lines: List[str] = []
    for box in annotations:
        class_idx = class_id_to_idx.get(box.get('classId') or box.get('class_id'))
        if class_idx is None:
            continue
        x = box['x']
        y = box['y']
        w = box['width']
        h = box['height']
        x_center = x + w / 2
        y_center = y + h / 2
        lines.append(f'{class_idx} {x_center:.6f} {y_center:.6f} {w:.6f} {h:.6f}')
    return lines


def _build_data_yaml_content(
    classes: List[Dict[str, Any]],
    dataset_path: Optional[str] = None,
) -> str:
    """Generate the content of a YOLO data.yaml file.

    If *dataset_path* is given it is used as the absolute ``path:`` value
    (for on-disk training datasets).  Otherwise a relative ``./dataset``
    is written (for zipped exports).
    """
    path_value = dataset_path if dataset_path else './dataset'
    yaml_lines = [
        '# YOLO Dataset Config',
        f'path: {path_value}',
        'train: train/images',
        'val: val/images',
        'test: test/images',
        '',
        'names:',
    ]
    for idx, c in enumerate(classes):
        yaml_lines.append(f'  {idx}: {c["name"]}')
    return '\n'.join(yaml_lines) + '\n'


# ─── ZIP export (existing public API — behaviour unchanged) ───────────────────

def build_yolo_zip(
    project_name: str,
    classes: List[Dict[str, Any]],  # [{id, name}]
    images: List[Dict[str, Any]],   # [{name, data_url, split, annotations}]
) -> io.BytesIO:
    """Build a YOLO-format ZIP archive.
    Matches the TypeScript handleExportDataset() exactly."""
    buf = io.BytesIO()

    class_id_to_idx = {c['id']: idx for idx, c in enumerate(classes)}

    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        # Write classes.txt
        classes_content = '\n'.join(c['name'] for c in classes)
        zf.writestr('classes.txt', classes_content)

        # Write dataset.yaml
        zf.writestr('dataset.yaml', _build_data_yaml_content(classes))

        # Write image and label files per split
        for img in images:
            if not img.get('data_url'):
                continue

            # Extract base64 content from data URL
            parts = img['data_url'].split(',', 1)
            if len(parts) < 2:
                continue
            b64_content = parts[1]

            try:
                img_bytes = base64.b64decode(b64_content)
            except Exception:
                continue

            split_dir = img['split']
            img_name = img['name']
            name_without_ext = img_name.rsplit('.', 1)[0] if '.' in img_name else img_name

            # Add image file
            zf.writestr(f'{split_dir}/images/{img_name}', img_bytes)

            # Generate YOLO label file
            label_lines = _annotations_to_yolo_lines(
                img.get('annotations') or [], class_id_to_idx,
            )
            zf.writestr(f'{split_dir}/labels/{name_without_ext}.txt', '\n'.join(label_lines))

    buf.seek(0)
    return buf


# ─── Disk staging (for training) ─────────────────────────────────────────────

def stage_yolo_dataset_to_disk(
    project_name: str,
    classes: List[Dict[str, Any]],   # [{id, name}]
    images: List[Dict[str, Any]],    # [{name, data_url, split, annotations}]
    output_dir: str,
) -> str:
    """Write a YOLO-format dataset to *output_dir* on disk.

    Creates the standard directory layout::

        output_dir/
          data.yaml
          train/images/  train/labels/
          val/images/    val/labels/
          test/images/   test/labels/

    Returns the absolute path to the generated ``data.yaml``.
    """
    out = Path(output_dir)

    class_id_to_idx = {c['id']: idx for idx, c in enumerate(classes)}

    # Pre-create split directories
    for split in ('train', 'val', 'test'):
        (out / split / 'images').mkdir(parents=True, exist_ok=True)
        (out / split / 'labels').mkdir(parents=True, exist_ok=True)

    # Write data.yaml with absolute path so Ultralytics can find the dataset
    data_yaml_path = out / 'data.yaml'
    data_yaml_path.write_text(
        _build_data_yaml_content(classes, dataset_path=str(out.resolve())),
        encoding='utf-8',
    )

    # Write image and label files per split
    for img in images:
        if not img.get('data_url'):
            continue

        parts = img['data_url'].split(',', 1)
        if len(parts) < 2:
            continue
        b64_content = parts[1]

        try:
            img_bytes = base64.b64decode(b64_content)
        except Exception:
            continue

        split_dir = img['split']
        img_name = img['name']
        name_without_ext = img_name.rsplit('.', 1)[0] if '.' in img_name else img_name

        # Write image file
        (out / split_dir / 'images' / img_name).write_bytes(img_bytes)

        # Write YOLO label file
        label_lines = _annotations_to_yolo_lines(
            img.get('annotations') or [], class_id_to_idx,
        )
        (out / split_dir / 'labels' / f'{name_without_ext}.txt').write_text(
            '\n'.join(label_lines), encoding='utf-8',
        )

    return str(data_yaml_path.resolve())
