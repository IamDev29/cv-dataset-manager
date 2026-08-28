export interface ProjectClass {
  id: string;
  name: string;
  color: string; // Hex color code for annotations and labeling highlights
}

export type ImageSplit = 'train' | 'val' | 'test' | 'unassigned';

export interface BoundingBox {
  id: string;
  classId: string;
  x: number; // fractional coordinates (0 to 1)
  y: number; // fractional coordinates (0 to 1)
  width: number; // fractional coordinates (0 to 1)
  height: number; // fractional coordinates (0 to 1)
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  imageCount: number;
  classes?: ProjectClass[];
}

