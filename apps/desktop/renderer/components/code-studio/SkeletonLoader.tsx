"use client";

interface SkeletonLoaderProps {
  width?: string | number;
  height?: string | number;
  rounded?: boolean;
  className?: string;
  count?: number;
}

export default function SkeletonLoader({
  width = "100%",
  height = 16,
  rounded = true,
  className = "",
  count = 1,
}: SkeletonLoaderProps) {
  const style = {
    width: typeof width === "number" ? `${width}px` : width,
    height: typeof height === "number" ? `${height}px` : height,
  };

  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`animate-pulse bg-white/10 ${rounded ? "rounded-md" : ""} ${className}`}
          style={style}
        />
      ))}
    </>
  );
}
