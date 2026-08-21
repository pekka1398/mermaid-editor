"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

function newDiagramId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace(`/d/${newDiagramId()}`);
  }, [router]);

  return null;
}
