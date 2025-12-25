import React from 'react';

interface Props {
  src?: string;
  type?: 'image' | 'video' | 'audio' | 'doc';
}

export function AssetPreview({ src, type = 'image' }: Props) {
  if (!src) return <div className="aspect-video bg-gray-100" />;
  if (type === 'image') return <img src={src} className="aspect-video h-full w-full object-cover" />;
  if (type === 'video') return <video src={src} className="aspect-video h-full w-full" controls />;
  if (type === 'audio') return <audio src={src} className="w-full" controls />;
  return <iframe src={src} className="aspect-video h-full w-full" />;
}




