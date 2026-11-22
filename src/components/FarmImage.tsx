import { useState } from 'react';
import { ImageOff } from 'lucide-react';

interface FarmImageProps {
  src: string;
  alt: string;
  className?: string;
  aspectClass?: string;
}

export function FarmImage({ src, alt, className = '', aspectClass = '' }: FarmImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-500 p-6 text-center ${aspectClass} ${className}`}
        role="img"
        aria-label={alt}
      >
        <ImageOff className="w-7 h-7 mb-2 text-slate-400" aria-hidden="true" />
        <span className="text-xs font-medium text-slate-600 max-w-xs">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`block w-full object-cover ${aspectClass} ${className}`}
    />
  );
}
