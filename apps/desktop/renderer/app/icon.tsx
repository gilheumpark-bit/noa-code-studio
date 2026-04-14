import { ImageResponse } from 'next/og';

export const dynamic = 'force-static';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
          borderRadius: '25%',
        }}
      >
        <span
          style={{
            fontSize: 280,
            fontWeight: 700,
            color: '#ffffff',
            letterSpacing: '-0.05em',
            fontFamily: 'sans-serif',
          }}
        >
          EH
        </span>
      </div>
    ),
    { ...size },
  );
}
