"""
ui/amc_page.py  —  Animal Monitoring & Collection module.
Upload field videos directly to Servers.

Requirements (pip install):
    google-api-python-client
    google-auth-httplib2
    google-auth-oauthlib

Place your OAuth2 client_secret.json in the project root or set
AMC_CREDENTIALS_PATH env var to its location.
"""
from __future__ import annotations

import os
import mimetypes
import traceback
from pathlib import Path
from typing import List, Optional

from PyQt5.QtCore    import Qt, QThread, pyqtSignal, QTimer
from PyQt5.QtGui     import QColor, QFont, QLinearGradient, QPainter
from PyQt5.QtWidgets import (
    QFileDialog, QFrame, QGraphicsDropShadowEffect,
    QHBoxLayout, QLabel, QLineEdit, QListWidget,
    QListWidgetItem, QMessageBox, QProgressBar,
    QPushButton, QVBoxLayout, QWidget,
)

from .forest_theme import CLR


# ── Google Drive upload worker ────────────────────────────────────────────────
class DriveUploadWorker(QThread):
    file_started  = pyqtSignal(int, str)        # (index, filename)
    file_progress = pyqtSignal(int, int, int)   # (index, bytes_done, total)
    file_done     = pyqtSignal(int, str)        # (index, drive_link)
    file_error    = pyqtSignal(int, str)        # (index, error_msg)
    all_done      = pyqtSignal()

    def __init__(self, credentials_path: str,
                 file_paths: List[str],
                 drive_folder_id: str = "root",
                 parent=None):
        super().__init__(parent)
        self._creds_path  = credentials_path
        self._files       = file_paths
        self._folder_id   = drive_folder_id
        self._stop        = False

    def stop(self):
        self._stop = True

    def run(self):
        try:
            from google.oauth2.credentials import Credentials
            from google_auth_oauthlib.flow import InstalledAppFlow
            from googleapiclient.discovery import build
            from googleapiclient.http import MediaFileUpload
            from google.auth.transport.requests import Request
            import pickle

            SCOPES = ["https://www.googleapis.com/auth/drive.file"]
            token_path = Path(self._creds_path).parent / "token.pickle"

            creds = None
            if token_path.exists():
                with open(token_path, "rb") as f:
                    creds = pickle.load(f)
            if not creds or not creds.valid:
                if creds and creds.expired and creds.refresh_token:
                    creds.refresh(Request())
                else:
                    flow = InstalledAppFlow.from_client_secrets_file(
                        self._creds_path, SCOPES)
                    creds = flow.run_local_server(port=0)
                with open(token_path, "wb") as f:
                    pickle.dump(creds, f)

            service = build("drive", "v3", credentials=creds)

            for idx, fpath in enumerate(self._files):
                if self._stop:
                    break
                fname = Path(fpath).name
                self.file_started.emit(idx, fname)

                mime, _ = mimetypes.guess_type(fpath)
                mime = mime or "application/octet-stream"
                size = os.path.getsize(fpath)

                meta = {"name": fname, "parents": [self._folder_id]}
                media = MediaFileUpload(
                    fpath, mimetype=mime, resumable=True, chunksize=4 * 1024 * 1024)

                req = service.files().create(
                    body=meta, media_body=media, fields="id,webViewLink")

                response = None
                while response is None:
                    if self._stop:
                        break
                    status, response = req.next_chunk()
                    if status:
                        done = int(status.resumable_progress)
                        self.file_progress.emit(idx, done, size)

                if response:
                    link = response.get("webViewLink", "")
                    self.file_done.emit(idx, link)

        except Exception:
            # Surface to the last file slot
            idx = len(self._files) - 1
            self.file_error.emit(idx, traceback.format_exc())
        finally:
            self.all_done.emit()


# ── File list item widget ─────────────────────────────────────────────────────
class _FileItem(QWidget):
    def __init__(self, path: str, parent=None):
        super().__init__(parent)
        self.path = path
        lv = QVBoxLayout(self)
        lv.setContentsMargins(8, 6, 8, 6)
        lv.setSpacing(3)

        top = QHBoxLayout()
        self._name = QLabel(Path(path).name)
        self._name.setStyleSheet(
            f"color:{CLR['text_pri']};font-size:11px;background:transparent;")
        size_mb = os.path.getsize(path) / 1e6
        self._size = QLabel(f"{size_mb:.1f} MB")
        self._size.setStyleSheet(
            f"color:{CLR['text_dim']};font-size:10px;background:transparent;")
        top.addWidget(self._name)
        top.addStretch()
        top.addWidget(self._size)
        lv.addLayout(top)

        self._bar = QProgressBar()
        self._bar.setRange(0, 100)
        self._bar.setValue(0)
        self._bar.setFixedHeight(6)
        self._bar.setTextVisible(False)
        lv.addWidget(self._bar)

        self._status = QLabel("Queued")
        self._status.setStyleSheet(
            f"color:{CLR['text_dim']};font-size:9px;background:transparent;")
        lv.addWidget(self._status)

    def set_uploading(self):
        self._status.setText("Uploading…")
        self._status.setStyleSheet(
            f"color:{CLR['gold']};font-size:9px;background:transparent;")

    def set_progress(self, done: int, total: int):
        pct = int(done / max(total, 1) * 100)
        self._bar.setValue(pct)
        self._status.setText(f"{done // 1024 // 1024} MB / {total // 1024 // 1024} MB")

    def set_done(self, link: str):
        self._bar.setValue(100)
        self._status.setText(f"✦  Uploaded")
        self._status.setStyleSheet(
            f"color:{CLR['green_hi']};font-size:9px;font-weight:bold;"
            f"background:transparent;")
        self._name.setStyleSheet(
            f"color:{CLR['green_hi']};font-size:11px;background:transparent;")

    def set_error(self, msg: str):
        self._status.setText("✕  Error")
        self._status.setStyleSheet(
            f"color:{CLR['danger']};font-size:9px;background:transparent;")


# ── Decorative separator ──────────────────────────────────────────────────────
class _GoldRule(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedHeight(2)

    def paintEvent(self, _):
        p = QPainter(self)
        g = QLinearGradient(0, 0, self.width(), 0)
        for pos, col in [
            (0.0, "#060f09"), (0.3, "#1e4a2a"),
            (0.5, "#c8a84b"), (0.7, "#1e4a2a"), (1.0, "#060f09"),
        ]:
            g.setColorAt(pos, QColor(col))
        p.fillRect(self.rect(), g)


# ── AMC Page ──────────────────────────────────────────────────────────────────
class AMCPage(QWidget):
    back_requested = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self._file_items: List[_FileItem] = []
        self._worker: Optional[DriveUploadWorker] = None
        self._build()

    def _build(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        # ── Header ────────────────────────────────────────────────
        header = QWidget()
        header.setFixedHeight(80)
        header.setStyleSheet(
            f"background:qlineargradient(x1:0,y1:0,x2:0,y2:1,"
            f"stop:0 #0a1f0d,stop:1 {CLR['bg_deep']});")
        hv = QHBoxLayout(header)
        hv.setContentsMargins(16, 12, 16, 8)

        btn_back = QPushButton("← Home")
        btn_back.setObjectName("btnBack")
        btn_back.setCursor(Qt.PointingHandCursor)
        btn_back.clicked.connect(self.back_requested.emit)
        hv.addWidget(btn_back)
        hv.addStretch()

        title = QLabel("📁  AMC  —  Animal Monitoring & Collection")
        title.setStyleSheet(
            f"color:{CLR['gold_hi']};font-size:15px;font-weight:bold;"
            f"letter-spacing:3px;background:transparent;")
        hv.addWidget(title)
        hv.addStretch()
        root.addWidget(header)
        root.addWidget(_GoldRule())

        # ── Body ─────────────────────────────────────────────────
        body = QWidget()
        body.setStyleSheet(f"background:{CLR['bg_deep']};")
        bv = QHBoxLayout(body)
        bv.setContentsMargins(16, 16, 16, 16)
        bv.setSpacing(12)

        # ── Left: config ──────────────────────────────────────────
        left = QWidget()
        left.setFixedWidth(280)
        left.setStyleSheet(
            f"background:{CLR['bg_panel']};border-radius:10px;")
        lv = QVBoxLayout(left)
        lv.setContentsMargins(14, 14, 14, 14)
        lv.setSpacing(10)

        def _sec(t):
            l = QLabel(t)
            l.setStyleSheet(
                f"color:{CLR['gold']};font-size:9px;font-weight:bold;"
                f"letter-spacing:2px;background:transparent;")
            return l

        lv.addWidget(_sec("GOOGLE DRIVE CREDENTIALS"))
        self._creds_path = QLineEdit()
        self._creds_path.setPlaceholderText("Path to client_secret.json")
        default = str(Path(__file__).resolve().parents[1] / "client_secret.json")
        if Path(default).exists():
            self._creds_path.setText(default)
        lv.addWidget(self._creds_path)

        btn_browse_creds = QPushButton("Browse credentials…")
        btn_browse_creds.setCursor(Qt.PointingHandCursor)
        btn_browse_creds.clicked.connect(self._browse_creds)
        lv.addWidget(btn_browse_creds)

        div = QFrame()
        div.setFrameShape(QFrame.HLine)
        div.setStyleSheet(f"border:1px solid {CLR['border']};")
        lv.addWidget(div)

        lv.addWidget(_sec("GOOGLE DRIVE FOLDER ID  (optional)"))
        self._folder_id = QLineEdit()
        self._folder_id.setPlaceholderText("Leave blank for My Drive root")
        lv.addWidget(self._folder_id)

        help_lbl = QLabel(
            "Folder ID is the last part of the  Server\n"
            "folder URL after /folders/")
        help_lbl.setWordWrap(True)
        help_lbl.setStyleSheet(
            f"color:{CLR['text_dim']};font-size:9px;background:transparent;")
        lv.addWidget(help_lbl)

        div2 = QFrame()
        div2.setFrameShape(QFrame.HLine)
        div2.setStyleSheet(f"border:1px solid {CLR['border']};")
        lv.addWidget(div2)

        lv.addWidget(_sec("ACTIONS"))

        btn_add = QPushButton("  Add Videos")
        btn_add.setCursor(Qt.PointingHandCursor)
        btn_add.clicked.connect(self._add_videos)
        lv.addWidget(btn_add)

        btn_clear = QPushButton("Clear List")
        btn_clear.setCursor(Qt.PointingHandCursor)
        btn_clear.clicked.connect(self._clear_list)
        lv.addWidget(btn_clear)

        lv.addStretch()

        self._upload_btn = QPushButton("  Upload to Drive")
        self._upload_btn.setObjectName("btnStart")
        self._upload_btn.setCursor(Qt.PointingHandCursor)
        self._upload_btn.setEnabled(False)
        self._upload_btn.clicked.connect(self._start_upload)
        lv.addWidget(self._upload_btn)

        self._stop_btn = QPushButton("■  Stop")
        self._stop_btn.setObjectName("btnStop")
        self._stop_btn.setCursor(Qt.PointingHandCursor)
        self._stop_btn.setEnabled(False)
        self._stop_btn.clicked.connect(self._stop_upload)
        lv.addWidget(self._stop_btn)

        bv.addWidget(left)

        # ── Right: file list ──────────────────────────────────────
        right = QWidget()
        right.setStyleSheet(
            f"background:{CLR['bg_panel']};border-radius:10px;")
        rv = QVBoxLayout(right)
        rv.setContentsMargins(14, 14, 14, 14)
        rv.setSpacing(8)

        list_hdr = QHBoxLayout()
        list_hdr.addWidget(_sec("VIDEO QUEUE"))
        list_hdr.addStretch()
        self._count_lbl = QLabel("0 files")
        self._count_lbl.setStyleSheet(
            f"color:{CLR['text_dim']};font-size:10px;background:transparent;")
        list_hdr.addWidget(self._count_lbl)
        rv.addLayout(list_hdr)

        self._list_widget = QListWidget()
        self._list_widget.setStyleSheet(
            f"background:{CLR['bg_deep']}; border:1px solid {CLR['border']};"
            f"border-radius:6px;")
        rv.addWidget(self._list_widget, 1)

        # Overall progress
        rv.addWidget(_sec("OVERALL PROGRESS"))
        self._overall_bar = QProgressBar()
        self._overall_bar.setRange(0, 100)
        self._overall_bar.setValue(0)
        rv.addWidget(self._overall_bar)

        self._overall_lbl = QLabel("No upload in progress")
        self._overall_lbl.setStyleSheet(
            f"color:{CLR['text_sec']};font-size:10px;background:transparent;")
        rv.addWidget(self._overall_lbl)
        bv.addWidget(right, 1)

        root.addWidget(body, 1)

    # ── Helpers ───────────────────────────────────────────────────
    def _browse_creds(self):
        p, _ = QFileDialog.getOpenFileName(
            self, "Select credentials JSON", "",
            "JSON Files (*.json)")
        if p:
            self._creds_path.setText(p)

    def _add_videos(self):
        paths, _ = QFileDialog.getOpenFileNames(
            self, "Select Videos", "",
            "Video Files (*.mp4 *.avi *.mov *.MP4 *.AVI *.MOV *.mkv)")
        for p in paths:
            item_widget = _FileItem(p)
            self._file_items.append(item_widget)
            li = QListWidgetItem(self._list_widget)
            li.setSizeHint(item_widget.sizeHint())
            self._list_widget.addItem(li)
            self._list_widget.setItemWidget(li, item_widget)
        self._update_ui()

    def _clear_list(self):
        self._list_widget.clear()
        self._file_items.clear()
        self._update_ui()

    def _update_ui(self):
        n = len(self._file_items)
        self._count_lbl.setText(f"{n} file{'s' if n != 1 else ''}")
        self._upload_btn.setEnabled(n > 0)

    def _start_upload(self):
        creds = self._creds_path.text().strip()
        if not creds or not Path(creds).exists():
            QMessageBox.warning(
                self, "Missing Credentials",
                "Please select a valid client_secret.json file.")
            return

        folder = self._folder_id.text().strip() or "root"
        paths  = [fi.path for fi in self._file_items]

        self._worker = DriveUploadWorker(creds, paths, folder)
        self._worker.file_started.connect(self._on_file_started)
        self._worker.file_progress.connect(self._on_file_progress)
        self._worker.file_done.connect(self._on_file_done)
        self._worker.file_error.connect(self._on_file_error)
        self._worker.all_done.connect(self._on_all_done)
        self._worker.start()

        self._upload_btn.setEnabled(False)
        self._stop_btn.setEnabled(True)
        self._overall_lbl.setText("Uploading…")
        self._overall_bar.setValue(0)

    def _stop_upload(self):
        if self._worker:
            self._worker.stop()
        self._stop_btn.setEnabled(False)

    # ── Worker slots ──────────────────────────────────────────────
    def _on_file_started(self, idx: int, name: str):
        if 0 <= idx < len(self._file_items):
            self._file_items[idx].set_uploading()
        self._overall_lbl.setText(f"Uploading: {name}")

    def _on_file_progress(self, idx: int, done: int, total: int):
        if 0 <= idx < len(self._file_items):
            self._file_items[idx].set_progress(done, total)

    def _on_file_done(self, idx: int, link: str):
        if 0 <= idx < len(self._file_items):
            self._file_items[idx].set_done(link)
        done_count = sum(
            1 for fi in self._file_items
            if "Uploaded" in fi._status.text())
        pct = int(done_count / max(len(self._file_items), 1) * 100)
        self._overall_bar.setValue(pct)

    def _on_file_error(self, idx: int, msg: str):
        if 0 <= idx < len(self._file_items):
            self._file_items[idx].set_error(msg)
        QMessageBox.critical(self, "Upload Error", msg[:600])

    def _on_all_done(self):
        self._upload_btn.setEnabled(True)
        self._stop_btn.setEnabled(False)
        self._overall_bar.setValue(100)
        n_ok = sum(1 for fi in self._file_items if "Uploaded" in fi._status.text())
        self._overall_lbl.setText(
            f"Complete — {n_ok} / {len(self._file_items)} files uploaded")