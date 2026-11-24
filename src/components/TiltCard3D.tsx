import React, { useRef, useState } from 'react';

interface TiltCard3DProps {
  children: React.ReactNode;
  className?: string;
  maxTilt?: number;
  onClick?: () => void;
  asButton?: boolean;
}

export const TiltCard3D: React.FC<TiltCard3DProps> = ({
  children,
  className = '',
  maxTilt = 6,
  onClick,
  asButton = false,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<{
    rx: number;
    ry: number;
    gx: number;
    gy: number;
    hovering: boolean;
  }>({ rx: 0, ry: 0, gx: 50, gy: 50, hovering: false });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const ry = (px - 0.5) * (maxTilt * 2);
    const rx = (0.5 - py) * (maxTilt * 2);
    setStyle({
      rx,
      ry,
      gx: Math.round(px * 100),
      gy: Math.round(py * 100),
      hovering: true,
    });
  };

  const handleMouseLeave = () => {
    setStyle({ rx: 0, ry: 0, gx: 50, gy: 50, hovering: false });
  };

  const transform = style.hovering
    ? `perspective(1100px) rotateX(${style.rx.toFixed(2)}deg) rotateY(${style.ry.toFixed(2)}deg) translateY(-3px) scale3d(1.01, 1.01, 1.01)`
    : 'perspective(1100px) rotateX(0deg) rotateY(0deg) translateY(0px) scale3d(1, 1, 1)';

  return (
    <div
      ref={ref}
      role={asButton ? 'button' : undefined}
      tabIndex={asButton ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        asButton && onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ transform }}
      className={`relative card-3d-surface ${asButton ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C89B3C]' : ''} ${className}`}
    >
      {style.hovering && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] z-10 transition-opacity duration-150"
          style={{
            background: `radial-gradient(circle at ${style.gx}% ${style.gy}%, rgba(200, 155, 60, 0.14), transparent 58%)`,
          }}
        />
      )}
      {children}
    </div>
  );
};
