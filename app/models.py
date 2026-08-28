from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Float, Text
from sqlalchemy.orm import relationship
from app.database import Base

class Project(Base):
    __tablename__ = 'projects'
    id = Column(String, primary_key=True)  # e.g. 'proj-{uuid}'
    name = Column(String, nullable=False)
    created_at = Column(Float, nullable=False)  # Unix timestamp in ms (matching JS Date.now())
    image_count = Column(Integer, default=0)
    classes = relationship('ProjectClass', back_populates='project', cascade='all, delete-orphan')
    images = relationship('ProjectImage', back_populates='project', cascade='all, delete-orphan')
    model = relationship('ProjectModel', back_populates='project', uselist=False, cascade='all, delete-orphan')

class ProjectClass(Base):
    __tablename__ = 'classes'
    id = Column(String, primary_key=True)  # e.g. 'cls-{uuid}'
    project_id = Column(String, ForeignKey('projects.id'), nullable=False)
    name = Column(String, nullable=False)
    color = Column(String, nullable=False)  # hex color
    project = relationship('Project', back_populates='classes')

class ProjectImage(Base):
    __tablename__ = 'images'
    id = Column(String, primary_key=True)  # e.g. 'img-{uuid}'
    project_id = Column(String, ForeignKey('projects.id'), nullable=False)
    name = Column(String, nullable=False)
    size = Column(Integer, nullable=False)
    type = Column(String, nullable=False)
    data_url = Column(Text, nullable=False)  # base64 data URL
    annotated = Column(Boolean, default=False)
    created_at = Column(Float, nullable=False)  # Unix timestamp in ms
    annotations = Column(Text, default='[]')  # JSON array of confirmed BoundingBox objects
    split = Column(String, default='unassigned')  # 'train'|'val'|'test'|'unassigned'
    is_augmented = Column(Boolean, default=False)
    original_image_id = Column(String, nullable=True)
    # AI suggestions — separate from confirmed annotations until accepted
    ai_suggestions = Column(Text, default='[]')   # JSON array of AISuggestion objects
    has_suggestions = Column(Boolean, default=False)
    project = relationship('Project', back_populates='images')

class Setting(Base):
    __tablename__ = 'settings'
    key = Column(String, primary_key=True)
    value = Column(String, nullable=False)

class ProjectModel(Base):
    """Stores a single ONNX model per project."""
    __tablename__ = 'project_models'
    id = Column(String, primary_key=True)           # e.g. 'mdl-{uuid}'
    project_id = Column(String, ForeignKey('projects.id'), nullable=False, unique=True)
    filename = Column(String, nullable=False)        # original uploaded filename
    file_path = Column(String, nullable=False)       # server-side storage path
    class_names = Column(Text, nullable=True)        # JSON list of model's own class names, or null
    class_mapping = Column(Text, default='{}')       # JSON: {"0": "cls-xxx", "1": "cls-yyy", ...}
    num_classes = Column(Integer, nullable=False, default=0)
    input_shape = Column(Text, default='[640,640]')  # JSON [H, W]
    confidence_threshold = Column(Float, default=0.5)
    created_at = Column(Float, nullable=False)
    project = relationship('Project', back_populates='model')
