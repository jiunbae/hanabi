import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

interface AdSlotProps {
  slot: string;
  format?: 'auto' | 'fixed';
  width?: number;
  height?: number;
  className?: string;
}

const AD_CLIENT = 'ca-pub-3746587025439528';

export function AdSlot({ slot, format = 'auto', width, height, className = '' }: AdSlotProps) {
  const pushed = useRef(false);

  useEffect(() => {
    if (pushed.current) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushed.current = true;
    } catch {}
  }, []);

  if (format === 'fixed' && width && height) {
    return (
      <div className={`ad-slot ${className}`}>
        <ins
          className="adsbygoogle"
          style={{ display: 'inline-block', width, height }}
          data-ad-client={AD_CLIENT}
          data-ad-slot={slot}
        />
      </div>
    );
  }

  return (
    <div className={`ad-slot ${className}`}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={AD_CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
