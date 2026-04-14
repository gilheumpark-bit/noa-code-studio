"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/code-studio");
  }, [router]);

  return <div className="h-screen w-screen bg-[#1c1a17]" />;
}
