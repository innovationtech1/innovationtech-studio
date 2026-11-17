// Tipos compartidos entre las pantallas de la plataforma.

export type Settings = {
  anthropicKey: string;
  textProvider: "cloudflare" | "anthropic";
  cfTextModel: string;
  replicateKey: string;
  imageProvider: "cloudflare" | "replicate";
  cfAccountId: string;
  cfToken: string;
  cfImageModel: string;
  cfRefModel: string;
  editModel: string;
  textModel: string;
  imageModel: string;
  videoModel: string;
};

export type Item = {
  id?: string;
  kind: "imagen" | "video";
  url: string;
  prompt: string;
  date: string;
  external?: boolean;
  mime?: string;
  /** El archivo guardado en el aparato (para compartirlo o subirlo a Drive sin volver a leer el enlace blob:). */
  blob?: Blob;
};
