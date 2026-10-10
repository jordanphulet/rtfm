import { lazy, Suspense } from "react";
import { Navigate, useLocation, useParams } from "react-router";
import { PrototypeErrorBoundary } from "./PrototypeErrorBoundary";
import { PrototypeSwitcher } from "./PrototypeSwitcher";

const variants = {
  a: lazy(() => import("./a")),
  b: lazy(() => import("./b")),
  c: lazy(() => import("./c")),
};

type VariantKey = keyof typeof variants;

function isVariantKey(value: string | undefined): value is VariantKey {
  return value !== undefined && Object.hasOwn(variants, value);
}

export default function LibraryPrototype() {
  const { variant } = useParams();
  const { search } = useLocation();
  if (!isVariantKey(variant)) return <Navigate to={{ pathname: "/library/a", search }} replace />;

  const Variant = variants[variant];
  return (
    <>
      <PrototypeErrorBoundary key={variant}>
        <Suspense>
          <Variant />
        </Suspense>
      </PrototypeErrorBoundary>
      <PrototypeSwitcher variants={Object.keys(variants)} current={variant} />
    </>
  );
}
