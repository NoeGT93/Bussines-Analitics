// Solo para la compilación "single" (vista previa liviana con librerías desde CDN):
// reemplaza react/jsx-runtime usando el React global.
import React from 'react';

type Props = Record<string, unknown> | null;
const withKey = (props: Props, key?: unknown) => (key === undefined ? props : { ...(props ?? {}), key });

export const Fragment = React.Fragment;
export function jsx(type: React.ElementType, props: Props, key?: unknown) {
  return React.createElement(type, withKey(props, key));
}
export const jsxs = jsx;
