/**
 * CSS Modules type shim for the browser bundle.
 * @module dsh-reminder/client/css-modules
 */

declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
