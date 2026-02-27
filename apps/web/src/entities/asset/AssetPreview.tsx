import React, { useState, useEffect, useMemo } from 'react';

interface Props {
  src?: string;
  type?: 'image' | 'video' | 'audio' | 'doc';
  width?: number | null;
  height?: number | null;
}

export function AssetPreview({ src, type = 'image', width, height }: Props) {
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (type === 'image' && src && !imageDimensions && !width && !height) {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (w > 0 && h > 0) {
          setImageDimensions({ width: w, height: h });
        }
      };
      img.onerror = () => {
        // Оставляем размеры по умолчанию, если не удалось определить их автоматически
      };
      img.src = src;
    }
  }, [src, type, imageDimensions, width, height]);

  // Вычисляем соотношение сторон по заданным или автоматически определённым размерам
  const aspectRatio = useMemo(() => {
    const finalWidth = width ?? imageDimensions?.width ?? null;
    const finalHeight = height ?? imageDimensions?.height ?? null;
    
    if (finalWidth && finalHeight && finalWidth > 0 && finalHeight > 0) {
      return `${finalWidth}/${finalHeight}`;
    }
    return '16/9'; // Соотношение по умолчанию
  }, [width, height, imageDimensions]);

  if (!src) {
    return (
      <div 
        className="flex items-center justify-center bg-gray-100"
        style={{ aspectRatio }}
      >
        <div className="text-gray-400">Нет превью</div>
      </div>
    );
  }

  if (type === 'image') {
    return (
      <div 
        className="flex items-center justify-center bg-gray-50 overflow-hidden w-full"
        style={{ aspectRatio, maxHeight: '80vh' }}
      >
        <img 
          src={src} 
          alt="Preview" 
          className="max-w-full max-h-full w-auto h-auto object-contain"
        />
      </div>
    );
  }

  if (type === 'video') {
    return (
      <div 
        className="flex items-center justify-center bg-gray-50 overflow-hidden w-full"
        style={{ aspectRatio, maxHeight: '80vh' }}
      >
        <video 
          src={src} 
          className="max-w-full max-h-full w-auto h-auto object-contain" 
          controls 
        />
      </div>
    );
  }

  if (type === 'audio') {
    return (
      <div className="flex items-center justify-center bg-gray-50 p-8">
        <audio src={src} className="w-full max-w-md" controls />
      </div>
    );
  }

  return (
    <div 
      className="flex items-center justify-center bg-gray-50 overflow-hidden"
      style={{ aspectRatio }}
    >
      <iframe 
        src={src} 
        className="max-w-full max-h-full w-full h-full object-contain"
        title="Preview"
      />
    </div>
  );
}




