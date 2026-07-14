/// <reference types="vite/client" />
/// <reference types="chrome" />

declare module '*.css' {
  const css: string;
  export default css;
}

declare module '*.json' {
  const value: unknown;
  export default value;
}
