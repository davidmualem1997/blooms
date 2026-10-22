"use client";

import * as tus from "tus-js-client";
import { createClient } from "@/lib/supabase/client";

export type MediaEntry = { path: string; thumb: string | null; kind: "image" | "video" };

const BUCKET = "media";

// תמונה ממוזערת (JPEG ברוחב 480) מתמונה או מפריים של סרטון; null אם הדפדפן לא מצליח לפענח
export function makeThumb(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const finish = (b: Blob | null) => { URL.revokeObjectURL(url); resolve(b); };
    const draw = (src: CanvasImageSource, w: number, h: number) => {
      const W = 480;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = Math.round((W * h) / w) || 600;
      canvas.getContext("2d")!.drawImage(src, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => finish(b), "image/jpeg", 0.75);
    };
    if (file.type.startsWith("video")) {
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      v.src = url;
      const timer = setTimeout(() => finish(null), 10000);
      // אייפון לא מפענח פריים לפני ניגון – "מעירים" את הסרטון, ובודקים שהפריים לא שחור (פתיחה בהשחרה)
      let tries: number[] = [];
      const dark = () => {
        const c = document.createElement("canvas");
        c.width = 16; c.height = 16;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(v, 0, 0, 16, 16);
        const px = ctx.getImageData(0, 0, 16, 16).data;
        let sum = 0;
        for (let i = 0; i < px.length; i += 4) sum += px[i] + px[i + 1] + px[i + 2];
        return sum / (px.length / 4) / 3 < 14;
      };
      v.onloadeddata = async () => {
        const d = v.duration || 2;
        tries = [Math.min(1, d / 3), d * 0.25, d * 0.5].filter((t, i, a) => t < d && a.indexOf(t) === i);
        try { await v.play(); v.pause(); } catch { /* חלק מהדפדפנים לא צריכים */ }
        v.currentTime = tries.shift() ?? 0;
      };
      v.onseeked = () => {
        try {
          if (tries.length && dark()) { v.currentTime = tries.shift()!; return; }
          clearTimeout(timer);
          draw(v, v.videoWidth, v.videoHeight);
        } catch { clearTimeout(timer); finish(null); }
      };
      v.onerror = () => { clearTimeout(timer); finish(null); };
    } else {
      const img = new Image();
      img.onload = () => { try { draw(img, img.naturalWidth, img.naturalHeight); } catch { finish(null); } };
      img.onerror = () => finish(null);
      img.src = url;
    }
  });
}

// העלאה שממשיכה אחרי ניתוק (TUS), מתאימה לסרטונים גדולים מהאייפון
function uploadResumable(file: Blob, path: string, contentType: string, token: string, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        "x-upsert": "true",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: { bucketName: BUCKET, objectName: path, contentType, cacheControl: "3600" },
      chunkSize: 6 * 1024 * 1024, // Supabase דורש בדיוק 6MB
      onError: reject,
      onProgress: (sent, total) => onProgress(total ? sent / total : 0),
      onSuccess: () => resolve(),
    });
    upload.findPreviousUploads().then((prev) => {
      if (prev.length) upload.resumeFromPreviousUpload(prev[0]);
      upload.start();
    });
  });
}

// מעלה קובץ לתיקייה של הלקוח, יחד עם תמונה ממוזערת
export async function uploadMedia(file: File, studioId: string, clientId: string, onProgress: (p: number) => void): Promise<MediaEntry> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("not signed in");

  const folder = `${studioId}/${clientId}/${crypto.randomUUID()}`;
  const ext = (file.name.split(".").pop() || (file.type.startsWith("video") ? "mp4" : "jpg")).toLowerCase();
  const path = `${folder}/original.${ext}`;
  const kind = file.type.startsWith("video") ? "video" : "image";

  const thumbBlob = await makeThumb(file);
  let thumb: string | null = null;
  if (thumbBlob) {
    thumb = `${folder}/thumb.jpg`;
    await supabase.storage.from(BUCKET).upload(thumb, thumbBlob, { contentType: "image/jpeg", upsert: true });
  }
  await uploadResumable(file, path, file.type || "application/octet-stream", token, onProgress);
  return { path, thumb, kind };
}
