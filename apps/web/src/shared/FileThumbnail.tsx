import React, { useState } from 'react';

interface Props {
  fileId: number | null;
  mimeType: string | null;
  type?: 'image' | 'video' | 'audio' | 'doc';
  className?: string;
}

function getFileIcon(mimeType: string | null, type?: 'image' | 'video' | 'audio' | 'doc'): string {
  if (!mimeType && !type) return '📄';
  
  const mime = (mimeType || '').toLowerCase();
  const fileType = type || '';
  
  // Изображения
  if (mime.startsWith('image/') || fileType === 'image') {
    return '🖼️';
  }
  
  // Видео
  if (mime.startsWith('video/') || fileType === 'video') {
    return '🎥';
  }
  
  // Аудио
  if (mime.startsWith('audio/') || fileType === 'audio') {
    return '🎵';
  }
  
  // Документы
  if (mime.includes('pdf')) return '📕';
  if (mime.includes('word') || mime.includes('document')) return '📘';
  if (mime.includes('excel') || mime.includes('spreadsheet')) return '📗';
  if (mime.includes('powerpoint') || mime.includes('presentation')) return '📙';
  if (mime.includes('text') || mime.includes('plain')) return '📄';
  if (fileType === 'doc') return '📄';
  
  // Архивы
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('tar') || mime.includes('7z')) {
    return '📦';
  }
  
  // Файлы кода
  if (mime.includes('javascript') || mime.includes('json')) return '📜';
  if (mime.includes('html') || mime.includes('xml')) return '🌐';
  if (mime.includes('css')) return '🎨';
  
  // Значок по умолчанию
  return '📄';
}

export function FileThumbnail({ fileId, mimeType, type, className = '' }: Props) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  
  const isImage = mimeType?.startsWith('image/') || type === 'image';
  const isVideo = mimeType?.startsWith('video/') || type === 'video';
  const icon = getFileIcon(mimeType, type);
  const previewUrl = fileId ? `/api/files/${fileId}/preview` : null;

  const thumbContainer = `flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded border bg-gray-50 ${className}`;

  if (!previewUrl || imageError) {
    return (
      <div className={thumbContainer}>
        {icon}
      </div>
    );
  }

  if (isImage) {
    return (
      <div className={`relative ${thumbContainer}`}>
        {imageLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-lg">
            {icon}
          </div>
        )}
        <img
          src={previewUrl}
          alt=""
          className={`h-full w-full object-contain ${imageLoading ? 'opacity-0' : 'opacity-100'}`}
          onLoad={() => setImageLoading(false)}
          onError={() => {
            setImageError(true);
            setImageLoading(false);
          }}
        />
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className={`relative ${thumbContainer}`}>
        <video
          src={previewUrl}
          muted
          playsInline
          preload="auto"
          className="h-full w-full object-contain"
          onError={() => setImageError(true)}
        />
      </div>
    );
  }

  return (
    <div className={thumbContainer}>
      {icon}
    </div>
  );
}

