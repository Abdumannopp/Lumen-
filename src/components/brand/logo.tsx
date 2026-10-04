import Image from "next/image";
import * as React from "react";
import { cn } from "@/lib/utils";

interface LogoProps extends React.ComponentProps<"span"> {
  markOnly?: boolean;
}

function Logo({ className, markOnly = false, ...props }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center", className)} {...props}>
      {markOnly ? (
        <>
          <Image className="logo-light h-8 w-8 object-contain" src="/brand/lumen-mark-light.png" alt="Lumen" width={64} height={64} priority />
          <Image className="logo-dark h-8 w-8 object-contain" src="/brand/lumen-mark.png" alt="Lumen" width={64} height={64} priority />
        </>
      ) : (
        <>
          <Image className="logo-light h-9 w-auto object-contain" src="/brand/lumen-logo-light.png" alt="Lumen" width={193} height={56} priority />
          <Image className="logo-dark h-9 w-auto object-contain" src="/brand/lumen-logo-dark.png" alt="Lumen" width={193} height={67} priority />
        </>
      )}
    </span>
  );
}

export { Logo };
