import { BoundingBox, ImageSplit } from './types';

const DB_NAME = 'CVDatasetManagerDB';
const DB_VERSION = 1;
const STORE_NAME = 'images';

export interface ProjectImage {
  id: string;
  projectId: string;
  name: string;
  size: number;
  type: string;
  dataUrl: string; // base64 string
  annotated: boolean;
  createdAt: number;
  annotations?: BoundingBox[];
  split?: ImageSplit;
  isAugmented?: boolean;
  originalImageId?: string;
}

export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('projectId', 'projectId', { unique: false });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function saveImage(image: ProjectImage): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(image);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function saveImagesBatch(images: ProjectImage[]): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    let completed = 0;
    if (images.length === 0) {
      resolve();
      return;
    }

    images.forEach((img) => {
      const request = store.put(img);
      request.onsuccess = () => {
        completed++;
        if (completed === images.length) {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export async function getImagesByProject(projectId: string): Promise<ProjectImage[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('projectId');
    const request = index.getAll(IDBKeyRange.only(projectId));

    request.onsuccess = () => {
      // Sort by creation time (ascending/descending as preferred, let's do oldest first/newest first based on UI)
      const results = request.result as ProjectImage[];
      results.sort((a, b) => a.createdAt - b.createdAt);
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteImage(id: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteProjectImages(projectId: string): Promise<void> {
  const db = await initDB();
  const images = await getImagesByProject(projectId);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    let completed = 0;
    if (images.length === 0) {
      resolve();
      return;
    }

    images.forEach((img) => {
      const request = store.delete(img.id);
      request.onsuccess = () => {
        completed++;
        if (completed === images.length) {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  });
}
