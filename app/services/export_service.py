import io, zipfile, base64
from typing import List, Dict, Any

def build_yolo_zip(
    project_name: str,
    classes: List[Dict[str, Any]],  # [{id, name}]
    images: List[Dict[str, Any]],   # [{name, data_url, split, annotations}]
) -> io.BytesIO:
    """Build a YOLO-format ZIP archive.
    Matches the TypeScript handleExportDataset() exactly."""
    buf = io.BytesIO()
    
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        # Write classes.txt
        classes_content = '\n'.join(c['name'] for c in classes)
        zf.writestr('classes.txt', classes_content)
        
        # Write dataset.yaml
        yaml_lines = ['# YOLO Dataset Config', 'path: ./dataset', 'train: train/images',
                      'val: val/images', 'test: test/images', '', 'names:']
        for idx, c in enumerate(classes):
            yaml_lines.append(f'  {idx}: {c["name"]}')
        zf.writestr('dataset.yaml', '\n'.join(yaml_lines) + '\n')
        
        # Write image and label files per split
        class_id_to_idx = {c['id']: idx for idx, c in enumerate(classes)}
        
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
            label_lines = []
            for box in (img.get('annotations') or []):
                class_idx = class_id_to_idx.get(box.get('classId') or box.get('class_id'))
                if class_idx is None:
                    continue
                x = box['x']
                y = box['y']
                w = box['width']
                h = box['height']
                x_center = x + w / 2
                y_center = y + h / 2
                label_lines.append(
                    f'{class_idx} {x_center:.6f} {y_center:.6f} {w:.6f} {h:.6f}'
                )
            
            zf.writestr(f'{split_dir}/labels/{name_without_ext}.txt', '\n'.join(label_lines))
    
    buf.seek(0)
    return buf
