// Allow CSS side-effect imports (handled by Next.js bundler, not tsc)
declare module "*.css" {
  const content: Record<string, string>;
  export default content;
}
