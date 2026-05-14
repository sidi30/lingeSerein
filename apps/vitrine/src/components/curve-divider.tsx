type Props = {
  fill?: string;
  flip?: boolean;
  className?: string;
};

export function CurveDivider({ fill = "var(--color-cream)", flip = false, className = "" }: Props) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none w-full leading-[0] ${className}`}
      style={{ transform: flip ? "rotate(180deg)" : undefined }}
    >
      <svg
        viewBox="0 0 1440 80"
        preserveAspectRatio="none"
        className="block w-full h-[60px] md:h-[80px]"
      >
        <path d="M0,32 C240,80 480,0 720,32 C960,64 1200,8 1440,40 L1440,80 L0,80 Z" fill={fill} />
      </svg>
    </div>
  );
}
