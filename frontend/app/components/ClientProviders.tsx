"use client";

import dynamic from "next/dynamic";

const DynamicProvider = dynamic(() => import("./DynamicProvider"), { ssr: false });

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return <DynamicProvider>{children}</DynamicProvider>;
}
