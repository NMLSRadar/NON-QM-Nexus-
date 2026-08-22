import Image from "next/image";

type BrandLogoProps = {
  className?: string;
  priority?: boolean;
};

export function BrandMark({ className = "", priority = false }: BrandLogoProps) {
  return (
    <span className={`brand-logo brand-logo-mark ${className}`.trim()} role="img" aria-label="NON-QM Nexus">
      <Image
        className="brand-logo-dark"
        src="/brand/non-qm-nexus-emblem-dark.png"
        alt=""
        width={480}
        height={400}
        priority={priority}
      />
      <Image
        className="brand-logo-light"
        src="/brand/non-qm-nexus-emblem-light.png"
        alt=""
        width={480}
        height={320}
        priority={priority}
      />
    </span>
  );
}

export function BrandSignature({ className = "", priority = false }: BrandLogoProps) {
  return (
    <span className={`brand-logo brand-logo-signature ${className}`.trim()} role="img" aria-label="NON-QM Nexus">
      <Image
        className="brand-logo-dark"
        src="/brand/non-qm-nexus-logo-dark.png"
        alt=""
        width={750}
        height={600}
        priority={priority}
      />
      <Image
        className="brand-logo-light"
        src="/brand/non-qm-nexus-logo-light.png"
        alt=""
        width={750}
        height={560}
        priority={priority}
      />
    </span>
  );
}
