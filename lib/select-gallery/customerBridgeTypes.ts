export type CustomerBridgeGallery = {
  id: string;
  title: string;
  hospital_name?: string | null;
  shooting_name?: string | null;
  total_jpg_count: number;
  allow_resubmit: boolean;
  download_jpg_enabled?: boolean;
  download_raw_enabled?: boolean;
};

export type CustomerBridgeImage = {
  id: string;
  original_file_name: string;
  relative_path?: string | null;
  thumbnail_url?: string | null;
  image_url: string;
  sort_order: number;
};

export type CustomerBridgeFolderManifestEntry = {
  path: string;
  name: string;
  parentPath: string;
  depth: number;
  directCount: number;
  totalCount: number;
  representativeImageId: string | null;
};

export type CustomerBridgeFolderManifest = {
  totalCount: number;
  rootPhotoCount: number;
  folders: CustomerBridgeFolderManifestEntry[];
};

export type CustomerBridgeDraft = {
  revision: number;
  selectedImageIds: string[];
  ratings: Record<string, number>;
  colorLabels?: Record<string, number>;
  imageNotes: Record<string, string>;
  customerMemo: string;
  updatedAt?: string | null;
};
